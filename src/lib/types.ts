export type HabitType = "daily" | "frequency";
export type HabitIntent = "build" | "break";
export type HabitVisibility = "solo" | "shared";
export type QuoteTone =
  | "stoic"
  | "self-compassion"
  | "humor"
  | "athletic"
  | "creative";

export type Habit = {
  id: string;
  ownerId: string;
  name: string;
  emoji: string;
  type: HabitType;
  /** Build = grow a habit (frequency); break = abstain with a consecutive-day goal (daily + breakGoalDays). */
  intent: HabitIntent;
  visibility: HabitVisibility;
  targetPerWeek?: number;
  weekStartsOn?: number;
  /** When intent is "break": consecutive successful days goal. */
  breakGoalDays?: number;
  createdAt: string;
};

/** Legacy persisted habits may omit `intent`; infer before use. */
export function habitIntent(h: {
  intent?: HabitIntent;
  type: HabitType;
  breakGoalDays?: number;
}): HabitIntent {
  if (h.intent) return h.intent;
  if (h.type === "daily" && h.breakGoalDays != null) return "break";
  return "build";
}

export type Completion = {
  id: string;
  habitId: string;
  userId: string;
  date: string;
};

export type Cheer = {
  id: string;
  fromUserId: string;
  toUserId: string;
  habitId?: string;
  createdAt: string;
  read: boolean;
};

export type MilestoneAchievement = {
  id: string;
  habitId: string;
  userId: string;
  tier: number;
  achievedAt: string;
};

export type JournalEntry = {
  id: string;
  userId: string;
  date: string;
  quoteId: string;
  quoteText?: string;
  quoteAuthor?: string;
  quoteTone?: QuoteTone;
};

/** Daily excitement check-in (1–5 stars + optional note), one row per user per calendar day. */
export type DayExcitementEntry = {
  id: string;
  userId: string;
  date: string;
  stars: number;
  note: string;
  savedAt: string;
};

export type Person = {
  id: string;
  name: string;
  emoji: string;
  tone: QuoteTone;
  graceEnabled: boolean;
  /** How many streak revives you can spend for your partner (local cap 3). */
  streakRevivesRemaining: number;
  /** ISO time when the next +1 revive is granted (14-day cadence). */
  streakRevivesNextRefillAt: string;
};

export type Couple = {
  id: string;
  createdAt: string;
  inviteCode: string;
  members: Person[];
};

export type AppState = {
  me: Person | null;
  couple: Couple | null;
  habits: Habit[];
  completions: Completion[];
  cheers: Cheer[];
  milestones: MilestoneAchievement[];
  journal: JournalEntry[];
  dayExcitement: DayExcitementEntry[];
};
