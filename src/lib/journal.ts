import type { JournalCauseBucket } from "@/lib/types";

export const JOURNAL_CAUSE_BUCKETS: JournalCauseBucket[] = [
  "Sleep",
  "Work",
  "Body",
  "Relationship",
  "Social",
  "Finance",
  "Purpose",
  "Random",
];

export const JOURNAL_PROMPTS = [
  {
    id: "mind-space",
    text: "What is taking up the most space in your head right now?",
  },
  {
    id: "today-feel",
    text: "What made today feel the way it did?",
  },
  {
    id: "energy-shift",
    text: "What shifted your energy most today?",
  },
  {
    id: "body-signal",
    text: "What did your body try to tell you today?",
  },
  {
    id: "most-moment",
    text: "Which moment stayed with you most and why?",
  },
  {
    id: "pulling-you",
    text: "What pulled your attention the most today?",
  },
] as const;

export type JournalPrompt = (typeof JOURNAL_PROMPTS)[number];

export function normalizeBucketLabel(input: string): string {
  return input.trim().replace(/\s+/g, " ").toLowerCase();
}

function stableHash(input: string): number {
  let hash = 0;
  for (let i = 0; i < input.length; i += 1) {
    hash = (hash * 31 + input.charCodeAt(i)) >>> 0;
  }
  return hash;
}

export function getDailyJournalPrompt(userId: string, dateKey: string): JournalPrompt {
  const seed = `${userId}:${dateKey}`;
  const index = stableHash(seed) % JOURNAL_PROMPTS.length;
  return JOURNAL_PROMPTS[index]!;
}

const BUCKET_KEYWORDS: Record<JournalCauseBucket, readonly string[]> = {
  Sleep: ["sleep", "tired", "rest", "awake", "insomnia", "nap", "bed"],
  Work: ["work", "office", "job", "meeting", "deadline", "task", "boss"],
  Body: ["body", "health", "pain", "sick", "workout", "gym", "energy", "headache"],
  Relationship: ["partner", "relationship", "boyfriend", "girlfriend", "wife", "husband", "love"],
  Social: ["friend", "social", "party", "people", "family", "hangout", "chat"],
  Finance: ["money", "finance", "budget", "rent", "bill", "salary", "debt", "expense"],
  Purpose: ["purpose", "meaning", "goal", "future", "direction", "motivation", "dream"],
  Random: [],
};

export function preselectCauseBuckets(reflection: string): JournalCauseBucket[] {
  const normalized = reflection.toLowerCase();
  if (!normalized.trim()) return ["Random"];

  const scored = JOURNAL_CAUSE_BUCKETS.map((bucket) => {
    const words = BUCKET_KEYWORDS[bucket];
    const score = words.reduce((sum, word) => {
      return sum + (normalized.includes(word) ? 1 : 0);
    }, 0);
    return { bucket, score };
  })
    .filter((item) => item.score > 0 && item.bucket !== "Random")
    .sort((a, b) => b.score - a.score);

  if (!scored.length) return ["Random"];
  return scored.slice(0, 3).map((item) => item.bucket);
}

export function sortBucketsByRecency<T extends { normalizedLabel: string; lastSelectedAt: string | null }>(
  labels: string[],
  recencyRows: T[],
): string[] {
  const byLabel = new Map(
    recencyRows.map((row) => [row.normalizedLabel, row.lastSelectedAt ?? ""]),
  );
  return [...labels].sort((a, b) => {
    const aKey = normalizeBucketLabel(a);
    const bKey = normalizeBucketLabel(b);
    const aTs = byLabel.get(aKey) ?? "";
    const bTs = byLabel.get(bKey) ?? "";
    if (aTs !== bTs) return bTs.localeCompare(aTs);
    return a.localeCompare(b);
  });
}
