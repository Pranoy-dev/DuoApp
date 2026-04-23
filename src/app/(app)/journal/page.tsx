"use client";

import { useMemo, useState } from "react";
import { Plus, Star } from "lucide-react";
import { MobileScreen } from "@/components/mobile/mobile-screen";
import { Button } from "@/components/ui/button";
import {
  JOURNAL_CAUSE_BUCKETS,
  getDailyJournalPrompt,
  normalizeBucketLabel,
  preselectCauseBuckets,
  sortBucketsByRecency,
} from "@/lib/journal";
import { useStore } from "@/lib/store";
import { todayKey } from "@/lib/date";
import { cn } from "@/lib/utils";

const STAR_MAX = 5;
const MOOD_MIN = 1;
const MOOD_MAX = 10;
const CHART_WIDTH = 340;
const CHART_HEIGHT = 170;
const CHART_PAD = 22;

function StarRow({
  value,
  onChange,
  size = "lg",
  readOnly = false,
}: {
  value: number;
  onChange: (n: number) => void;
  size?: "lg" | "sm";
  readOnly?: boolean;
}) {
  const iconClass =
    size === "lg" ? "size-9 sm:size-10" : "size-5 text-amber-500/90";
  return (
    <div
      className={cn(
        "flex items-center justify-center gap-1 sm:gap-1.5",
        readOnly && "pointer-events-none",
      )}
    >
      {Array.from({ length: STAR_MAX }, (_, i) => {
        const n = i + 1;
        const active = n <= value;
        const star = (
          <Star
            className={iconClass}
            strokeWidth={1.5}
            fill={active ? "currentColor" : "none"}
          />
        );
        if (readOnly) {
          return (
            <span
              key={n}
              className={cn(
                "p-0.5",
                active ? "text-amber-500" : "text-muted-foreground/35",
              )}
            >
              {star}
            </span>
          );
        }
        return (
          <button
            key={n}
            type="button"
            aria-label={`${n} star${n === 1 ? "" : "s"}`}
            className={cn(
              "rounded-lg p-0.5 transition-transform active:scale-95",
              active ? "text-amber-500" : "text-muted-foreground/35",
            )}
            onClick={() => onChange(n)}
          >
            {star}
          </button>
        );
      })}
    </div>
  );
}

