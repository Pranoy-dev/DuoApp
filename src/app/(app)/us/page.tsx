"use client";

import { MobileScreen } from "@/components/mobile/mobile-screen";
import { useStore } from "@/lib/store";
import { streakFor } from "@/lib/streak";
import {
  MILESTONE_THEMES,
  MILESTONE_TIERS,
  latestMilestone,
  nextMilestone,
} from "@/lib/milestones";

export default function UsPage() {
  const { state } = useStore();
  const me = state.me!;
  const couple = state.couple;
  const partner = couple?.members.find((m) => m.id !== me.id);

  if (!couple || !partner) {
    return (
      <MobileScreen eyebrow="Us" title="A shared space">
        <div className="rounded-3xl border border-dashed border-border bg-card/60 p-8 text-center text-sm text-muted-foreground">
          Once your partner joins, combined stats and milestones will live here.
        </div>
      </MobileScreen>
    );
  }

  const sharedHabits = state.habits.filter((h) => h.visibility === "shared");
  const combinedStreakDays = sharedHabits.reduce((acc, h) => {
    const mine = streakFor(h, state.completions, me.id, me.graceEnabled).current;
    const theirs = streakFor(
      h,
      state.completions,
      partner.id,
      partner.graceEnabled,
    ).current;
    return acc + mine + theirs;
  }, 0);

  const longestShared = sharedHabits.reduce((best, h) => {
    const mine = streakFor(h, state.completions, me.id, me.graceEnabled).best;
    const theirs = streakFor(
      h,
      state.completions,
      partner.id,
      partner.graceEnabled,
    ).best;
    return Math.max(best, mine, theirs);
  }, 0);

  const sharedMilestoneCount = state.milestones.filter((m) => {
    const h = state.habits.find((x) => x.id === m.habitId);
    return h?.visibility === "shared";
  }).length;

  const coupleLevel = Math.floor(combinedStreakDays / 14) + 1;
  const levelProgress = (combinedStreakDays % 14) / 14;

  const recentMilestones = [...state.milestones]
    .sort((a, b) => b.achievedAt.localeCompare(a.achievedAt))
    .slice(0, 6);

  const latest = latestMilestone(longestShared);
  const next = nextMilestone(longestShared);

  return (
    <MobileScreen eyebrow="Us" title="Together">
      <section className="mb-3 mt-1 overflow-hidden rounded-2xl border border-border/60 bg-gradient-to-br from-duo-soft via-accent to-duo-soft p-4">
        <div className="flex items-end justify-between">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-foreground/70">
              Couple level
            </p>
            <p className="mt-1 text-4xl font-semibold leading-none tracking-tight">
              {coupleLevel}
            </p>
          </div>
          <p className="text-right text-[12px] text-foreground/70">
            {combinedStreakDays} combined
            <br />
            streak days
          </p>
        </div>
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-background/50">
          <div
            className="h-full rounded-full bg-foreground/80 transition-[width] duration-500"
            style={{ width: `${Math.round(levelProgress * 100)}%` }}
          />
        </div>
        <p className="mt-1.5 text-[11px] text-foreground/60">
          {Math.round((1 - levelProgress) * 14)} more to level{" "}
          {coupleLevel + 1}
        </p>
      </section>

      <section className="mb-4 grid grid-cols-2 gap-2.5">
        <Stat label="Longest shared" value={`${longestShared}d`} />
        <Stat label="Milestones hit" value={sharedMilestoneCount.toString()} />
      </section>

      <section className="mb-4">
        <h2 className="mb-2 px-0.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
          Milestone shelf
        </h2>
        <div className="rounded-2xl border border-border/60 bg-card/80 p-2.5">
          <div className="grid grid-cols-4 gap-1.5">
            {MILESTONE_TIERS.map((tier) => {
              const reached = state.milestones.some((m) => m.tier === tier);
              const theme = MILESTONE_THEMES[tier];
              return (
                <div
                  key={tier}
                  className={`flex aspect-square flex-col items-center justify-center rounded-xl transition-all ${
                    reached
                      ? "bg-gradient-to-br from-duo via-duo-soft to-accent text-duo-foreground shadow-sm"
                      : "bg-muted/60 text-muted-foreground"
                  }`}
                  aria-label={`${tier}-day milestone ${reached ? "reached" : "locked"}`}
                >
                  <span aria-hidden className="text-xl">
                    {theme.emoji}
                  </span>
                  <span className="mt-0.5 text-[9px] font-semibold uppercase tracking-wider">
                    {tier}d
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {latest && next && (
        <section className="mb-4 rounded-2xl border border-border/60 bg-card/80 p-4">
          <p className="text-[13px] font-semibold">Next up</p>
          <p className="mt-0.5 text-[12px] text-muted-foreground">
            {next - longestShared} more day
            {next - longestShared === 1 ? "" : "s"} to reach{" "}
            <span className="font-medium text-foreground">
              {MILESTONE_THEMES[next].label}
            </span>
            .
          </p>
        </section>
      )}

      <section>
        <h2 className="mb-2 px-0.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
          Recent celebrations
        </h2>
        {recentMilestones.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border bg-card/60 p-5 text-center text-[12px] text-muted-foreground">
            No milestones yet. Your first will land at 3 days.
          </div>
        ) : (
          <ul className="flex flex-col gap-2">
            {recentMilestones.map((m) => {
              const habit = state.habits.find((h) => h.id === m.habitId);
              const who = couple.members.find((p) => p.id === m.userId);
              const theme =
                MILESTONE_THEMES[m.tier as keyof typeof MILESTONE_THEMES];
              return (
                <li
                  key={m.id}
                  className="flex items-center gap-3 rounded-2xl border border-border/60 bg-card/80 p-2.5"
                >
                  <span
                    aria-hidden
                    className="flex size-9 items-center justify-center rounded-lg bg-gradient-to-br from-duo-soft to-accent text-lg"
                  >
                    {theme?.emoji ?? "✦"}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-semibold">
                      {theme?.label ?? `${m.tier} days`}
                    </p>
                    <p className="truncate text-[11px] text-muted-foreground">
                      {who?.name ?? "Someone"} · {habit?.name ?? "a habit"}
                    </p>
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    {new Date(m.achievedAt).toLocaleDateString()}
                  </p>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </MobileScreen>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-border/60 bg-card/80 p-3.5">
      <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
        {label}
      </p>
      <p className="mt-1 text-2xl font-semibold leading-none tracking-tight">
        {value}
      </p>
    </div>
  );
}
