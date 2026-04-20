"use server";

import { auth } from "@clerk/nextjs/server";
import type { AppState, Habit } from "@/lib/types";
import {
  serverDeferredSnapshotSyncEnabled,
  serverDuoCloudDataEnabled,
} from "@/lib/duo-cloud";
import {
  DuoActionError,
  requireClerkUserId,
  requireCoupleMember,
  requireDuoContext,
} from "@/lib/server/duo-auth";
import { getServiceSupabase } from "@/lib/server/supabase-admin";
import { getAppStateForClerkId } from "@/lib/server/duo-state";
import { generateInviteCode } from "@/lib/server/invite-code";
import {
  habitToInsert,
  rowToCompletion,
  rowToHabit,
  rowToMilestone,
} from "@/lib/server/duo-mappers";
import { syncMilestonesForCompletion } from "@/lib/server/duo-milestone-sync";
import { addDays, diffDays, todayKey, toDateKey } from "@/lib/date";

export type DuoActionResult<T = AppState> =
  | { ok: true; data: T }
  | { ok: false; code: string; message: string };

function err(e: unknown): DuoActionResult<never> {
  if (e instanceof DuoActionError) {
    return { ok: false, code: e.code, message: e.message };
  }
  const message = e instanceof Error ? e.message : "Unknown error";
  return { ok: false, code: "error", message };
}

function missingColumn(e: { message?: string } | null | undefined, column: string): boolean {
  const msg = String(e?.message ?? "").toLowerCase();
  const col = column.toLowerCase();
  return (
    (msg.includes("column") && msg.includes(col)) ||
    msg.includes(`${col} does not exist`) ||
    msg.includes(`.${col} does not exist`) ||
    msg.includes(`'${col}'`)
  );
}

function missingRelation(e: { message?: string } | null | undefined, relation: string): boolean {
  const msg = String(e?.message ?? "").toLowerCase();
  const rel = relation.toLowerCase();
  return (
    msg.includes("could not find") &&
    (msg.includes(`'${rel}'`) ||
      msg.includes(rel) ||
      msg.includes(`public.${rel}`))
  );
}

export async function getBootstrapStateAction(): Promise<
  DuoActionResult<AppState | null>
> {
  try {
    if (!serverDuoCloudDataEnabled()) {
      return { ok: true, data: null };
    }
    const { userId } = await auth();
    if (!userId) return { ok: true, data: null };
    const state = await getAppStateForClerkId(userId);
    return { ok: true, data: state };
  } catch (e) {
    return err(e);
  }
}

export async function provisionDuoUserAction(input: {
  name: string;
  emoji: string;
}): Promise<DuoActionResult<AppState>> {
  try {
    const clerkId = await requireClerkUserId();
    const supabase = getServiceSupabase()!;
    const nextRefill = addDays(new Date(), 14).toISOString();
    const { error } = await supabase.from("users").upsert(
      {
        clerk_id: clerkId,
        name: input.name.trim() || "You",
        emoji: input.emoji,
        grace_enabled: true,
        streak_revives_remaining: 3,
        streak_revives_next_refill_at: nextRefill,
      },
      { onConflict: "clerk_id" },
    );
    if (error) return { ok: false, code: "db", message: error.message };
    const state = await getAppStateForClerkId(clerkId);
    if (!state?.me) {
      return { ok: false, code: "db", message: "User row missing after upsert" };
    }
    return { ok: true, data: state };
  } catch (e) {
    return err(e);
  }
}

