"use client";

import { type MouseEvent, useEffect, useMemo, useState } from "react";
import { Check } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useStore } from "@/lib/store";
import { streakFor, weekProgress } from "@/lib/streak";
import { habitIntent, type Habit } from "@/lib/types";
import { todayKey } from "@/lib/date";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

type Props = {
  habit: Habit;
  userId: string;
  interactive?: boolean;
  showOwner?: string;
  showCompletionControl?: boolean;
  dateKey?: string;
};

export function HabitRow({
  habit,
  userId,
  interactive = true,
  showOwner,
  showCompletionControl = true,
  dateKey,
}: Props) {
  const { state, toggleCompletion, updateHabit, removeHabit } = useStore();
  const me = state.me;
  const graceEnabled = me?.graceEnabled ?? true;
  const info = streakFor(habit, state.completions, userId, graceEnabled);
  const today = dateKey ?? todayKey();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [name, setName] = useState(habit.name);
  const [visibility, setVisibility] = useState(habit.visibility);
  const [timesPerWeek, setTimesPerWeek] = useState(habit.targetPerWeek ?? 4);
  const [breakGoalDays, setBreakGoalDays] = useState(habit.breakGoalDays ?? 30);
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
  const remainingText = useMemo(() => {
    if (habit.type === "frequency" && weekInfo) {
      const left = Math.max(weekInfo.target - weekInfo.count, 0);
      return `${left} left this week`;
    }
    if (isBreak) {
      const goal = habit.breakGoalDays ?? 1;
      const left = Math.max(goal - info.current, 0);
      return `${left} day${left === 1 ? "" : "s"} left`;
    }
    const left = doneToday ? 0 : 1;
    return `${left} left today`;
  }, [doneToday, habit.breakGoalDays, habit.type, info.current, isBreak, weekInfo]);

  useEffect(() => {
    if (!open) return;
    setName(habit.name);
    setVisibility(habit.visibility);
    setTimesPerWeek(habit.targetPerWeek ?? 4);
    setBreakGoalDays(habit.breakGoalDays ?? 30);
  }, [open, habit]);

  useEffect(() => {
    if (!open) return;
    const exists = state.habits.some((h) => h.id === habit.id);
    if (!exists) setOpen(false);
  }, [open, state.habits, habit.id]);

  const onToggleCompletion = (event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
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

  const canEdit = Boolean(me && habit.ownerId === me.id && interactive);
  const targetValid =
    habit.type === "frequency"
      ? Number.isFinite(timesPerWeek) && timesPerWeek >= 1 && timesPerWeek <= 7
      : Number.isFinite(breakGoalDays) && breakGoalDays >= 1 && breakGoalDays <= 365;
  const dirty = useMemo(() => {
    if (name.trim() !== habit.name) return true;
    if (visibility !== habit.visibility) return true;
    if (habit.type === "frequency") {
      return Math.floor(timesPerWeek) !== Math.floor(habit.targetPerWeek ?? 0);
    }
    return Math.floor(breakGoalDays) !== Math.floor(habit.breakGoalDays ?? 0);
  }, [
    name,
    visibility,
    habit,
    timesPerWeek,
    breakGoalDays,
  ]);
  const canSave = canEdit && targetValid && name.trim().length > 0 && dirty && !saving;

  const onSave = async () => {
    if (!canSave) return;
    setSaving(true);
    try {
      await updateHabit(habit.id, {
        name: name.trim(),
        visibility,
        targetPerWeek: habit.type === "frequency" ? Math.floor(timesPerWeek) : undefined,
        breakGoalDays: habit.type === "daily" ? Math.floor(breakGoalDays) : undefined,
      });
      toast.success("Habit updated");
      setOpen(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not update habit.");
    } finally {
      setSaving(false);
    }
  };

  const onDelete = async () => {
    if (!canEdit) return;
    setDeleting(true);
    try {
      await removeHabit(habit.id);
      toast.success("Habit deleted");
      setOpen(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not delete habit.");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <>
      <div
        role={canEdit ? "button" : undefined}
        tabIndex={canEdit ? 0 : -1}
        onClick={canEdit ? () => setOpen(true) : undefined}
        onKeyDown={
          canEdit
            ? (e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  setOpen(true);
                }
              }
            : undefined
        }
        className={cn(
          "group relative flex w-full items-center gap-3 overflow-hidden rounded-2xl border border-border/60 bg-card/90 p-3 text-left transition-all",
          interactive &&
            "active:scale-[0.99] hover:border-foreground/20 hover:shadow-sm",
          !interactive && "opacity-95",
          canEdit && "cursor-pointer",
          doneToday && "border-border/50 bg-muted/45 text-muted-foreground",
        )}
      >
        <span
          aria-hidden
          className={cn(
            "relative z-[1] flex size-11 flex-col items-center justify-center rounded-xl bg-muted/80",
            doneToday &&
              "bg-foreground text-background shadow-sm ring-1 ring-foreground/20",
          )}
        >
          <span className="text-base font-semibold leading-none tabular-nums">
            {Math.max(info.current, 0)}
          </span>
        </span>
        <span
          className={cn(
            "min-w-0 flex-1",
            doneToday && "opacity-45",
          )}
        >
          <span className="flex items-center gap-2">
            <span
              className={cn(
                "truncate text-[15px] font-semibold",
                doneToday && "text-muted-foreground",
              )}
            >
              {habit.name}
            </span>
            {habit.visibility === "solo" && (
              <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                Solo
              </span>
            )}
          </span>
          <span
            className={cn(
              "mt-0.5 flex items-center gap-1.5 text-[12px] text-muted-foreground",
              doneToday && "text-muted-foreground/80",
            )}
          >
            <span>{remainingText}</span>
            {showOwner && <span aria-hidden>· {showOwner}</span>}
          </span>
        </span>
        {showCompletionControl ? (
          <button
            type="button"
            aria-label={doneToday ? "Mark habit as not done" : "Mark habit as done"}
            onClick={onToggleCompletion}
            disabled={!interactive}
            aria-pressed={doneToday}
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
          </button>
        ) : null}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="rounded-3xl">
          <DialogHeader>
            <DialogTitle>Edit habit</DialogTitle>
            <DialogDescription className="sr-only">
              Update habit details or delete this habit.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4">
            <label className="grid gap-1.5">
              <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                Name
              </span>
              <Input value={name} onChange={(e) => setName(e.target.value)} />
            </label>
            <div className="grid gap-2">
              <p className="text-xs font-medium text-muted-foreground">Visibility</p>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setVisibility("shared")}
                  className={cn(
                    "rounded-2xl border px-3 py-3 text-left text-sm font-semibold transition-colors",
                    visibility === "shared"
                      ? "border-foreground bg-foreground text-background"
                      : "border-border hover:border-foreground/40",
                  )}
                >
                  Shared
                  <span className="mt-0.5 block text-xs font-normal opacity-80">
                    Partner can see progress
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => setVisibility("solo")}
                  className={cn(
                    "rounded-2xl border px-3 py-3 text-left text-sm font-semibold transition-colors",
                    visibility === "solo"
                      ? "border-foreground bg-foreground text-background"
                      : "border-border hover:border-foreground/40",
                  )}
                >
                  Solo
                  <span className="mt-0.5 block text-xs font-normal opacity-80">
                    Private to you
                  </span>
                </button>
              </div>
            </div>
            {habit.type === "frequency" ? (
              <div className="grid gap-2">
                <p className="text-xs font-medium text-muted-foreground">
                  Times per week
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {[1, 2, 3, 4, 5, 6, 7].map((n) => (
                    <button
                      key={n}
                      type="button"
                      onClick={() => setTimesPerWeek(n)}
                      className={cn(
                        "min-w-[2.5rem] flex-1 rounded-xl border py-2 text-sm font-medium transition-colors",
                        timesPerWeek === n
                          ? "border-foreground bg-foreground text-background"
                          : "border-border hover:border-foreground/40",
                      )}
                    >
                      {n}×
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <label className="grid gap-2">
                <span className="text-xs font-medium text-muted-foreground">
                  Goal (consecutive days)
                </span>
                <Input
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={365}
                  value={breakGoalDays}
                  onChange={(e) => setBreakGoalDays(Number(e.target.value))}
                />
              </label>
            )}
          </div>
          <DialogFooter className="mt-2 grid grid-cols-2 gap-2">
            <Button
              type="button"
              variant="destructive"
              disabled={!canEdit || deleting || saving}
              onClick={() => void onDelete()}
            >
              {deleting ? "Deleting..." : "Delete"}
            </Button>
            <Button
              type="button"
              disabled={!canSave || deleting}
              onClick={() => void onSave()}
            >
              {saving ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
