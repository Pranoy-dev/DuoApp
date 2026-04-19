export function toDateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function todayKey(): string {
  return toDateKey(new Date());
}

export function addDays(d: Date, days: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + days);
  return r;
}

export function diffDays(a: string, b: string): number {
  const aDate = new Date(`${a}T00:00:00`);
  const bDate = new Date(`${b}T00:00:00`);
  return Math.round((aDate.getTime() - bDate.getTime()) / 86_400_000);
}

export function monthKey(date: Date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

export function weekKey(date: Date = new Date(), weekStartsOn = 1): string {
  const d = new Date(date);
  const day = d.getDay();
  const offset = (day - weekStartsOn + 7) % 7;
  d.setDate(d.getDate() - offset);
  return toDateKey(d);
}

export function humanDate(date: Date = new Date()): string {
  return date.toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
}

/** Format a `YYYY-MM-DD` key for display (noon UTC avoids TZ edge shifts). */
export function formatDateKey(dateKey: string): string {
  return new Date(`${dateKey}T12:00:00`).toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}