export async function createCoupleAction(): Promise<DuoActionResult<AppState>> {
  try {
    const ctx = await requireDuoContext();
    const supabase = getServiceSupabase()!;
    if (ctx.coupleId) {
      const state = await getAppStateForClerkId(ctx.clerkId);
      return { ok: true, data: state! };
    }
    const code = generateInviteCode();
    const expires = addDays(new Date(), 14).toISOString();
    const { data: coupleRow, error: cErr } = await supabase
      .from("couples")
      .insert({ invite_code: code })
      .select("id, created_at, invite_code")
      .single();
    if (cErr || !coupleRow) {
      return { ok: false, code: "db", message: cErr?.message ?? "couple insert" };
    }
    const coupleId = coupleRow.id as string;
    const { error: mErr } = await supabase.from("couple_members").insert({
      couple_id: coupleId,
      user_id: ctx.userUuid,
      role: "member",
    });
    if (mErr) return { ok: false, code: "db", message: mErr.message };
    const { error: iErr } = await supabase.from("invites").insert({
      code,
      couple_id: coupleId,
      created_by: ctx.userUuid,
      expires_at: expires,
    });
    if (iErr) return { ok: false, code: "db", message: iErr.message };
    const state = await getAppStateForClerkId(ctx.clerkId);
    return { ok: true, data: state! };
  } catch (e) {
    return err(e);
  }
}

export async function joinCoupleAction(
  rawCode: string,
): Promise<DuoActionResult<AppState>> {
  try {
    const ctx = await requireDuoContext();
    const supabase = getServiceSupabase()!;
    const code = rawCode.trim().toUpperCase();
    if (!code) {
      return { ok: false, code: "bad_request", message: "Missing invite code" };
    }

    const { data: existingMembers } = await supabase
      .from("couple_members")
      .select("couple_id")
      .eq("user_id", ctx.userUuid);

    const { data: invite, error: invErr } = await supabase
      .from("invites")
      .select("*")
      .eq("code", code)
      .gt("expires_at", new Date().toISOString())
      .maybeSingle();

    if (invErr || !invite) {
      return { ok: false, code: "not_found", message: "Invalid or expired code" };
    }

    const targetCoupleId = invite.couple_id as string;

    if (existingMembers?.length) {
      const existingId = existingMembers[0].couple_id as string;
      if (existingId === targetCoupleId) {
        const state = await getAppStateForClerkId(ctx.clerkId);
        return { ok: true, data: state! };
      }
      return {
        ok: false,
        code: "bad_request",
        message: "Already in a different couple",
      };
    }

    const { data: alreadyMember } = await supabase
      .from("couple_members")
      .select("user_id")
      .eq("couple_id", targetCoupleId)
      .eq("user_id", ctx.userUuid)
      .maybeSingle();
    if (alreadyMember) {
      const state = await getAppStateForClerkId(ctx.clerkId);
      return { ok: true, data: state! };
    }

    const { error: joinErr } = await supabase.from("couple_members").insert({
      couple_id: targetCoupleId,
      user_id: ctx.userUuid,
      role: "member",
    });
    if (joinErr) return { ok: false, code: "db", message: joinErr.message };

    await supabase
      .from("invites")
      .update({ consumed_by: ctx.userUuid })
      .eq("code", code);

    const state = await getAppStateForClerkId(ctx.clerkId);
    return { ok: true, data: state! };
  } catch (e) {
    return err(e);
  }
}

export async function addHabitAction(
  input: Omit<Habit, "id" | "ownerId" | "createdAt">,
): Promise<DuoActionResult<AppState>> {
  try {
    const ctx = await requireDuoContext();
    if (!ctx.coupleId) {
      return { ok: false, code: "bad_request", message: "Create a couple first" };
    }
    const supabase = getServiceSupabase()!;
    const row = habitToInsert(input, ctx.userUuid, ctx.coupleId);
    const { error } = await supabase.from("habits").insert(row);
    if (error) return { ok: false, code: "db", message: error.message };
    const state = await getAppStateForClerkId(ctx.clerkId);
    return { ok: true, data: state! };
  } catch (e) {
    return err(e);
  }
}

export async function removeHabitAction(
  habitId: string,
): Promise<DuoActionResult<AppState>> {
  try {
    const ctx = await requireDuoContext();
    if (!ctx.coupleId) {
      return { ok: false, code: "bad_request", message: "No couple" };
    }
    const supabase = getServiceSupabase()!;
    const { data: habit } = await supabase
      .from("habits")
      .select("id, owner_id, couple_id")
      .eq("id", habitId)
      .eq("couple_id", ctx.coupleId)
      .maybeSingle();
    if (!habit || habit.owner_id !== ctx.userUuid) {
      return { ok: false, code: "unauthorized", message: "Not your habit" };
    }
    await requireCoupleMember(ctx.coupleId);
    const { error } = await supabase.from("habits").delete().eq("id", habitId);
    if (error) return { ok: false, code: "db", message: error.message };
    const state = await getAppStateForClerkId(ctx.clerkId);
    return { ok: true, data: state! };
  } catch (e) {
    return err(e);
  }
}

