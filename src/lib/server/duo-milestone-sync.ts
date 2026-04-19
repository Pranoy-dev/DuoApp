import type { Completion, Habit, MilestoneAchievement } from "@/lib/types";
import { MILESTONE_TIERS } from "@/lib/milestones";
import { streakFor } from "@/lib/streak";
import type { SupabaseClient } from "@supabase/supabase-js";

export async function syncMilestonesForCompletion(
  supabase: SupabaseClient,
  habit: Habit,
  habitId: string,
  userId: string,
  completions: Completion[],
  graceEnabled: boolean,
  existingMilestones: MilestoneAchievement[],
): Promise<void> {
  const info = streakFor(habit, completions, userId, graceEnabled);
  const already = new Set(
    existingMilestones
      .filter((m) => m.habitId === habitId && m.userId === userId)
      .map((m) => m.tier),
  );
  for (const tier of MILESTONE_TIERS) {
    if (info.current >= tier && !already.has(tier)) {
      const { error } = await supabase.from("milestones").insert({
        habit_id: habitId,
        user_id: userId,
        tier,
      });
      if (error && !error.message.includes("duplicate")) {
        console.error("milestone insert", error);
      }
    }
  }
}
