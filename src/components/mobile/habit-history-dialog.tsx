"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { addDays, toDateKey } from "@/lib/date";
import type { Completion, Habit } from "@/lib/types";

type HabitHistoryDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  habit: Habit;
  userId: string;
  completions: Completion[];
};

const WEEKDAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function monthStart(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function monthLabel(date: Date): string {
  return date.toLocaleDateString(undefined, { month: "long", year: "numeric" });
}

function dateKey(date: Date): string {
  return toDateKey(new Date(date.getFullYear(), date.getMonth(), date.getDate()));
}

type CalendarCell = {
  key: string;
  day: number;
  dateKey: string;
  inMonth: boolean;
};

function buildMonthCells(anchorMonth: Date): CalendarCell[] {
  const firstDay = monthStart(anchorMonth);
  const firstWeekday = (firstDay.getDay() + 6) % 7;
  const gridStart = addDays(firstDay, -firstWeekday);
  return Array.from({ length: 42 }, (_, idx) => {
    const d = addDays(gridStart, idx);
    return {
      key: `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`,
      day: d.getDate(),
      dateKey: dateKey(d),
      inMonth: d.getMonth() === anchorMonth.getMonth(),
    };
  });
}

export function HabitHistoryDialog({
  open,
  onOpenChange,
  habit,
  userId,
  completions,
}: HabitHistoryDialogProps) {
  const [monthCursor, setMonthCursor] = useState(() => monthStart(new Date()));

  const completionSet = useMemo(
    () =>
      new Set(
        completions
          .filter((c) => c.habitId === habit.id && c.userId === userId)
          .map((c) => c.date),
      ),
    [completions, habit.id, userId],
  );
  const monthlyCells = useMemo(() => buildMonthCells(monthCursor), [monthCursor]);
  const totalCompletions = completionSet.size;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-3xl">
        <DialogHeader>
          <DialogTitle className="truncate">{habit.name}</DialogTitle>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="inline-block size-2 rounded-full bg-foreground" aria-hidden />
            <span>Completed day</span>
          </div>
        </DialogHeader>

        <section className="space-y-3">
          <div className="rounded-2xl border border-border/70 bg-card/80 p-3">
            <div className="mb-3 flex items-center justify-between">
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="size-8 rounded-full"
                aria-label="Show previous month"
                onClick={() =>
                  setMonthCursor((prev) => new Date(prev.getFullYear(), prev.getMonth() - 1, 1))
                }
              >
                <ChevronLeft className="size-4" />
              </Button>
              <p className="text-sm font-medium">{monthLabel(monthCursor)}</p>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="size-8 rounded-full"
                aria-label="Show next month"
                onClick={() =>
                  setMonthCursor((prev) => new Date(prev.getFullYear(), prev.getMonth() + 1, 1))
                }
              >
                <ChevronRight className="size-4" />
              </Button>
            </div>

            <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-medium text-muted-foreground">
              {WEEKDAY_LABELS.map((label) => (
                <span key={label}>{label}</span>
              ))}
            </div>
            <div className="mt-1 grid grid-cols-7 gap-1">
              {monthlyCells.map((cell) => {
                const completed = completionSet.has(cell.dateKey);
                return (
                  <span
                    key={cell.key}
                    className={cn(
                      "flex h-9 items-center justify-center rounded-lg text-[11px] font-medium",
                      cell.inMonth ? "text-foreground" : "text-muted-foreground/40",
                      completed && "bg-foreground text-background",
                    )}
                    aria-label={`${cell.dateKey}${completed ? " completed" : ""}`}
                  >
                    {cell.day}
                  </span>
                );
              })}
            </div>
          </div>

          {totalCompletions === 0 ? (
            <p className="text-xs text-muted-foreground">No history yet. Complete this habit to start your timeline.</p>
          ) : null}
        </section>
      </DialogContent>
    </Dialog>
  );
}
