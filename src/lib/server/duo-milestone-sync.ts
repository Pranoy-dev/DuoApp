import { addDays, toDateKey } from "@/lib/date";
import type { Completion, MilestoneAchievement } from "@/lib/types";
import { MILESTONE_TIERS } from "@/lib/milestones";
import type { SupabaseClient } from "@supabase/supabase-js";

function sharedCoupleStreakDays(
  completions: Completion[],
  memberIds: string[],
  asOfDate: string,
): number {
  if (memberIds.length < 2) return 0;
  const memberSet = new Set(memberIds);
  const doneByDate = new Map<string, Set<string>>();
  for (const c of completions) {
    if (!memberSet.has(c.userId)) continue;
    const bucket = doneByDate.get(c.date) ?? new Set<string>();
    bucket.add(c.userId);
    doneByDate.set(c.date, bucket);
  }

  let streak = 0;
  let cursor = asOfDate;
  while (true) {
    const done = doneByDate.get(cursor);
    const allMembersDone = memberIds.every((id) => done?.has(id));
    if (!allMembersDone) break;
    streak += 1;
    cursor = toDateKey(addDays(new Date(`${cursor}T00:00:00`), -1));
  }
  return streak;
}

export async function syncGlobalMilestonesForFirstDailyCompletion(
  supabase: SupabaseClient,
  userId: string,
  memberIds: string[],
  asOfDate: string,
  completions: Completion[],
  existingMilestones: MilestoneAchievement[],
): Promise<void> {
  const streak = sharedCoupleStreakDays(completions, memberIds, asOfDate);
  const already = new Set(existingMilestones.filter((m) => m.userId === userId).map((m) => m.tier));
  for (const tier of MILESTONE_TIERS) {
    if (streak >= tier && !already.has(tier)) {
      const { error } = await supabase.from("milestones").insert({
        user_id: userId,
        habit_id: null,
        tier,
      });
      if (error && !error.message.includes("duplicate")) {
        console.error("milestone insert", error);
      }
    }
  }
}