export async function updateHabitAction(
  habitId: string,
  patch: {
    name: string;
    visibility: Habit["visibility"];
    targetPerWeek?: number;
    breakGoalDays?: number;
  },
): Promise<DuoActionResult<AppState>> {
  try {
    const ctx = await requireDuoContext();
    if (!ctx.coupleId) {
      return { ok: false, code: "bad_request", message: "No couple" };
    }
    const supabase = getServiceSupabase()!;
    const { data: habit } = await supabase
      .from("habits")
      .select("*")
      .eq("id", habitId)
      .eq("couple_id", ctx.coupleId)
      .maybeSingle();
    if (!habit || habit.owner_id !== ctx.userUuid) {
      return { ok: false, code: "unauthorized", message: "Not your habit" };
    }
    const nextName = patch.name.trim();
    if (!nextName) {
      return { ok: false, code: "bad_request", message: "Habit name is required" };
    }
    const isFrequency = habit.type === "frequency";
    const targetPerWeek =
      patch.targetPerWeek != null ? Math.floor(patch.targetPerWeek) : null;
    const breakGoalDays =
      patch.breakGoalDays != null ? Math.floor(patch.breakGoalDays) : null;
    if (isFrequency) {
      if (!targetPerWeek || targetPerWeek < 1 || targetPerWeek > 7) {
        return {
          ok: false,
          code: "bad_request",
          message: "Times per week must be between 1 and 7",
        };
      }
    } else if (!breakGoalDays || breakGoalDays < 1 || breakGoalDays > 365) {
      return {
        ok: false,
        code: "bad_request",
        message: "Break goal days must be between 1 and 365",
      };
    }

    const updatePayload = isFrequency
      ? {
          name: nextName,
          visibility: patch.visibility,
          target_per_week: targetPerWeek,
          break_goal_days: null,
        }
      : {
          name: nextName,
          visibility: patch.visibility,
          break_goal_days: breakGoalDays,
        };
    const { error } = await supabase
      .from("habits")
      .update(updatePayload)
      .eq("id", habitId)
      .eq("couple_id", ctx.coupleId);
    if (error) return { ok: false, code: "db", message: error.message };
    const state = await getAppStateForClerkId(ctx.clerkId);
    return { ok: true, data: state! };
  } catch (e) {
    return err(e);
  }
}

function habitVisibleTo(h: Habit, userUuid: string): boolean {
  return h.visibility === "shared" || h.ownerId === userUuid;
}

export type CompletionMutationAction = "done" | "undone";

export type CompletionMutationData = {
  state: AppState;
  mutation: {
    operationId: string;
    applied: boolean;
    action: CompletionMutationAction;
    serverUpdatedAt: string;
    serverVersion: number;
  };
};

