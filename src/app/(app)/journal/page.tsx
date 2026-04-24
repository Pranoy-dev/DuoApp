"use client";

import { useEffect, useMemo, useState } from "react";
import { Plus } from "lucide-react";
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

const MOOD_MIN = 1;
const MOOD_MAX = 10;
const CHART_WIDTH = 340;
const CHART_HEIGHT = 170;
const CHART_PAD = 22;
const JOURNAL_SAVED_TODAY_KEY = "duo.journal.saved.v1";
const JOURNAL_SAVED_TODAY_DATA_KEY = "duo.journal.saved.data.v1";

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
  const { state, saveJournalEntry, createJournalUserBucket } =
    useStore();
  const me = state.me!;
  const today = todayKey();
  const dailyPrompt = useMemo(() => getDailyJournalPrompt(me.id, today), [me.id, today]);

  const todayJournalEntry = useMemo(
    () =>
      state.journalEntries.find((e) => e.userId === me.id && e.date === today),
    [state.journalEntries, me.id, today],
  );

  const [wantsJournalEdit, setWantsJournalEdit] = useState(false);
  const [savedTodayData, setSavedTodayData] = useState<{
    mood: number;
    reflection: string;
    causeBuckets: string[];
  } | null>(null);

  const todayDisplayEntry = todayJournalEntry
    ? {
        mood: todayJournalEntry.mood,
        reflection: todayJournalEntry.reflection,
        causeBuckets: todayJournalEntry.causeBuckets,
      }
    : savedTodayData;
  const hasSavedJournalToday = Boolean(todayDisplayEntry);
  const showJournalFocusMode = !hasSavedJournalToday || wantsJournalEdit;

  const [journalDraft, setJournalDraft] = useState({
    mood: 6,
    reflection: "",
    causeBuckets: ["Random"] as string[],
  });
  const [bucketTouched, setBucketTouched] = useState(false);
  const [addingBucket, setAddingBucket] = useState(false);
  const [customBucketDraft, setCustomBucketDraft] = useState("");
  const [showMoodTrend, setShowMoodTrend] = useState(false);
  const [isComposingReflection, setIsComposingReflection] = useState(false);
  const [suppressNextAutoExpand, setSuppressNextAutoExpand] = useState(false);

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

  const canSaveJournal =
    journalDraft.mood >= MOOD_MIN &&
    journalDraft.mood <= MOOD_MAX &&
    Boolean(journalDraft.reflection.trim()) &&
    journalDraft.causeBuckets.length > 0;
  const canAddCustomBucket = Boolean(customBucketDraft.trim());

  useEffect(() => {
    if (typeof window === "undefined") return;
    const key = `${JOURNAL_SAVED_TODAY_KEY}:${me.id}:${today}`;
    const dataKey = `${JOURNAL_SAVED_TODAY_DATA_KEY}:${me.id}:${today}`;
    if (todayJournalEntry) {
      queueMicrotask(() =>
        setSavedTodayData({
          mood: todayJournalEntry.mood,
          reflection: todayJournalEntry.reflection,
          causeBuckets: todayJournalEntry.causeBuckets,
        }),
      );
      try {
        window.localStorage.setItem(key, "1");
        window.localStorage.setItem(
          dataKey,
          JSON.stringify({
            mood: todayJournalEntry.mood,
            reflection: todayJournalEntry.reflection,
            causeBuckets: todayJournalEntry.causeBuckets,
          }),
        );
      } catch {
        // ignore write failures
      }
      return;
    }
    try {
      const raw = window.localStorage.getItem(dataKey);
      let parsedData: { mood: number; reflection: string; causeBuckets: string[] } | null =
        null;
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<{
          mood: number;
          reflection: string;
          causeBuckets: string[];
        }>;
        if (
          typeof parsed.mood === "number" &&
          typeof parsed.reflection === "string" &&
          Array.isArray(parsed.causeBuckets)
        ) {
          parsedData = {
            mood: Math.min(10, Math.max(1, Math.round(parsed.mood))),
            reflection: parsed.reflection,
            causeBuckets: parsed.causeBuckets
              .map((bucket) => String(bucket).trim())
              .filter(Boolean)
              .slice(0, 4),
          };
        }
      }
      if (parsedData) {
        queueMicrotask(() => setSavedTodayData(parsedData));
      } else {
        queueMicrotask(() => setSavedTodayData(null));
      }
    } catch {
      queueMicrotask(() => setSavedTodayData(null));
    }
  }, [me.id, today, todayJournalEntry]);

  useEffect(() => {
    if (!isComposingReflection) return;
    const handleScrollCollapse = () => {
      setIsComposingReflection(false);
      setSuppressNextAutoExpand(true);
    };
    window.addEventListener("scroll", handleScrollCollapse, { passive: true });
    // Capture scroll from nested scroll containers (like MobileScreen content area).
    document.addEventListener("scroll", handleScrollCollapse, true);
    return () => {
      window.removeEventListener("scroll", handleScrollCollapse);
      document.removeEventListener("scroll", handleScrollCollapse, true);
    };
  }, [isComposingReflection]);

  const handleSaveJournal = () => {
    if (!canSaveJournal) return;
    void (async () => {
      try {
        await saveJournalEntry({
          date: today,
          mood: journalDraft.mood,
          promptId: dailyPrompt.id,
          promptText: dailyPrompt.text,
          reflection: journalDraft.reflection,
          causeBuckets: journalDraft.causeBuckets,
        });
        const payload = {
          mood: journalDraft.mood,
          reflection: journalDraft.reflection.trim(),
          causeBuckets: journalDraft.causeBuckets,
        };
        setSavedTodayData(payload);
        if (typeof window !== "undefined") {
          try {
            window.localStorage.setItem(
              `${JOURNAL_SAVED_TODAY_KEY}:${me.id}:${today}`,
              "1",
            );
            window.localStorage.setItem(
              `${JOURNAL_SAVED_TODAY_DATA_KEY}:${me.id}:${today}`,
              JSON.stringify(payload),
            );
          } catch {
            // ignore write failures
          }
        }
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
      {showJournalFocusMode ? (
        <>
        <section
          className={cn(
            "overflow-hidden rounded-[28px] border border-white/20 bg-gradient-to-b from-white/70 to-white/30 p-4 shadow-[0_12px_35px_-20px_rgba(0,0,0,0.45)] backdrop-blur-md dark:from-white/[0.08] dark:to-white/[0.03]",
            showJournalFocusMode
              ? "mt-0 -mx-1 flex min-h-[calc(100dvh-18rem)] flex-col pb-[max(env(safe-area-inset-bottom),5.5rem)]"
              : "mt-1",
          )}
        >
          <div className="flex items-center gap-2">
            <p className="text-[14px] font-semibold tracking-tight">Daily check-in</p>
          </div>
          <div
            className={cn(
              "relative mt-3 overflow-hidden rounded-2xl border border-border/60 bg-background/60",
              showJournalFocusMode && "flex-1",
            )}
          >
            {isComposingReflection ? (
              <div
                className="pointer-events-none absolute inset-0 z-10 bg-background/30 backdrop-blur-[2px] transition-opacity duration-200"
                aria-hidden
              />
            ) : null}
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
                className={cn(
                  "relative mt-2 min-h-[78px] w-full resize-y rounded-xl border border-border/80 bg-background/85 px-3 py-2 text-[14px] leading-relaxed outline-none ring-offset-background placeholder:text-muted-foreground/60 transition-all duration-200 focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30",
                  isComposingReflection &&
                    "z-20 -mx-2 min-h-[220px] w-[calc(100%+1rem)] rounded-2xl border-primary/40 bg-background shadow-[0_18px_45px_-24px_rgba(0,0,0,0.6)]",
                )}
                placeholder="Share your thoughts!"
                value={journalDraft.reflection}
                onFocus={() => {
                  if (suppressNextAutoExpand) {
                    setSuppressNextAutoExpand(false);
                    return;
                  }
                  setIsComposingReflection(true);
                }}
                onBlur={() => setIsComposingReflection(false)}
                onChange={(e) =>
                  {
                    setIsComposingReflection(true);
                    setSuppressNextAutoExpand(false);
                    setJournalDraft((prev) => {
                      const reflection = e.target.value;
                      return {
                        ...prev,
                        reflection,
                        causeBuckets: bucketTouched
                          ? prev.causeBuckets
                          : preselectCauseBuckets(reflection),
                      };
                    });
                  }
                }
                maxLength={600}
              />
              {isComposingReflection ? (
                <div className="mt-2 flex justify-end">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="rounded-full"
                    onClick={() => setIsComposingReflection(false)}
                  >
                    Done
                  </Button>
                </div>
              ) : null}
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
        </>
      ) : null}

      {!showJournalFocusMode ? (
        <section className="mt-5">
          <h2 className="mb-2 px-0.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            Journal history
          </h2>
          {todayDisplayEntry ? (
            <div className="mb-2.5 rounded-2xl border border-border/60 bg-card/80 px-4 py-3.5">
              <p className="text-[12px] font-semibold text-primary">
                Mood {todayDisplayEntry.mood}/10
              </p>
              <p className="mt-1 text-[14px] leading-snug">
                {todayDisplayEntry.reflection || "No sentence saved."}
              </p>
              {todayDisplayEntry.causeBuckets.length > 0 ? (
                <p className="mt-2 text-[11px] text-muted-foreground">
                  {todayDisplayEntry.causeBuckets.join(" • ")}
                </p>
              ) : null}
            </div>
          ) : null}
          {journalHistory.length > 0 ? (
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
          ) : (
            <div className="rounded-2xl border border-dashed border-border bg-card/60 p-6 text-center">
              <p className="text-[14px] font-semibold">Nothing here yet</p>
              <p className="mt-1 text-[12px] text-muted-foreground">
                Save today&apos;s check-in to build your history.
              </p>
            </div>
          )}
        </section>
      ) : null}
        </>
      )}
    </MobileScreen>
  );
}
