import type {
  Cheer,
  Completion,
  Couple,
  DayExcitementEntry,
  Habit,
  MilestoneAchievement,
  Person,
} from "@/lib/types";
import { habitIntent } from "@/lib/types";
const MS_14D = 14 * 86_400_000;

type UserRow = {
  id: string;
  name: string;
  emoji: string;
  grace_enabled: boolean;
  streak_revives_remaining: number | null;
  streak_revives_next_refill_at: string | null;
};

type HabitRow = {
  id: string;
  owner_id: string;
  couple_id: string;
  name: string;
  emoji: string;
  type: string;
  visibility: string;
  target_per_week: number | null;
  week_starts_on: number | null;
  intent: string | null;
  break_goal_days: number | null;
  created_at: string;
};

export function rowToPerson(row: UserRow): Person {
  const nextRefill =
    row.streak_revives_next_refill_at ??
    new Date(Date.now() + MS_14D).toISOString();
  return {
    id: row.id,
    name: row.name,
    emoji: row.emoji,
    graceEnabled: row.grace_enabled ?? true,
    streakRevivesRemaining: row.streak_revives_remaining ?? 3,
    streakRevivesNextRefillAt: nextRefill,
  };
}

export function rowToHabit(row: HabitRow): Habit {
  const h: Habit = {
    id: row.id,
    ownerId: row.owner_id,
    name: row.name,
    emoji: row.emoji,
    type: row.type as Habit["type"],
    intent: (row.intent as Habit["intent"]) ?? "build",
    visibility: row.visibility as Habit["visibility"],
    targetPerWeek: row.target_per_week ?? undefined,
    weekStartsOn: row.week_starts_on ?? undefined,
    breakGoalDays: row.break_goal_days ?? undefined,
    createdAt: row.created_at,
  };
  return { ...h, intent: habitIntent(h) };
}

export function habitToInsert(
  h: Omit<Habit, "id" | "ownerId" | "createdAt">,
  ownerId: string,
  coupleId: string,
) {
  return {
    owner_id: ownerId,
    couple_id: coupleId,
    name: h.name,
    emoji: h.emoji,
    type: h.type,
    visibility: h.visibility,
    target_per_week: h.targetPerWeek ?? null,
    week_starts_on: h.weekStartsOn ?? 1,
    intent: h.intent,
    break_goal_days: h.breakGoalDays ?? null,
  };
}

export function coupleFromRows(
  coupleRow: { id: string; created_at: string; invite_code: string },
  members: Person[],
): Couple {
  return {
    id: coupleRow.id,
    createdAt: coupleRow.created_at,
    inviteCode: coupleRow.invite_code,
    members,
  };
}

export function rowToCompletion(row: {
  id: string;
  habit_id: string;
  user_id: string;
  date: string;
}): Completion {
  return {
    id: row.id,
    habitId: row.habit_id,
    userId: row.user_id,
    date: row.date,
  };
}

export function rowToCheer(row: {
  id: string;
  from_user: string;
  to_user: string;
  habit_id: string | null;
  read_at: string | null;
  created_at: string;
}): Cheer {
  return {
    id: row.id,
    fromUserId: row.from_user,
    toUserId: row.to_user,
    habitId: row.habit_id ?? undefined,
    createdAt: row.created_at,
    read: Boolean(row.read_at),
  };
}

export function rowToMilestone(row: {
  id: string;
  habit_id: string;
  user_id: string;
  tier: number;
  achieved_at: string;
}): MilestoneAchievement {
  return {
    id: row.id,
    habitId: row.habit_id,
    userId: row.user_id,
    tier: row.tier,
    achievedAt: row.achieved_at,
  };
}

export function rowToDayExcitement(row: {
  id: string;
  user_id: string;
  date: string;
  stars: number;
  note: string;
  saved_at: string;
}): DayExcitementEntry {
  return {
    id: row.id,
    userId: row.user_id,
    date: row.date,
    stars: row.stars,
    note: row.note ?? "",
    savedAt: row.saved_at,
  };
}