export async function toggleCompletionAction(input: {
  habitId: string;
  userId: string;
  date?: string;
  action?: CompletionMutationAction;
  operationId?: string;
  clientTimestamp?: string;
  deviceId?: string;
}): Promise<DuoActionResult<CompletionMutationData>> {
  try {
    const ctx = await requireDuoContext();
    if (!ctx.coupleId) {
      return { ok: false, code: "bad_request", message: "No couple" };
    }
    const supabase = getServiceSupabase()!;
    const date = input.date ?? todayKey();

    const { data: habitRow } = await supabase
      .from("habits")
      .select("*")
      .eq("id", input.habitId)
      .eq("couple_id", ctx.coupleId!)
      .maybeSingle();
    if (!habitRow) {
      return { ok: false, code: "not_found", message: "Habit not found" };
    }
    const habit = rowToHabit(habitRow as Parameters<typeof rowToHabit>[0]);
    if (!habitVisibleTo(habit, ctx.userUuid)) {
      return { ok: false, code: "unauthorized", message: "Habit not visible" };
    }
    if (input.userId !== ctx.userUuid) {
      return { ok: false, code: "unauthorized", message: "Cannot toggle for others" };
    }

    const operationId = input.operationId?.trim() || crypto.randomUUID();
    let legacyCompletionSchema = false;
    let existing:
      | {
          id: string;
          deleted_at?: string | null;
          operation_id?: string | null;
          version?: number | null;
        }
      | null = null;
    const { data: existingModern, error: existingErr } = await supabase
      .from("habit_completions")
      .select("id, deleted_at, operation_id, version")
      .eq("habit_id", input.habitId)
      .eq("user_id", input.userId)
      .eq("date", date)
      .maybeSingle();
    if (existingErr) {
      if (
        missingColumn(existingErr, "deleted_at") ||
        missingColumn(existingErr, "operation_id") ||
        missingColumn(existingErr, "version")
      ) {
        legacyCompletionSchema = true;
        const { data: existingLegacy, error: legacyErr } = await supabase
          .from("habit_completions")
          .select("id")
          .eq("habit_id", input.habitId)
          .eq("user_id", input.userId)
          .eq("date", date)
          .maybeSingle();
        if (legacyErr) return { ok: false, code: "db", message: legacyErr.message };
        existing = existingLegacy as { id: string } | null;
      } else {
        return { ok: false, code: "db", message: existingErr.message };
      }
    } else {
      existing = existingModern as
        | {
            id: string;
            deleted_at?: string | null;
            operation_id?: string | null;
            version?: number | null;
          }
        | null;
    }

    if (!legacyCompletionSchema && existing?.operation_id === operationId) {
      const state = await getAppStateForClerkId(ctx.clerkId);
      return {
        ok: true,
        data: {
          state: state!,
          mutation: {
            operationId,
            applied: false,
            action: input.action ?? "done",
            serverUpdatedAt: new Date().toISOString(),
            serverVersion: Number(existing.version ?? 1),
          },
        },
      };
    }

    const currentlyDone = legacyCompletionSchema
      ? Boolean(existing?.id)
      : Boolean(existing?.id && !existing.deleted_at);
    const desiredAction: CompletionMutationAction =
      input.action ?? (currentlyDone ? "undone" : "done");
    const shouldBeDone = desiredAction === "done";
    const applied = currentlyDone !== shouldBeDone;
    const serverUpdatedAt = new Date().toISOString();
    let serverVersion = Number(existing?.version ?? 0);

    if (!applied) {
      const state = await getAppStateForClerkId(ctx.clerkId);
      return {
        ok: true,
        data: {
          state: state!,
          mutation: {
            operationId,
            applied: false,
            action: desiredAction,
            serverUpdatedAt,
            serverVersion: Number(existing?.version ?? 1),
          },
        },
      };
    }

    if (shouldBeDone) {
      if (existing?.id) {
        if (!legacyCompletionSchema) {
          serverVersion += 1;
          const { error: upErr } = await supabase
            .from("habit_completions")
            .update({
              deleted_at: null,
              operation_id: operationId,
              actor_user_id: ctx.userUuid,
              device_id: input.deviceId ?? null,
              updated_at: serverUpdatedAt,
              version: serverVersion,
            })
            .eq("id", existing.id);
          if (upErr) return { ok: false, code: "db", message: upErr.message };
        }
      } else {
        serverVersion = 1;
        const completionInsert = legacyCompletionSchema
          ? {
              habit_id: input.habitId,
              user_id: input.userId,
              date,
            }
          : {
              habit_id: input.habitId,
              user_id: input.userId,
              date,
              deleted_at: null,
              operation_id: operationId,
              actor_user_id: ctx.userUuid,
              device_id: input.deviceId ?? null,
              updated_at: serverUpdatedAt,
              version: serverVersion,
            };
        const { error: insErr } = await supabase
          .from("habit_completions")
          .insert(completionInsert);
        if (insErr) return { ok: false, code: "db", message: insErr.message };
      }

      const { data: userRow } = await supabase
        .from("users")
        .select("grace_enabled")
        .eq("id", ctx.userUuid)
        .single();
      const grace = (userRow?.grace_enabled as boolean) ?? true;

      const compQuery = supabase
        .from("habit_completions")
        .select("*")
        .eq("habit_id", input.habitId)
        .eq("user_id", input.userId);
      const { data: compRows, error: compErr } = legacyCompletionSchema
        ? await compQuery
        : await compQuery.is("deleted_at", null);
      if (compErr) return { ok: false, code: "db", message: compErr.message };

      const completions = (compRows ?? []).map((r) =>
        rowToCompletion(r as Parameters<typeof rowToCompletion>[0]),
      );

      const { data: msRows } = await supabase
        .from("milestones")
        .select("*")
        .eq("habit_id", input.habitId)
        .eq("user_id", input.userId);

      const existingMs = (msRows ?? []).map((r) =>
        rowToMilestone(r as Parameters<typeof rowToMilestone>[0]),
      );

      await syncMilestonesForCompletion(
        supabase,
        habit,
        input.habitId,
        input.userId,
        completions,
        grace,
        existingMs,
      );
    } else if (existing?.id) {
      serverVersion += 1;
      const { error: delErr } = legacyCompletionSchema
        ? await supabase
            .from("habit_completions")
            .delete()
            .eq("id", existing.id)
        : await supabase
            .from("habit_completions")
            .update({
              deleted_at: serverUpdatedAt,
              operation_id: operationId,
              actor_user_id: ctx.userUuid,
              device_id: input.deviceId ?? null,
              updated_at: serverUpdatedAt,
              version: serverVersion,
            })
            .eq("id", existing.id);
      if (delErr) return { ok: false, code: "db", message: delErr.message };
    }

    if (!legacyCompletionSchema) {
      const { error: evtErr } = await supabase.from("completion_events").insert({
        couple_id: ctx.coupleId,
        habit_id: input.habitId,
        user_id: input.userId,
        date,
        action: desiredAction,
        operation_id: operationId,
        actor_user_id: ctx.userUuid,
        device_id: input.deviceId ?? null,
        version: serverVersion,
        server_ts: serverUpdatedAt,
      });
      if (evtErr && !missingRelation(evtErr, "completion_events")) {
        return { ok: false, code: "db", message: evtErr.message };
      }
    }

    const state = await getAppStateForClerkId(ctx.clerkId);
    return {
      ok: true,
      data: {
        state: state!,
        mutation: {
          operationId,
          applied: true,
          action: desiredAction,
          serverUpdatedAt,
          serverVersion,
        },
      },
    };
  } catch (e) {
    return err(e);
  }
}

