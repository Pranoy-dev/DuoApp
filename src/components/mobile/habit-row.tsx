"use client";

import { Check } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useStore } from "@/lib/store";
import { streakFor, weekProgress } from "@/lib/streak";
import { habitIntent, type Habit } from "@/lib/types";
import { todayKey } from "@/lib/date";

type Props = {
  habit: Habit;
  userId: string;
  interactive?: boolean;
  showOwner?: string;
};

export function HabitRow({
  habit,
  userId,
  interactive = true,
  showOwner,
}: Props) {
  const { state, toggleCompletion } = useStore();
  const me = state.me;
  const graceEnabled = me?.graceEnabled ?? true;
  const info = streakFor(habit, state.completions, userId, graceEnabled);
  const today = todayKey();
  const doneToday = state.completions.some(
    (c) => c.habitId === habit.id && c.userId === userId && c.date === today,
  );
  const resolvedIntent = habitIntent(habit);
  const isBreak =
    resolvedIntent === "break" &&
    habit.breakGoalDays != null &&
    habit.type === "daily";
  const weekInfo =
    habit.type === "frequency"
      ? weekProgress(habit, state.completions, userId)
      : null;

  const onToggle = () => {
    if (!interactive) return;
    void toggleCompletion(habit.id, userId).catch((e: unknown) => {
      toast.error(e instanceof Error ? e.message : "Could not sync this change.");
    });
    if (typeof navigator !== "undefined" && "vibrate" in navigator) {
      try {
        navigator.vibrate(doneToday ? 8 : [6, 18, 10]);
      } catch {
        // haptics are progressive enhancement
      }
    }
  };

  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={!interactive}
      aria-pressed={doneToday}
      className={cn(
        "group flex w-full items-center gap-3 rounded-2xl border border-border/60 bg-card/90 p-3 text-left transition-all",
        interactive &&
          "active:scale-[0.99] hover:border-foreground/20 hover:shadow-sm",
        !interactive && "opacity-95",
      )}
    >
      <span
        aria-hidden
        className="flex size-11 items-center justify-center rounded-xl bg-muted/80 text-xl"
      >
        {habit.emoji}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span className="truncate text-[15px] font-semibold">
            {habit.name}
          </span>
          {habit.visibility === "solo" && (
            <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
              Solo
            </span>
          )}
        </span>
        <span className="mt-0.5 flex items-center gap-1.5 text-[12px] text-muted-foreground">
          {isBreak ? (
            <span>
              {Math.min(info.current, habit.breakGoalDays!)} /{" "}
              {habit.breakGoalDays}{" "}
              {habit.breakGoalDays === 1 ? "day" : "days"}
            </span>
          ) : info.current > 0 ? (
            <span>
              {info.current} {info.unit}
              {info.current === 1 ? "" : "s"} streak
            </span>
          ) : (
            <span>Start today</span>
          )}
          {weekInfo && (
            <span aria-hidden>
              · {weekInfo.count}/{weekInfo.target} this week
            </span>
          )}
          {showOwner && <span aria-hidden>· {showOwner}</span>}
        </span>
      </span>
      <span
        aria-hidden
        className={cn(
          "relative flex size-9 shrink-0 items-center justify-center rounded-full border transition-all",
          doneToday
            ? "border-transparent bg-foreground text-background"
            : "border-border/80 bg-background text-muted-foreground group-hover:border-foreground/40",
        )}
      >
        <Check
          className={cn(
            "size-4 transition-all",
            doneToday ? "opacity-100 scale-100" : "opacity-0 scale-75",
          )}
          strokeWidth={2.75}
        />
      </span>
    </button>
  );
}
