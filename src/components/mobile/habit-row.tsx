"use client";

import { type MouseEvent, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
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
import { HabitHistoryDialog } from "@/components/mobile/habit-history-dialog";

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
  const [historyOpen, setHistoryOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showTickPulse, setShowTickPulse] = useState(false);
  const tickPulseTimeoutRef = useRef<number | null>(null);
  const [draft, setDraft] = useState(() => ({
    name: habit.name,
    visibility: habit.visibility,
    timesPerWeek: habit.targetPerWeek ?? 4,
    breakGoalDays: habit.breakGoalDays ?? 30,
  }));
  const doneToday = state.completions.some(
    (c) => c.habitId === habit.id && c.userId === userId && c.date === today,
  );
  const completionDisabled = !interactive;
  const totalCompletions = state.completions.filter(
    (c) => c.habitId === habit.id && c.userId === userId,
  ).length;
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
  }, [doneToday, habit.breakGoalDays, habit.type, info, isBreak, weekInfo]);


  const onToggleCompletion = (event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    if (!interactive) return;
    void toggleCompletion(habit.id, userId)
      .catch((e: unknown) => {
        toast.error(e instanceof Error ? e.message : "Could not sync this change.");
      });
    if (!doneToday) {
      setShowTickPulse(true);
      if (tickPulseTimeoutRef.current != null) {
        window.clearTimeout(tickPulseTimeoutRef.current);
      }
      tickPulseTimeoutRef.current = window.setTimeout(() => {
        setShowTickPulse(false);
      }, 420);
    }
    if (typeof navigator !== "undefined" && "vibrate" in navigator) {
      try {
        navigator.vibrate(doneToday ? 8 : [6, 18, 10]);
      } catch {
        // haptics are progressive enhancement
      }
    }
  };

  useEffect(() => {
    return () => {
      if (tickPulseTimeoutRef.current != null) {
        window.clearTimeout(tickPulseTimeoutRef.current);
      }
    };
  }, []);

  const canEdit = Boolean(me && habit.ownerId === me.id && interactive);
  const habitStillExists = state.habits.some((h) => h.id === habit.id);
  const targetValid =
    habit.type === "frequency"
      ? Number.isFinite(draft.timesPerWeek) &&
        draft.timesPerWeek >= 1 &&
        draft.timesPerWeek <= 7
      : Number.isFinite(draft.breakGoalDays) &&
        draft.breakGoalDays >= 1 &&
        draft.breakGoalDays <= 365;
  const dirty = useMemo(() => {
    if (draft.name.trim() !== habit.name) return true;
    if (draft.visibility !== habit.visibility) return true;
    if (habit.type === "frequency") {
      return Math.floor(draft.timesPerWeek) !== Math.floor(habit.targetPerWeek ?? 0);
    }
    return Math.floor(draft.breakGoalDays) !== Math.floor(habit.breakGoalDays ?? 0);
  }, [draft, habit]);
  const canSave = canEdit && targetValid && draft.name.trim().length > 0 && dirty && !saving;

  const onSave = async () => {
    if (!canSave) return;
    setSaving(true);
    try {
      await updateHabit(habit.id, {
        name: draft.name.trim(),
        visibility: draft.visibility,
        targetPerWeek: habit.type === "frequency" ? Math.floor(draft.timesPerWeek) : undefined,
        breakGoalDays: habit.type === "daily" ? Math.floor(draft.breakGoalDays) : undefined,
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
        onClick={
          canEdit
            ? () => setOpen(true)
            : undefined
        }
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
        <button
          type="button"
          aria-label={`Open history for ${habit.name}`}
          onClick={(event) => {
            event.stopPropagation();
            setHistoryOpen(true);
          }}
          onKeyDown={(event) => {
            event.stopPropagation();
          }}
          className={cn(
            "relative z-[1] flex size-11 flex-col items-center justify-center rounded-xl bg-muted/80 transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/45",
            doneToday &&
              "bg-foreground text-background shadow-sm ring-1 ring-foreground/20",
          )}
        >
          <span className="text-base font-semibold leading-none tabular-nums">
            {Math.max(totalCompletions, 1)}
          </span>
        </button>
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
            disabled={completionDisabled}
            aria-pressed={doneToday}
            className={cn(
              "relative z-[2] flex size-9 shrink-0 items-center justify-center rounded-full border transition-all active:scale-95",
              doneToday
                ? "border-transparent bg-foreground text-background shadow-[0_8px_22px_-14px_rgba(0,0,0,0.7)] ring-1 ring-foreground/10"
                : "border-border/80 bg-background text-muted-foreground group-hover:border-foreground/40",
            )}
          >
            <AnimatePresence>
              {showTickPulse ? (
                <motion.span
                  aria-hidden
                  className="pointer-events-none absolute inset-0 rounded-full border border-foreground/45"
                  initial={{ opacity: 0.45, scale: 0.85 }}
                  animate={{ opacity: 0, scale: 1.34 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.38, ease: "easeOut" }}
                />
              ) : null}
            </AnimatePresence>
            <motion.span
              initial={false}
              animate={
                doneToday
                  ? { opacity: 1, scale: 1, rotate: 0 }
                  : { opacity: 0, scale: 0.72, rotate: -12 }
              }
              transition={{
                type: "spring",
                stiffness: 420,
                damping: 26,
                mass: 0.75,
              }}
            >
              <Check className="size-4" strokeWidth={2.75} />
            </motion.span>
          </button>
        ) : null}
      </div>

      <Dialog
        open={open && habitStillExists}
        onOpenChange={(nextOpen) => {
          if (nextOpen) {
            setDraft({
              name: habit.name,
              visibility: habit.visibility,
              timesPerWeek: habit.targetPerWeek ?? 4,
              breakGoalDays: habit.breakGoalDays ?? 30,
            });
          }
          setOpen(nextOpen);
        }}
      >
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
              <Input value={draft.name} onChange={(e) => setDraft((prev) => ({ ...prev, name: e.target.value }))} />
            </label>
            <div className="grid gap-2">
              <p className="text-xs font-medium text-muted-foreground">Visibility</p>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setDraft((prev) => ({ ...prev, visibility: "shared" }))}
                  className={cn(
                    "rounded-2xl border px-3 py-3 text-left text-sm font-semibold transition-colors",
                    draft.visibility === "shared"
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
                  onClick={() => setDraft((prev) => ({ ...prev, visibility: "solo" }))}
                  className={cn(
                    "rounded-2xl border px-3 py-3 text-left text-sm font-semibold transition-colors",
                    draft.visibility === "solo"
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
                      onClick={() => setDraft((prev) => ({ ...prev, timesPerWeek: n }))}
                      className={cn(
                        "min-w-[2.5rem] flex-1 rounded-xl border py-2 text-sm font-medium transition-colors",
                        draft.timesPerWeek === n
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
                  value={draft.breakGoalDays}
                  onChange={(e) => setDraft((prev) => ({ ...prev, breakGoalDays: Number(e.target.value) }))}
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

      <HabitHistoryDialog
        open={historyOpen}
        onOpenChange={setHistoryOpen}
        habit={habit}
        userId={userId}
        completions={state.completions}
      />
    </>
  );
}
