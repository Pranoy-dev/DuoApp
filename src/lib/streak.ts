import type { Completion, Habit } from "./types";
import { addDays, diffDays, toDateKey, weekKey, monthKey } from "./date";

export type StreakInfo = {
  current: number;
  best: number;
  unit: "day" | "week";
  graceAvailable: boolean;
  usedGraceThisMonth: boolean;
};

function completionSet(completions: Completion[], habitId: string, userId: string) {
  return new Set(
    completions
      .filter((c) => c.habitId === habitId && c.userId === userId)
      .map((c) => c.date),
  );
}

export function dailyStreak(
  habit: Habit,
  completions: Completion[],
  userId: string,
  graceEnabled: boolean,
  now: Date = new Date(),
): StreakInfo {
  const set = completionSet(completions, habit.id, userId);
  const thisMonth = monthKey(now);
  let current = 0;
  const today = toDateKey(now);
  let cursor = set.has(today) ? today : toDateKey(addDays(now, -1));
  let graceUsed = false;
  while (true) {
    if (set.has(cursor)) {
      current += 1;
      cursor = toDateKey(addDays(new Date(`${cursor}T00:00:00`), -1));
      continue;
    }
    if (graceEnabled && !graceUsed && cursor.startsWith(`${thisMonth}-`)) {
      graceUsed = true;
      cursor = toDateKey(addDays(new Date(`${cursor}T00:00:00`), -1));
      continue;
    }
    break;
  }
  const best = bestDailyStreak(set);
  return {
    current,
    best,
    unit: "day",
    graceAvailable: graceEnabled && !graceUsed,
    usedGraceThisMonth: graceUsed,
  };
}

function bestDailyStreak(set: Set<string>): number {
  const sorted = [...set].sort();
  let best = 0;
  let run = 0;
  let prev: string | null = null;
  for (const d of sorted) {
    if (prev && diffDays(d, prev) === 1) run += 1;
    else run = 1;
    best = Math.max(best, run);
    prev = d;
  }
  return best;
}

export function weeklyStreak(
  habit: Habit,
  completions: Completion[],
  userId: string,
  now: Date = new Date(),
): StreakInfo {
  const target = habit.targetPerWeek ?? 1;
  const weekStartsOn = habit.weekStartsOn ?? 1;
  const ownCompletions = completions.filter(
    (c) => c.habitId === habit.id && c.userId === userId,
  );
  const byWeek = new Map<string, number>();
  for (const c of ownCompletions) {
    const wk = weekKey(new Date(`${c.date}T00:00:00`), weekStartsOn);
    byWeek.set(wk, (byWeek.get(wk) ?? 0) + 1);
  }
  let current = 0;
  let cursor = weekKey(now, weekStartsOn);
  const thisWeek = cursor;
  while (true) {
    const count = byWeek.get(cursor) ?? 0;
    const met = count >= target;
    if (met) {
      current += 1;
      const prev = new Date(`${cursor}T00:00:00`);
      prev.setDate(prev.getDate() - 7);
      cursor = weekKey(prev, weekStartsOn);
      continue;
    }
    if (cursor === thisWeek) {
      const prev = new Date(`${cursor}T00:00:00`);
      prev.setDate(prev.getDate() - 7);
      cursor = weekKey(prev, weekStartsOn);
      continue;
    }
    break;
  }
  let best = 0;
  let run = 0;
  const weeks = [...byWeek.entries()].sort(([a], [b]) => a.localeCompare(b));
  let prevWeek: string | null = null;
  for (const [wk, count] of weeks) {
    if (count < target) {
      run = 0;
      prevWeek = wk;
      continue;
    }
    if (prevWeek) {
      const prevDate = new Date(`${prevWeek}T00:00:00`);
      prevDate.setDate(prevDate.getDate() + 7);
      if (weekKey(prevDate, weekStartsOn) === wk) run += 1;
      else run = 1;
    } else {
      run = 1;
    }
    best = Math.max(best, run);
    prevWeek = wk;
  }
  return {
    current,
    best,
    unit: "week",
    graceAvailable: false,
    usedGraceThisMonth: false,
  };
}

export function streakFor(
  habit: Habit,
  completions: Completion[],
  userId: string,
  graceEnabled: boolean,
): StreakInfo {
  return habit.type === "daily"
    ? dailyStreak(habit, completions, userId, graceEnabled)
    : weeklyStreak(habit, completions, userId);
}

export function weekProgress(
  habit: Habit,
  completions: Completion[],
  userId: string,
  now: Date = new Date(),
): { count: number; target: number } {
  const target = habit.targetPerWeek ?? 1;
  const wk = weekKey(now, habit.weekStartsOn ?? 1);
  const count = completions.filter((c) => {
    if (c.habitId !== habit.id || c.userId !== userId) return false;
    return weekKey(new Date(`${c.date}T00:00:00`), habit.weekStartsOn ?? 1) === wk;
  }).length;
  return { count, target };
}
