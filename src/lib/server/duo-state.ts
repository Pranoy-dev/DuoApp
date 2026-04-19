import type { AppState, Habit } from "@/lib/types";
import { getServiceSupabase } from "@/lib/server/supabase-admin";
import {
  coupleFromRows,
  rowToCheer,
  rowToCompletion,
  rowToDayExcitement,
  rowToHabit,
  rowToJournal,
  rowToMilestone,
  rowToPerson,
} from "@/lib/server/duo-mappers";

const EMPTY_SLICE = {
  habits: [] as Habit[],
  completions: [] as AppState["completions"],
  cheers: [] as AppState["cheers"],
  milestones: [] as AppState["milestones"],
  journal: [] as AppState["journal"],
  dayExcitement: [] as AppState["dayExcitement"],
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
    const { data: completionRows } = await supabase
      .from("habit_completions")
      .select("*")
      .in("habit_id", habitIds);
    completions = (completionRows ?? [])
      .filter((r) => habitIdSet.has(r.habit_id as string))
      .map((r) =>
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
  if (habitIds.length > 0) {
    const { data: milestoneRows } = await supabase
      .from("milestones")
      .select("*")
      .in("user_id", memberIds)
      .in("habit_id", habitIds);
    milestones = (milestoneRows ?? []).map((r) =>
      rowToMilestone(r as Parameters<typeof rowToMilestone>[0]),
    );
  }

  const { data: journalRows } = await supabase
    .from("journal_entries")
    .select("*")
    .in("user_id", memberIds);

  const journal = (journalRows ?? []).map((r) =>
    rowToJournal(r as Parameters<typeof rowToJournal>[0]),
  );

  const { data: excRows } = await supabase
    .from("day_excitement")
    .select("*")
    .in("user_id", memberIds);

  const dayExcitement = (excRows ?? []).map((r) =>
    rowToDayExcitement(r as Parameters<typeof rowToDayExcitement>[0]),
  );

  return {
    me,
    couple,
    habits,
    completions,
    cheers,
    milestones,
    journal,
    dayExcitement,
  };
}