export async function revivePartnerMissAction(input: {
  partnerId: string;
  habitId: string;
  date: string;
}): Promise<DuoActionResult<AppState>> {
  try {
    const ctx = await requireDuoContext();
    if (!ctx.coupleId || !ctx.partnerUuid) {
      return { ok: false, code: "bad_request", message: "No partner" };
    }
    if (input.partnerId !== ctx.partnerUuid) {
      return { ok: false, code: "unauthorized", message: "Invalid partner" };
    }
    const supabase = getServiceSupabase()!;

    const { data: meRow } = await supabase
      .from("users")
      .select("*")
      .eq("id", ctx.userUuid)
      .single();
    const rev = (meRow?.streak_revives_remaining as number) ?? 0;
    if (rev <= 0) {
      return { ok: false, code: "bad_request", message: "No revives left" };
    }

    const { data: habitRow } = await supabase
      .from("habits")
      .select("*")
      .eq("id", input.habitId)
      .eq("couple_id", ctx.coupleId!)
      .maybeSingle();
    if (!habitRow) {
      return { ok: false, code: "not_found", message: "Habit not found" };
    }
    const habit = rowToHabit(habitRow as Parameters<typeof rowToHabit>[0]);
    if (habit.ownerId !== input.partnerId || habit.visibility !== "shared") {
      return { ok: false, code: "bad_request", message: "Invalid habit" };
    }
    if (habit.type === "frequency") {
      return { ok: false, code: "bad_request", message: "Not a daily habit" };
    }
    const today = todayKey();
    if (input.date >= today) {
      return { ok: false, code: "bad_request", message: "Revive available next day" };
    }
    const { data: dup } = await supabase
      .from("habit_completions")
      .select("id")
      .eq("habit_id", input.habitId)
      .eq("user_id", input.partnerId)
      .eq("date", input.date)
      .maybeSingle();
    if (dup) return { ok: false, code: "bad_request", message: "Already complete" };

    const habitFrom = toDateKey(new Date(habit.createdAt));
    if (diffDays(input.date, habitFrom) < 0) {
      return { ok: false, code: "bad_request", message: "Before habit start" };
    }

    const { error: upErr } = await supabase
      .from("users")
      .update({ streak_revives_remaining: rev - 1 })
      .eq("id", ctx.userUuid);
    if (upErr) return { ok: false, code: "db", message: upErr.message };

    const { error: insErr } = await supabase.from("habit_completions").insert({
      habit_id: input.habitId,
      user_id: input.partnerId,
      date: input.date,
    });
    if (insErr) return { ok: false, code: "db", message: insErr.message };

    const { data: partnerRow } = await supabase
      .from("users")
      .select("grace_enabled")
      .eq("id", input.partnerId)
      .single();
    const pGrace = (partnerRow?.grace_enabled as boolean) ?? true;

    const { data: compRows } = await supabase
      .from("habit_completions")
      .select("*")
      .eq("habit_id", input.habitId)
      .eq("user_id", input.partnerId);
    const completions = (compRows ?? []).map((r) =>
      rowToCompletion(r as Parameters<typeof rowToCompletion>[0]),
    );
    const { data: msRows } = await supabase
      .from("milestones")
      .select("*")
      .eq("habit_id", input.habitId)
      .eq("user_id", input.partnerId);
    const existingMs = (msRows ?? []).map((r) =>
      rowToMilestone(r as Parameters<typeof rowToMilestone>[0]),
    );
    await syncMilestonesForCompletion(
      supabase,
      habit,
      input.habitId,
      input.partnerId,
      completions,
      pGrace,
      existingMs,
    );

    const state = await getAppStateForClerkId(ctx.clerkId);
    return { ok: true, data: state! };
  } catch (e) {
    return err(e);
  }
}

