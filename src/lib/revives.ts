import type { Person } from "./types";
import { addDays } from "./date";

const MS_14D = 14 * 86_400_000;
const MAX_REVIVES = 3;
const LOOP_GUARD = 500;

/**
 * Grant +1 revive for each elapsed 14-day window (cap 3). Always advances the
 * next-refill anchor past `now` so overdue windows do not stack grants later.
 */
export function replenishPersonRevives(
  person: Person,
  now: Date = new Date(),
): Person {
  let remaining = Math.min(
    MAX_REVIVES,
    person.streakRevivesRemaining ?? MAX_REVIVES,
  );
  let next = new Date(person.streakRevivesNextRefillAt);
  if (Number.isNaN(next.getTime())) {
    next = new Date(now.getTime() + MS_14D);
  }

  let guard = 0;
  while (now.getTime() >= next.getTime() && guard < LOOP_GUARD) {
    guard += 1;
    if (remaining < MAX_REVIVES) remaining += 1;
    next = addDays(next, 14);
  }

  return {
    ...person,
    streakRevivesRemaining: remaining,
    streakRevivesNextRefillAt: next.toISOString(),
  };
}
