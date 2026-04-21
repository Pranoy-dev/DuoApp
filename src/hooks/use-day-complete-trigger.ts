"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useStore } from "@/lib/store";
import { todayKey } from "@/lib/date";

export type DayCompleteTriggerState = {
  active: boolean;
  date: string;
  doneCount: number;
  totalHabits: number;
  acknowledge: () => void;
};

/**
 * Fires once on the edge transition from "not all done today" → "all done today".
 * If habits are unchecked and then completed again, it re-triggers.
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
      queueMicrotask(() => setActive(true));
    }
    if (prev && !allDone) {
      queueMicrotask(() => setActive(false));
    }
  }, [allDone, date, me, doneCount, totalHabits]);

  const acknowledge = useCallback(() => {
    setActive(false);
  }, []);

  return {
    active,
    date,
    doneCount,
    totalHabits,
    acknowledge,
  };
}