export async function sendCheerAction(input: {
  toUserId: string;
  habitId?: string;
}): Promise<DuoActionResult<AppState>> {
  try {
    const ctx = await requireDuoContext();
    if (!ctx.coupleId || !ctx.partnerUuid) {
      return { ok: false, code: "bad_request", message: "No partner" };
    }
    if (input.toUserId !== ctx.partnerUuid) {
      return { ok: false, code: "unauthorized", message: "Cheer partner only" };
    }
    const supabase = getServiceSupabase()!;
    const { error } = await supabase.from("cheers").insert({
      from_user: ctx.userUuid,
      to_user: input.toUserId,
      habit_id: input.habitId ?? null,
    });
    if (error) return { ok: false, code: "db", message: error.message };
    const state = await getAppStateForClerkId(ctx.clerkId);
    return { ok: true, data: state! };
  } catch (e) {
    return err(e);
  }
}

export async function markCheersReadAction(): Promise<DuoActionResult<AppState>> {
  try {
    const ctx = await requireDuoContext();
    const supabase = getServiceSupabase()!;
    const now = new Date().toISOString();
    const { error } = await supabase
      .from("cheers")
      .update({ read_at: now })
      .eq("to_user", ctx.userUuid)
      .is("read_at", null);
    if (error) return { ok: false, code: "db", message: error.message };
    const state = await getAppStateForClerkId(ctx.clerkId);
    return { ok: true, data: state! };
  } catch (e) {
    return err(e);
  }
}

