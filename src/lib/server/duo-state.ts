import type { AppState, Habit } from "@/lib/types";
import { getServiceSupabase } from "@/lib/server/supabase-admin";
import {
  coupleFromRows,
  rowToCheer,
  rowToCompletion,
  rowToDayExcitement,
  rowToHabit,
  rowToJournalEntry,
  rowToJournalUserBucket,
  rowToMilestone,
  rowToPerson,
} from "@/lib/server/duo-mappers";

const EMPTY_SLICE = {
  habits: [] as Habit[],
  completions: [] as AppState["completions"],
  cheers: [] as AppState["cheers"],
  milestones: [] as AppState["milestones"],
  dayExcitement: [] as AppState["dayExcitement"],
  journalEntries: [] as AppState["journalEntries"],
  journalUserBuckets: [] as AppState["journalUserBuckets"],
};

function visibleHabitsForUser(habits: Habit[], currentUserUuid: string): Habit[] {
  return habits.filter(
    (h) => h.visibility === "shared" || h.ownerId === currentUserUuid,
  );
}

/** Load full AppState for a Clerk user from Postgres (service role + explicit scope). */
export async function getAppStateForClerkId(
  clerkId: string,
): Promise<AppState | null> {
  const supabase = getServiceSupabase();
  if (!supabase) return null;

  const { data: userRow, error: uErr } = await supabase
    .from("users")
    .select("*")
    .eq("clerk_id", clerkId)
    .maybeSingle();

  if (uErr || !userRow) {
    return {
      me: null,
      couple: null,
      ...EMPTY_SLICE,
    };
  }

  const me = rowToPerson(userRow as Parameters<typeof rowToPerson>[0]);

  const { data: memberRows } = await supabase
    .from("couple_members")
    .select("couple_id")
    .eq("user_id", me.id)
    .limit(1);

  if (!memberRows?.length) {
    return { me, couple: null, ...EMPTY_SLICE };
  }

  const coupleId = memberRows[0].couple_id as string;

  const { data: coupleRow, error: cErr } = await supabase
    .from("couples")
    .select("id, created_at, invite_code")
    .eq("id", coupleId)
    .maybeSingle();

  if (cErr || !coupleRow) {
    return { me, couple: null, ...EMPTY_SLICE };
  }

  const { data: allMemberRows } = await supabase
    .from("couple_members")
    .select("user_id")
    .eq("couple_id", coupleId);

  const memberIds = (allMemberRows ?? []).map((r) => r.user_id as string);
  if (!memberIds.length) {
    return { me, couple: null, ...EMPTY_SLICE };
  }

  const { data: peopleRows } = await supabase
    .from("users")
    .select("*")
    .in("id", memberIds);

  const members = (peopleRows ?? []).map((r) =>
    rowToPerson(r as Parameters<typeof rowToPerson>[0]),
  );

  const couple = coupleFromRows(
    coupleRow as {
      id: string;
      created_at: string;
      invite_code: string;
    },
    members,
  );

  const { data: habitRows } = await supabase
    .from("habits")
    .select("*")
    .eq("couple_id", coupleId);

  const allHabits = (habitRows ?? []).map((r) =>
    rowToHabit(r as Parameters<typeof rowToHabit>[0]),
  );
  const habits = visibleHabitsForUser(allHabits, me.id);
  const habitIdSet = new Set(habits.map((h) => h.id));
  const habitIds = [...habitIdSet];

  let completions: AppState["completions"] = [];
  if (habitIds.length > 0) {
    const { data: completionRowsModern, error: completionErr } = await supabase
      .from("habit_completions")
      .select("*")
      .in("habit_id", habitIds)
      .is("deleted_at", null);
    let rowsToMap = completionRowsModern;
    if (completionErr && String(completionErr.message).includes("deleted_at")) {
      const { data: legacyRows, error: legacyErr } = await supabase
        .from("habit_completions")
        .select("*")
        .in("habit_id", habitIds);
      if (legacyErr) return { me, couple, ...EMPTY_SLICE };
      rowsToMap = legacyRows;
    } else if (completionErr) {
      return { me, couple, ...EMPTY_SLICE };
    }
    completions = (rowsToMap ?? [])
      .filter((r: { habit_id: string }) => habitIdSet.has(r.habit_id as string))
      .map((r: Parameters<typeof rowToCompletion>[0]) =>
        rowToCompletion(r as Parameters<typeof rowToCompletion>[0]),
      );
  }

  const cheerOr = memberIds
    .flatMap((id) => [`from_user.eq.${id}`, `to_user.eq.${id}`])
    .join(",");
  const { data: cheerRows } = await supabase
    .from("cheers")
    .select("*")
    .or(cheerOr)
    .order("created_at", { ascending: false });

  const cheers = (cheerRows ?? []).map((r) =>
    rowToCheer(r as Parameters<typeof rowToCheer>[0]),
  );

  let milestones: AppState["milestones"] = [];
  const { data: milestoneRows } = await supabase
    .from("milestones")
    .select("*")
    .in("user_id", memberIds);
  milestones = (milestoneRows ?? []).map((r) =>
    rowToMilestone(r as Parameters<typeof rowToMilestone>[0]),
  );

  const { data: excRows } = await supabase
    .from("day_excitement")
    .select("*")
    .in("user_id", memberIds);

  const dayExcitement = (excRows ?? []).map((r) =>
    rowToDayExcitement(r as Parameters<typeof rowToDayExcitement>[0]),
  );

  const { data: journalRows } = await supabase
    .from("journal_entries")
    .select("*")
    .in("user_id", memberIds);

  const journalEntries = (journalRows ?? []).map((r) =>
    rowToJournalEntry(r as Parameters<typeof rowToJournalEntry>[0]),
  );

  const { data: bucketRows } = await supabase
    .from("journal_user_buckets")
    .select("*")
    .eq("user_id", me.id)
    .order("last_selected_at", { ascending: false, nullsFirst: false });

  const journalUserBuckets = (bucketRows ?? []).map((r) =>
    rowToJournalUserBucket(r as Parameters<typeof rowToJournalUserBucket>[0]),
  );

  return {
    me,
    couple,
    habits,
    completions,
    cheers,
    milestones,
    dayExcitement,
    journalEntries,
    journalUserBuckets,
  };
}

