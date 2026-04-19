export const MILESTONE_TIERS = [3, 7, 14, 30, 60, 100, 180, 365] as const;

export type MilestoneTier = (typeof MILESTONE_TIERS)[number];

export type MilestoneTheme = {
  tier: MilestoneTier;
  label: string;
  blurb: string;
  emoji: string;
  intensity: "pulse" | "sparkle" | "confetti" | "bloom";
};

export const MILESTONE_THEMES: Record<MilestoneTier, MilestoneTheme> = {
  3: {
    tier: 3,
    label: "First flame",
    blurb: "Three days in a row. You found the groove.",
    emoji: "✦",
    intensity: "pulse",
  },
  7: {
    tier: 7,
    label: "One full week",
    blurb: "A week of showing up. That's a rhythm.",
    emoji: "✶",
    intensity: "sparkle",
  },
  14: {
    tier: 14,
    label: "Fortnight",
    blurb: "Two weeks strong. This is becoming you.",
    emoji: "✹",
    intensity: "sparkle",
  },
  30: {
    tier: 30,
    label: "Thirty days",
    blurb: "A month of care. Real change territory.",
    emoji: "✺",
    intensity: "confetti",
  },
  60: {
    tier: 60,
    label: "Sixty days",
    blurb: "Past the hardest part. Momentum is yours.",
    emoji: "❈",
    intensity: "confetti",
  },
  100: {
    tier: 100,
    label: "One hundred",
    blurb: "A hundred days of choosing this.",
    emoji: "❁",
    intensity: "bloom",
  },
  180: {
    tier: 180,
    label: "Half a year",
    blurb: "Half a year. Look how far you came.",
    emoji: "❋",
    intensity: "bloom",
  },
  365: {
    tier: 365,
    label: "One full year",
    blurb: "A full orbit. Quietly extraordinary.",
    emoji: "✿",
    intensity: "bloom",
  },
};

export function latestMilestone(value: number): MilestoneTheme | null {
  let found: MilestoneTier | null = null;
  for (const t of MILESTONE_TIERS) {
    if (value >= t) found = t;
  }
  return found ? MILESTONE_THEMES[found] : null;
}

export function nextMilestone(value: number): MilestoneTier | null {
  for (const t of MILESTONE_TIERS) {
    if (value < t) return t;
  }
  return null;
}