function formatHistoryDate(dateKey: string) {
  return new Date(`${dateKey}T12:00:00`).toLocaleDateString(undefined, {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function formatShortDate(dateKey: string) {
  return new Date(`${dateKey}T12:00:00`).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

function buildMoodPath(points: { x: number; y: number }[]) {
  if (!points.length) return "";
  return points
    .map((p, idx) => `${idx === 0 ? "M" : "L"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
    .join(" ");
}

export default function JournalPage() {
  const { state, saveDayExcitement, saveJournalEntry, createJournalUserBucket } =
    useStore();
  const me = state.me!;
  const today = todayKey();
  const dailyPrompt = useMemo(() => getDailyJournalPrompt(me.id, today), [me.id, today]);

  const todayEntry = useMemo(
    () =>
      state.dayExcitement.find((e) => e.userId === me.id && e.date === today),
    [state.dayExcitement, me.id, today],
  );
  const todayJournalEntry = useMemo(
    () =>
      state.journalEntries.find((e) => e.userId === me.id && e.date === today),
    [state.journalEntries, me.id, today],
  );

  /** When false and today is saved, the big check-in card is collapsed. */
  const [wantsToEdit, setWantsToEdit] = useState(false);
  const [wantsJournalEdit, setWantsJournalEdit] = useState(false);

  const formCollapsed = Boolean(todayEntry) && !wantsToEdit;
  const journalCollapsed = Boolean(todayJournalEntry) && !wantsJournalEdit;

  const [draft, setDraft] = useState({ stars: 0, note: "" });
  const [journalDraft, setJournalDraft] = useState({
    mood: 6,
    reflection: "",
    causeBuckets: ["Random"] as string[],
  });
  const [bucketTouched, setBucketTouched] = useState(false);
  const [addingBucket, setAddingBucket] = useState(false);
  const [customBucketDraft, setCustomBucketDraft] = useState("");
  const [showMoodTrend, setShowMoodTrend] = useState(false);

  const historyEntries = useMemo(() => {
    const list = [...(state.dayExcitement ?? [])].filter(
      (e) => e.userId === me.id,
    );
    const filtered =
      wantsToEdit && todayEntry
        ? list.filter((e) => e.date !== today)
        : list;
    return filtered.sort((a, b) => {
      const byDate = b.date.localeCompare(a.date);
      if (byDate !== 0) return byDate;
      return b.savedAt.localeCompare(a.savedAt);
    });
  }, [state.dayExcitement, me.id, today, wantsToEdit, todayEntry]);
  const journalHistory = useMemo(() => {
    const list = [...(state.journalEntries ?? [])].filter((e) => e.userId === me.id);
    const filtered =
      wantsJournalEdit && todayJournalEntry
        ? list.filter((e) => e.date !== today)
        : list;
    return filtered.sort((a, b) => {
      const byDate = b.date.localeCompare(a.date);
      if (byDate !== 0) return byDate;
      return b.savedAt.localeCompare(a.savedAt);
    });
  }, [state.journalEntries, me.id, today, wantsJournalEdit, todayJournalEntry]);

  const moodSeries = useMemo(() => {
    return [...(state.journalEntries ?? [])]
      .filter((e) => e.userId === me.id)
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(-45);
  }, [state.journalEntries, me.id]);

  const chartPoints = useMemo(() => {
    if (!moodSeries.length) return [];
    const span = Math.max(1, moodSeries.length - 1);
    return moodSeries.map((entry, idx) => {
      const x = CHART_PAD + (idx / span) * (CHART_WIDTH - CHART_PAD * 2);
      const y =
        CHART_PAD +
        ((MOOD_MAX - entry.mood) / (MOOD_MAX - MOOD_MIN)) * (CHART_HEIGHT - CHART_PAD * 2);
      return { x, y, entry };
    });
  }, [moodSeries]);

  const sortedBucketLabels = useMemo(() => {
    const custom = (state.journalUserBuckets ?? []).map((bucket) => bucket.label);
    const combined = Array.from(new Set([...JOURNAL_CAUSE_BUCKETS, ...custom]));
    return sortBucketsByRecency(combined, state.journalUserBuckets ?? []);
  }, [state.journalUserBuckets]);

  const canSave = draft.stars >= 1 && draft.stars <= STAR_MAX;
  const canSaveJournal =
    journalDraft.mood >= MOOD_MIN &&
    journalDraft.mood <= MOOD_MAX &&
    Boolean(journalDraft.reflection.trim()) &&
    journalDraft.causeBuckets.length > 0;
  const canAddCustomBucket = Boolean(customBucketDraft.trim());

  const handleSave = () => {
    if (!canSave) return;
    void (async () => {
      try {
        await saveDayExcitement({ stars: draft.stars, note: draft.note });
        setWantsToEdit(false);
      } catch {
        /* toast optional */
      }
    })();
  };
  const handleSaveJournal = () => {
    if (!canSaveJournal) return;
    void (async () => {
      try {
        await saveJournalEntry({
          mood: journalDraft.mood,
          promptId: dailyPrompt.id,
          promptText: dailyPrompt.text,
          reflection: journalDraft.reflection,
          causeBuckets: journalDraft.causeBuckets,
        });
        setWantsJournalEdit(false);
      } catch {
        /* toast optional */
      }
    })();
  };
  const handleCreateBucket = () => {
    if (!canAddCustomBucket) return;
    void (async () => {
      try {
        const clean = customBucketDraft.trim().replace(/\s+/g, " ").slice(0, 40);
        await createJournalUserBucket(clean);
        setBucketTouched(true);
        setJournalDraft((prev) => {
          const exists = prev.causeBuckets.some(
            (bucket) => normalizeBucketLabel(bucket) === normalizeBucketLabel(clean),
          );
          if (exists) return prev;
          return {
            ...prev,
            causeBuckets: [...prev.causeBuckets, clean].slice(0, 4),
          };
        });
        setCustomBucketDraft("");
        setAddingBucket(false);
      } catch {
        /* toast optional */
      }
    })();
  };

  const startEditing = () => {
    setDraft({
      stars: todayEntry?.stars ?? 0,
      note: todayEntry?.note ?? "",
    });
    setWantsToEdit(true);
  };
  const startJournalEditing = () => {
    setJournalDraft({
      mood: todayJournalEntry?.mood ?? 6,
      reflection: todayJournalEntry?.reflection ?? "",
      causeBuckets:
        todayJournalEntry?.causeBuckets.length
          ? todayJournalEntry.causeBuckets
          : ["Random"],
    });
    setBucketTouched(Boolean(todayJournalEntry?.causeBuckets.length));
    setAddingBucket(false);
    setCustomBucketDraft("");
    setWantsJournalEdit(true);
  };

  return (
    <MobileScreen
      eyebrow="Journal"
      title={showMoodTrend ? "Mood trend" : "How today feels"}
      trailing={
        <Button
          type="button"
          variant={showMoodTrend ? "default" : "outline"}
          size="sm"
          className="rounded-full"
          onClick={() => setShowMoodTrend((prev) => !prev)}
        >
          {showMoodTrend ? "Today" : "Trend"}
        </Button>
      }
    >
      {showMoodTrend ? (
        <section className="mt-1 rounded-2xl border border-border/60 bg-card/90 p-4">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              Mood trend
            </h2>
            <p className="text-[11px] text-muted-foreground">Last {moodSeries.length} entries</p>
          </div>
          {chartPoints.length < 2 ? (
            <div className="rounded-xl border border-dashed border-border bg-background/40 p-5 text-center">
              <p className="text-[14px] font-semibold">Add at least two check-ins</p>
              <p className="mt-1 text-[12px] text-muted-foreground">
                Your trend line appears as soon as you build history.
              </p>
            </div>
          ) : (
            <div className="mt-2 overflow-hidden rounded-xl border border-border/50 bg-background/60 p-2">
              <svg viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`} className="w-full">
                <defs>
                  <linearGradient id="moodLine" x1="0%" y1="0%" x2="100%" y2="0%">
                    <stop offset="0%" stopColor="#f97316" />
                    <stop offset="50%" stopColor="#eab308" />
                    <stop offset="100%" stopColor="#22c55e" />
                  </linearGradient>
                </defs>
                <path
                  d={buildMoodPath(chartPoints)}
                  fill="none"
                  stroke="url(#moodLine)"
                  strokeWidth={3}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                {chartPoints.map((point) => (
                  <g key={point.entry.id}>
                    <circle cx={point.x} cy={point.y} r={3.8} fill="#0f172a" />
                    <circle cx={point.x} cy={point.y} r={2.4} fill="#f8fafc" />
                    <title>{`${formatShortDate(point.entry.date)} • Mood ${point.entry.mood}`}</title>
                  </g>
                ))}
              </svg>
              <div className="mt-1 flex items-center justify-between px-1 text-[11px] text-muted-foreground">
                <span>{formatShortDate(moodSeries[0]!.date)}</span>
                <span>{formatShortDate(moodSeries[moodSeries.length - 1]!.date)}</span>
              </div>
            </div>
          )}
        </section>
      ) : (
        <>
      {!journalCollapsed ? (
        <section className="mt-1 overflow-hidden rounded-[28px] border border-white/20 bg-gradient-to-b from-white/70 to-white/30 p-4 shadow-[0_12px_35px_-20px_rgba(0,0,0,0.45)] backdrop-blur-md dark:from-white/[0.08] dark:to-white/[0.03]">
          <div className="flex items-center gap-2">
            <p className="text-[14px] font-semibold tracking-tight">Daily check-in</p>
          </div>
          <div className="mt-3 overflow-hidden rounded-2xl border border-border/60 bg-background/60">
            <label className="block px-3 py-3">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                  Mood dial
                </span>
                <span className="text-sm font-semibold text-foreground/90">
                  {journalDraft.mood}/10
                </span>
              </div>
              <div className="relative mt-3">
                <div className="pointer-events-none absolute inset-0 rounded-full bg-gradient-to-r from-rose-300/70 via-amber-300/70 to-emerald-400/70 blur-[1px]" />
                <input
                  type="range"
                  min={MOOD_MIN}
                  max={MOOD_MAX}
                  value={journalDraft.mood}
                  onChange={(e) =>
                    setJournalDraft((prev) => ({
                      ...prev,
                      mood: Number(e.target.value),
                    }))
                  }
                  className={cn(
                    "relative z-10 h-3 w-full cursor-pointer appearance-none rounded-full bg-gradient-to-r from-rose-300 via-amber-300 to-emerald-400",
                    "[&::-webkit-slider-thumb]:h-6 [&::-webkit-slider-thumb]:w-6 [&::-webkit-slider-thumb]:appearance-none",
                    "[&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border [&::-webkit-slider-thumb]:border-white/80",
                    "[&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:shadow-md [&::-webkit-slider-thumb]:transition-transform [&::-webkit-slider-thumb]:active:scale-110",
                    "[&::-moz-range-thumb]:h-6 [&::-moz-range-thumb]:w-6 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:bg-white",
                  )}
                />
              </div>
            </label>
            <label className="block border-t border-border/60 px-3 py-3">
              <p className="mt-1.5 text-[14px] leading-snug text-foreground/90">
                {dailyPrompt.text}
              </p>
              <textarea
                className="mt-2 min-h-[78px] w-full resize-y rounded-xl border border-border/80 bg-background/85 px-3 py-2 text-[14px] leading-relaxed outline-none ring-offset-background placeholder:text-muted-foreground/60 focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
                placeholder="Share your thoughts!"
                value={journalDraft.reflection}
                onChange={(e) =>
                  setJournalDraft((prev) => {
                    const reflection = e.target.value;
                    return {
                      ...prev,
                      reflection,
                      causeBuckets: bucketTouched
                        ? prev.causeBuckets
                        : preselectCauseBuckets(reflection),
                    };
                  })
                }
                maxLength={600}
              />
            </label>
            <div className="border-t border-border/60 px-3 py-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                Behind the mood
              </p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-7 rounded-full px-2.5 text-[11px]"
                onClick={() => setAddingBucket((prev) => !prev)}
              >
                <Plus className="mr-1 size-3.5" />
                Add bucket
              </Button>
            </div>
            {addingBucket ? (
              <div className="mt-2.5 flex items-center gap-2">
                <input
                  className="h-9 flex-1 rounded-lg border border-border/80 bg-background/90 px-2.5 text-[13px] outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
                  placeholder="Add custom bucket..."
                  value={customBucketDraft}
                  onChange={(e) => setCustomBucketDraft(e.target.value)}
                  maxLength={40}
                />
                <Button
                  type="button"
                  size="sm"
                  className="h-9 rounded-lg px-3"
                  disabled={!canAddCustomBucket}
                  onClick={handleCreateBucket}
                >
                  Save
                </Button>
              </div>
            ) : null}
            <div className="mt-3 flex flex-wrap gap-2">
              {sortedBucketLabels.map((bucket) => {
                const active = journalDraft.causeBuckets.some(
                  (selected) => normalizeBucketLabel(selected) === normalizeBucketLabel(bucket),
                );
                return (
                  <button
                    key={bucket}
                    type="button"
                    className={cn(
                      "rounded-full border px-3 py-1.5 text-[12px] font-medium transition-all duration-150 active:scale-[0.98]",
                      active
                        ? "border-primary/60 bg-primary/15 text-primary shadow-[0_6px_16px_-12px_rgba(59,130,246,0.9)]"
                        : "border-border/80 bg-background/85 text-muted-foreground hover:border-border hover:text-foreground/90",
                    )}
                    onClick={() => {
                      setBucketTouched(true);
                      setJournalDraft((prev) => {
                        const exists = prev.causeBuckets.some(
                          (selected) =>
                            normalizeBucketLabel(selected) === normalizeBucketLabel(bucket),
                        );
                        if (exists) {
                          const next = prev.causeBuckets.filter(
                            (selected) =>
                              normalizeBucketLabel(selected) !== normalizeBucketLabel(bucket),
                          );
                          return {
                            ...prev,
                            causeBuckets: next.length ? next : ["Random"],
                          };
                        }
                        return {
                          ...prev,
                          causeBuckets: [...prev.causeBuckets, bucket].slice(0, 4),
                        };
                      });
                    }}
                  >
                    {bucket}
                  </button>
                );
              })}
            </div>
            </div>
          </div>
          <Button
            type="button"
            className="mt-4 h-11 w-full rounded-xl text-[13px] font-semibold"
            disabled={!canSaveJournal}
            onClick={handleSaveJournal}
          >
            Check-in
          </Button>
        </section>
      ) : (
        <section className="mt-1 overflow-hidden rounded-[24px] border border-white/25 bg-gradient-to-b from-white/70 to-white/35 p-4 shadow-[0_12px_28px_-20px_rgba(0,0,0,0.45)] backdrop-blur-md dark:from-white/[0.08] dark:to-white/[0.03]">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                Daily check-in
              </p>
              <div className="mt-2">
                <div className="flex items-center justify-between text-[12px]">
                  <span className="font-medium text-muted-foreground">Mood</span>
                  <span className="font-semibold text-foreground">
                    {todayJournalEntry?.mood ?? "-"} / 10
                  </span>
                </div>
                <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-muted/80">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-rose-400 via-amber-400 to-emerald-500 transition-all duration-500"
                    style={{
                      width: `${Math.max(
                        0,
                        Math.min(100, ((todayJournalEntry?.mood ?? 0) / 10) * 100),
                      )}%`,
                    }}
                  />
                </div>
              </div>
              <p className="mt-3 text-[13px] leading-snug">
                {todayJournalEntry?.reflection || "No sentence saved."}
              </p>
              {(todayJournalEntry?.causeBuckets ?? []).length > 0 ? (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {(todayJournalEntry?.causeBuckets ?? []).map((bucket) => (
                    <span
                      key={bucket}
                      className="rounded-full border border-border/60 bg-background/75 px-2.5 py-1 text-[11px] text-muted-foreground"
                    >
                      {bucket}
                    </span>
                  ))}
                </div>
              ) : null}
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="shrink-0 rounded-full"
              onClick={startJournalEditing}
            >
              Edit
            </Button>
          </div>
        </section>
      )}

      {!formCollapsed ? (
        <section className="mt-4 rounded-2xl border border-border/60 bg-card/80 p-4">
          <p className="text-center text-[13px] font-semibold leading-snug">
            How excited are you about the day?
          </p>
          <div className="mt-3">
            <StarRow
              value={draft.stars}
              onChange={(stars) => setDraft((prev) => ({ ...prev, stars }))}
            />
          </div>
          <label className="mt-4 block">
            <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              Note (optional)
            </span>
            <textarea
              className="mt-1.5 min-h-[88px] w-full resize-y rounded-xl border border-border/80 bg-background/80 px-3 py-2 text-[14px] leading-relaxed outline-none ring-offset-background placeholder:text-muted-foreground/60 focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
              placeholder="Anything on your mind…"
              value={draft.note}
              onChange={(e) =>
                setDraft((prev) => ({ ...prev, note: e.target.value }))
              }
              maxLength={2000}
            />
          </label>
          <Button
            type="button"
            className="mt-3 w-full"
            disabled={!canSave}
            onClick={handleSave}
          >
            Save today
          </Button>
        </section>
      ) : (
        <section className="mt-4 rounded-2xl border border-border/60 bg-card/80 p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                Today
              </p>
              <div className="mt-2 flex justify-start">
                {todayEntry ? (
                  <StarRow
                    value={todayEntry.stars}
                    onChange={() => {}}
                    size="sm"
                    readOnly
                  />
                ) : null}
              </div>
              {todayEntry?.note ? (
                <p className="mt-2 line-clamp-3 text-[14px] leading-snug text-foreground">
                  {todayEntry.note}
                </p>
              ) : (
                <p className="mt-2 text-[13px] italic text-muted-foreground">
                  No note
                </p>
              )}
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="shrink-0"
              onClick={startEditing}
            >
              Edit
            </Button>
          </div>
        </section>
      )}

      <section className="mt-5">
        <h2 className="mb-2 px-0.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
          History
        </h2>
        {historyEntries.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border bg-card/60 p-6 text-center">
            <p className="text-[14px] font-semibold">Nothing here yet</p>
            <p className="mt-1 text-[12px] text-muted-foreground">
              Save how you feel today — it will show up in this list.
            </p>
          </div>
        ) : (
          <ul className="flex flex-col gap-2.5">
            {historyEntries.map((e) => (
              <li
                key={e.id}
                className="rounded-2xl border border-border/60 bg-card/80 px-4 py-3.5"
                aria-label={`${e.stars} out of ${STAR_MAX} stars`}
              >
                <div className="flex justify-center py-1">
                  <StarRow
                    value={e.stars}
                    onChange={() => {}}
                    size="sm"
                    readOnly
                  />
                </div>
                {e.note ? (
                  <p className="mt-2 text-[15px] font-medium leading-snug text-foreground">
                    {e.note}
                  </p>
                ) : (
                  <p className="mt-2 text-[13px] italic text-muted-foreground">
                    No note
                  </p>
                )}
                <p className="mt-2.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                  {formatHistoryDate(e.date)}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>

      {journalHistory.length > 0 ? (
        <section className="mt-5">
          <h2 className="mb-2 px-0.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            Journal history
          </h2>
          <ul className="flex flex-col gap-2.5">
            {journalHistory.slice(0, 12).map((entry) => (
              <li
                key={entry.id}
                className="rounded-2xl border border-border/60 bg-card/80 px-4 py-3.5"
              >
                <p className="text-[12px] font-semibold text-primary">Mood {entry.mood}/10</p>
                <p className="mt-1 text-[14px] leading-snug">{entry.reflection}</p>
                <p className="mt-2 text-[11px] text-muted-foreground">
                  {entry.causeBuckets.join(" • ")}
                </p>
                <p className="mt-2.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                  {formatHistoryDate(entry.date)}
                </p>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
        </>
      )}
    </MobileScreen>
  );
}