async function getStateCursor(args: {
  coupleId: string;
  memberIds: string[];
  habitIds: string[];
}): Promise<string> {
  const supabase = getServiceSupabase();
  if (!supabase) return new Date(0).toISOString();
  const stamps: string[] = [];
  const collect = (value: string | null | undefined) => {
    if (typeof value === "string" && value) stamps.push(value);
  };

  const { data: coupleRow } = await supabase
    .from("couples")
    .select("created_at")
    .eq("id", args.coupleId)
    .maybeSingle();
  collect(coupleRow?.created_at as string | undefined);

  const { data: memberRows } = await supabase
    .from("couple_members")
    .select("created_at")
    .eq("couple_id", args.coupleId);
  for (const row of memberRows ?? []) collect(row.created_at as string | undefined);

  const { data: userRows } = await supabase
    .from("users")
    .select("updated_at")
    .in("id", args.memberIds);
  for (const row of userRows ?? []) collect(row.updated_at as string | undefined);

  const { data: habitRows } = await supabase
    .from("habits")
    .select("updated_at")
    .eq("couple_id", args.coupleId);
  for (const row of habitRows ?? []) collect(row.updated_at as string | undefined);

  if (args.habitIds.length > 0) {
    const { data: completionRows } = await supabase
      .from("habit_completions")
      .select("updated_at")
      .in("habit_id", args.habitIds)
      .order("updated_at", { ascending: false })
      .limit(2000);
    for (const row of completionRows ?? []) collect(row.updated_at as string | undefined);

  }

  const { data: milestoneRows } = await supabase
    .from("milestones")
    .select("achieved_at")
    .in("user_id", args.memberIds);
  for (const row of milestoneRows ?? []) collect(row.achieved_at as string | undefined);

  const cheerOr = args.memberIds
    .flatMap((id) => [`from_user.eq.${id}`, `to_user.eq.${id}`])
    .join(",");
  if (cheerOr) {
    const { data: cheerRows } = await supabase
      .from("cheers")
      .select("created_at,read_at")
      .or(cheerOr)
      .order("created_at", { ascending: false })
      .limit(2000);
    for (const row of cheerRows ?? []) {
      collect(row.created_at as string | undefined);
      collect(row.read_at as string | undefined);
    }
  }

  const { data: excitementRows } = await supabase
    .from("day_excitement")
    .select("saved_at")
    .in("user_id", args.memberIds)
    .order("saved_at", { ascending: false })
    .limit(500);
  for (const row of excitementRows ?? []) collect(row.saved_at as string | undefined);

  const { data: journalRows } = await supabase
    .from("journal_entries")
    .select("saved_at")
    .in("user_id", args.memberIds)
    .order("saved_at", { ascending: false })
    .limit(500);
  for (const row of journalRows ?? []) collect(row.saved_at as string | undefined);

  const { data: bucketRows } = await supabase
    .from("journal_user_buckets")
    .select("created_at,last_selected_at")
    .in("user_id", args.memberIds)
    .order("last_selected_at", { ascending: false })
    .limit(500);
  for (const row of bucketRows ?? []) {
    collect(row.created_at as string | undefined);
    collect(row.last_selected_at as string | undefined);
  }

  return stamps.length ? stamps.sort().at(-1)! : new Date(0).toISOString();
}

export async function getDeltaAppStateForClerkId(
  clerkId: string,
  sinceCursor: string | null,
): Promise<{ state: AppState | null; cursor: string; changed: boolean }> {
  const state = await getAppStateForClerkId(clerkId);
  if (!state?.me || !state.couple) {
    return {
      state,
      cursor: new Date().toISOString(),
      changed: true,
    };
  }
  const memberIds = state.couple.members.map((m) => m.id);
  const habitIds = state.habits.map((h) => h.id);
  const cursor = await getStateCursor({
    coupleId: state.couple.id,
    memberIds,
    habitIds,
  });
  const changed = !sinceCursor || cursor > sinceCursor;
  return { state, cursor, changed };
}
