"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { MobileScreen } from "@/components/mobile/mobile-screen";
import { HabitRow } from "@/components/mobile/habit-row";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { useStore } from "@/lib/store";
import { todayKey, humanDate } from "@/lib/date";
import { cn } from "@/lib/utils";
import type { HabitIntent } from "@/lib/types";

const DEFAULT_HABIT_EMOJI = "✦";

export default function TodayPage() {
  const { state, addHabit } = useStore();
  const me = state.me!;
  const today = todayKey();
  const myHabits = state.habits.filter((h) => h.ownerId === me.id);
  const doneCount = myHabits.filter((h) =>
    state.completions.some(
      (c) => c.habitId === h.id && c.userId === me.id && c.date === today,
    ),
  ).length;
  const totalHabits = myHabits.length;
  return (
    <MobileScreen
      eyebrow={humanDate()}
      title={me.name.split(" ")[0] ?? me.name}
      trailing={<AddHabitButton onAdd={addHabit} />}
    >
      <section>
        <header className="mb-2 flex items-baseline justify-between px-0.5">
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            Today&apos;s habits
          </h2>
          <span className="text-[11px] font-medium text-muted-foreground">
            {doneCount}/{totalHabits || 0} done
          </span>
        </header>
        {myHabits.length === 0 ? (
          <EmptyHabits onAdd={addHabit} />
        ) : (
          <ul className="flex flex-col gap-2">
            {myHabits.map((h) => (
              <li key={h.id}>
                <HabitRow habit={h} userId={me.id} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </MobileScreen>
  );
}

function EmptyHabits({
  onAdd,
}: {
  onAdd: ReturnType<typeof useStore>["addHabit"];
}) {
  return (
    <div className="rounded-3xl border border-dashed border-border bg-card/60 p-8 text-center">
      <p className="text-base font-semibold">Add your first habit</p>
      <p className="mt-1 text-sm text-muted-foreground">
        Tiny and specific is best. “Read 10 minutes” beats “read more”.
      </p>
      <div className="mt-5 flex justify-center">
        <AddHabitButton onAdd={onAdd} label="Create a habit" />
      </div>
    </div>
  );
}

function AddHabitButton({
  onAdd,
  label,
}: {
  onAdd: ReturnType<typeof useStore>["addHabit"];
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [mode, setMode] = useState<HabitIntent>("build");
  const [timesPerWeek, setTimesPerWeek] = useState(4);
  const [breakGoalDays, setBreakGoalDays] = useState(30);
  const [shared, setShared] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const resetForm = () => {
    setName("");
    setMode("build");
    setTimesPerWeek(4);
    setBreakGoalDays(30);
    setShared(true);
  };

  const submit = async () => {
    if (submitting) return;
    const trimmed = name.trim();
    if (!trimmed) return;

    setSubmitting(true);
    try {
      if (mode === "build") {
        if (timesPerWeek < 1 || timesPerWeek > 7) return;
        await onAdd({
          name: trimmed,
          emoji: DEFAULT_HABIT_EMOJI,
          type: "frequency",
          intent: "build",
          visibility: shared ? "shared" : "solo",
          targetPerWeek: timesPerWeek,
          weekStartsOn: 1,
        });
      } else {
        const n = Math.floor(breakGoalDays);
        if (n < 1 || n > 365) return;
        await onAdd({
          name: trimmed,
          emoji: DEFAULT_HABIT_EMOJI,
          type: "daily",
          intent: "break",
          visibility: shared ? "shared" : "solo",
          breakGoalDays: n,
        });
      }
      setOpen(false);
      resetForm();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save habit");
    } finally {
      setSubmitting(false);
    }
  };

  const breakGoalValid =
    Number.isFinite(breakGoalDays) &&
    Math.floor(breakGoalDays) >= 1 &&
    Math.floor(breakGoalDays) <= 365;

  const canSubmit =
    name.trim().length > 0 &&
    (mode === "build"
      ? timesPerWeek >= 1 && timesPerWeek <= 7
      : breakGoalValid);

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (submitting && !o) return;
        setOpen(o);
        if (!o) {
          resetForm();
          setSubmitting(false);
        }
      }}
    >
      <DialogTrigger asChild>
        {label ? (
          <Button>{label}</Button>
        ) : (
          <Button
            size="icon"
            variant="secondary"
            className="size-10 rounded-full shadow-sm"
            aria-label="Add habit"
          >
            <Plus className="size-5" />
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="rounded-3xl">
        <DialogHeader>
          <DialogTitle>New habit</DialogTitle>
          <DialogDescription className="sr-only">
            Create a building habit with a weekly target, or a breaking habit with
            a consecutive-day goal.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <Input
            id="habit-name"
            aria-label="Habit name"
            placeholder="Meditate 10 minutes"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
          />

          <div className="grid gap-2">
            <p className="text-xs font-medium text-muted-foreground">Type</p>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setMode("build")}
                className={cn(
                  "rounded-2xl border px-3 py-3 text-left text-sm font-semibold transition-colors",
                  mode === "build"
                    ? "border-foreground bg-foreground text-background"
                    : "border-border hover:border-foreground/40",
                )}
              >
                Building
                <span className="mt-0.5 block text-xs font-normal opacity-80">
                  Times per week
                </span>
              </button>
              <button
                type="button"
                onClick={() => setMode("break")}
                className={cn(
                  "rounded-2xl border px-3 py-3 text-left text-sm font-semibold transition-colors",
                  mode === "break"
                    ? "border-foreground bg-foreground text-background"
                    : "border-border hover:border-foreground/40",
                )}
              >
                Breaking
                <span className="mt-0.5 block text-xs font-normal opacity-80">
                  Consecutive days to goal
                </span>
              </button>
            </div>
          </div>

          {mode === "build" ? (
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
            <div className="grid gap-2">
              <label
                htmlFor="break-goal-days"
                className="text-xs font-medium text-muted-foreground"
              >
                Goal (consecutive days)
              </label>
              <Input
                id="break-goal-days"
                type="number"
                inputMode="numeric"
                min={1}
                max={365}
                aria-label="Consecutive days to break the habit"
                value={breakGoalDays}
                onChange={(e) => setBreakGoalDays(Number(e.target.value))}
              />
            </div>
          )}

          <div className="flex items-center justify-between rounded-2xl border border-border bg-muted/40 px-4 py-3">
            <div>
              <p className="text-sm font-medium">Shared with partner</p>
              <p className="text-xs text-muted-foreground">
                They can see progress and cheer you on.
              </p>
            </div>
            <Switch checked={shared} onCheckedChange={setShared} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={!canSubmit || submitting}>
            {submitting ? "Adding..." : "Add habit"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
