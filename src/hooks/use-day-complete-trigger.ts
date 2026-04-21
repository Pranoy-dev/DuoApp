"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useStore } from "@/lib/store";
import { todayKey } from "@/lib/date";
import {
  hasSeenCelebrationFor,
  markCelebrationSeen,
} from "@/lib/quotes-storage";

export type DayCompleteTriggerState = {
  active: boolean;
  date: string;
  doneCount: number;
  totalHabits: number;
  acknowledge: () => void;
};

/**
 * Fires once on the edge transition from "not all done today" → "all done today".
 * Re-completing after an uncheck does not re-trigger the same date, and refreshes
 * don't replay it (a seen-flag is persisted per-date per-scope).
 */
export function useDayCompleteTrigger(): DayCompleteTriggerState {
  const { state } = useStore();
  const me = state.me;
  const date = todayKey();

  const { doneCount, totalHabits, allDone } = useMemo(() => {
    if (!me) {
      return { doneCount: 0, totalHabits: 0, allDone: false };
    }
    const myHabits = state.habits.filter((h) => h.ownerId === me.id);
    if (myHabits.length === 0) {
      return { doneCount: 0, totalHabits: 0, allDone: false };
    }
    const done = myHabits.filter((h) =>
      state.completions.some(
        (c) => c.habitId === h.id && c.userId === me.id && c.date === date,
      ),
    ).length;
    return {
      doneCount: done,
      totalHabits: myHabits.length,
      allDone: done === myHabits.length,
    };
  }, [me, state.habits, state.completions, date]);

  const [active, setActive] = useState(false);
  const prevAllDoneRef = useRef<boolean | null>(null);
  const prevDateRef = useRef<string>(date);

  useEffect(() => {
    if (prevDateRef.current !== date) {
      prevDateRef.current = date;
      prevAllDoneRef.current = null;
      queueMicrotask(() => setActive(false));
    }
  }, [date]);

  useEffect(() => {
    if (!me) {
      prevAllDoneRef.current = null;
      return;
    }
    const prev = prevAllDoneRef.current;
    prevAllDoneRef.current = allDone;
    if (prev === null) return;
    if (!prev && allDone) {
      if (!hasSeenCelebrationFor(date)) {
        queueMicrotask(() => setActive(true));
      }
    }
    if (prev && !allDone) {
      queueMicrotask(() => setActive(false));
    }
  }, [allDone, date, me]);

  const acknowledge = useCallback(() => {
    markCelebrationSeen(date);
    setActive(false);
  }, [date]);

  return {
    active,
    date,
    doneCount,
    totalHabits,
    acknowledge,
  };
}