export async function saveDayExcitementAction(input: {
  stars: number;
  note: string;
}): Promise<DuoActionResult<AppState>> {
  try {
    const ctx = await requireDuoContext();
    const supabase = getServiceSupabase()!;
    const date = todayKey();
    const stars = Math.min(5, Math.max(1, Math.round(input.stars)));
    const note = input.note.trim().slice(0, 2000);
    const savedAt = new Date().toISOString();
    const { error } = await supabase.from("day_excitement").upsert(
      {
        user_id: ctx.userUuid,
        date,
        stars,
        note,
        saved_at: savedAt,
      },
      { onConflict: "user_id,date" },
    );
    if (error) return { ok: false, code: "db", message: error.message };
    const state = await getAppStateForClerkId(ctx.clerkId);
    return { ok: true, data: state! };
  } catch (e) {
    return err(e);
  }
}

export async function setGraceAction(enabled: boolean): Promise<DuoActionResult<AppState>> {
  try {
    const ctx = await requireDuoContext();
    const supabase = getServiceSupabase()!;
    const { error } = await supabase
      .from("users")
      .update({ grace_enabled: enabled })
      .eq("id", ctx.userUuid);
    if (error) return { ok: false, code: "db", message: error.message };
    const state = await getAppStateForClerkId(ctx.clerkId);
    return { ok: true, data: state! };
  } catch (e) {
    return err(e);
  }
}

/**
 * Destructive reset for current Duo data.
 * - If in a couple, deleting the couple cascades shared pair data (habits/completions/etc).
 * - Clears current user's profile row so onboarding starts fresh.
 */
export async function resetDuoAction(): Promise<DuoActionResult<null>> {
  try {
    const ctx = await requireDuoContext();
    const supabase = getServiceSupabase()!;

    if (ctx.coupleId) {
      const { error: coupleErr } = await supabase
        .from("couples")
        .delete()
        .eq("id", ctx.coupleId);
      if (coupleErr) return { ok: false, code: "db", message: coupleErr.message };
    }

    const { error: userErr } = await supabase
      .from("users")
      .delete()
      .eq("id", ctx.userUuid);
    if (userErr) return { ok: false, code: "db", message: userErr.message };

    return { ok: true, data: null };
  } catch (e) {
    return err(e);
  }
}

export type DeferredSnapshotPayload = {
  state: AppState;
  updatedAt: string;
};

/** Upsert full client AppState for the signed-in Clerk user (local-first mode). */
export async function pushDeferredSnapshotAction(
  payloadJson: string,
): Promise<DuoActionResult<{ updatedAt: string }>> {
  try {
    if (!serverDeferredSnapshotSyncEnabled()) {
      return {
        ok: false,
        code: "not_configured",
        message: "Deferred snapshot sync is not enabled",
      };
    }
    const clerkId = await requireClerkUserId();
    let parsed: unknown;
    try {
      parsed = JSON.parse(payloadJson) as unknown;
    } catch {
      return { ok: false, code: "bad_request", message: "Invalid JSON" };
    }
    const supabase = getServiceSupabase()!;
    const updatedAt = new Date().toISOString();
    const { error } = await supabase.from("duo_deferred_snapshots").upsert(
      {
        clerk_id: clerkId,
        payload: parsed,
        updated_at: updatedAt,
      },
      { onConflict: "clerk_id" },
    );
    if (error) return { ok: false, code: "db", message: error.message };
    return { ok: true, data: { updatedAt } };
  } catch (e) {
    return err(e);
  }
}

/** Latest snapshot for merge (server wins when newer than local meta). */
export async function pullDeferredSnapshotAction(): Promise<
  DuoActionResult<DeferredSnapshotPayload | null>
> {
  try {
    if (!serverDeferredSnapshotSyncEnabled()) {
      return { ok: true, data: null };
    }
    const clerkId = await requireClerkUserId();
    const supabase = getServiceSupabase()!;
    const { data, error } = await supabase
      .from("duo_deferred_snapshots")
      .select("payload, updated_at")
      .eq("clerk_id", clerkId)
      .maybeSingle();
    if (error) return { ok: false, code: "db", message: error.message };
    if (!data?.payload) return { ok: true, data: null };
    return {
      ok: true,
      data: {
        state: data.payload as AppState,
        updatedAt: data.updated_at as string,
      },
    };
  } catch (e) {
    return err(e);
  }
}
