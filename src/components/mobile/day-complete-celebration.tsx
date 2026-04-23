"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { getDailyQuoteAction, peekDailyQuoteAction } from "@/app/actions/quotes";
import { Button } from "@/components/ui/button";
import { useStore } from "@/lib/store";
import {
  FALLBACK_QUOTES,
  getLocalDeviceSeed,
  pickFallbackQuote,
  readCachedQuote,
  setCelebrationStorageScope,
  writeCachedQuote,
  type CachedQuote,
} from "@/lib/quotes-storage";
import { useDayCompleteTrigger } from "@/hooks/use-day-complete-trigger";
import { GiftBox } from "./gift-box";

const AUTO_DISMISS_MS = 10000;
const REVEAL_QUOTE_GATE_MS = 420;

export function DayCompleteCelebration() {
  const { state } = useStore();
  const reduceMotion = useReducedMotion();
  const meId = state.me?.id ?? null;

  useEffect(() => {
    setCelebrationStorageScope(meId ?? "anon");
  }, [meId]);

  const { active, date, doneCount, totalHabits, acknowledge } = useDayCompleteTrigger();

  const [revealed, setRevealed] = useState(false);
  const [quote, setQuote] = useState<CachedQuote | null>(null);
  const confettiHandleRef = useRef<{ reset: () => void } | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const revealInFlightRef = useRef(false);
  const consumedDateRef = useRef<string | null>(null);
  const localSeed = getLocalDeviceSeed();

  const prefetchQuote = useCallback(
    async (dateKey: string): Promise<CachedQuote | null> => {
      const cached = readCachedQuote(dateKey);
      if (cached) {
        setQuote((prev) => prev ?? cached);
        return cached;
      }
      try {
        const r = await peekDailyQuoteAction({
          dateKey,
          localSeed,
        });
        if (r.ok && r.data) {
          const next: CachedQuote = {
            id: r.data.id,
            text: r.data.text,
            author: r.data.author,
          };
          writeCachedQuote(dateKey, next);
          setQuote((prev) => prev ?? next);
          return next;
        }
      } catch {
        // ignore and let reveal path fallback if needed
      }
      return null;
    },
    [localSeed],
  );

  const handleReveal = useCallback(async () => {
    if (revealInFlightRef.current) return;
    revealInFlightRef.current = true;
    try {
      let display = quote ?? readCachedQuote(date) ?? null;
      if (!display) {
        display = await prefetchQuote(date);
      }
      const gate = new Promise<void>((resolve) => {
        window.setTimeout(resolve, REVEAL_QUOTE_GATE_MS);
      });

      if (consumedDateRef.current !== date) {
        try {
          const r = await getDailyQuoteAction({
            dateKey: date,
            localSeed,
          });
          if (r.ok && r.data) {
            const consumed: CachedQuote = {
              id: r.data.id,
              text: r.data.text,
              author: r.data.author,
            };
            writeCachedQuote(date, consumed);
            consumedDateRef.current = date;
            if (!display) {
              display = consumed;
              setQuote(consumed);
            }
          }
        } catch {
          // ignore and continue with cached/fallback
        }
      }

      if (!display) {
        const fallback = pickFallbackQuote(date);
        display = fallback;
        setQuote(fallback);
      }
      await gate;
      setQuote(display);
      setRevealed(true);
    } finally {
      revealInFlightRef.current = false;
    }
  }, [date, localSeed, prefetchQuote, quote]);

  useEffect(() => {
    if (!active) {
      queueMicrotask(() => {
        setRevealed(false);
        setQuote(readCachedQuote(date));
      });
      return;
    }
    queueMicrotask(() => {
      void prefetchQuote(date);
    });
  }, [active, date, prefetchQuote]);

  useEffect(() => {
    if (!meId || active) return;
    if (totalHabits <= 0) return;
    if (doneCount < totalHabits - 1) return;
    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      void prefetchQuote(date);
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [active, date, doneCount, totalHabits, meId, prefetchQuote]);

  useEffect(() => {
    if (!active) return;
    if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
      try {
        navigator.vibrate(12);
      } catch {
        /* ignore */
      }
    }
  }, [active]);

  useEffect(() => {
    if (!active || !revealed || reduceMotion) return;
    let cancelled = false;
    let fireRaf: number | null = null;
    let burstTimers: number[] = [];
    void (async () => {
      try {
        const mod = await import("canvas-confetti");
        if (cancelled) return;
        const canvas = canvasRef.current;
        const fn = canvas
          ? mod.create(canvas, { resize: true, useWorker: true })
          : mod.default;
        confettiHandleRef.current = {
          reset: () => {
            try {
              fn.reset?.();
            } catch {
              /* ignore */
            }
          },
        };
        fireRaf = window.requestAnimationFrame(() => {
          fn({
            particleCount: 64,
            spread: 58,
            startVelocity: 32,
            origin: { x: 0.5, y: 0.58 },
            scalar: 0.86,
            ticks: 210,
          });
        });
        burstTimers.push(
          window.setTimeout(() => {
            fn({
              particleCount: 28,
              angle: 64,
              spread: 42,
              startVelocity: 30,
              origin: { x: 0.16, y: 0.73 },
              scalar: 0.8,
            });
            fn({
              particleCount: 28,
              angle: 116,
              spread: 42,
              startVelocity: 30,
              origin: { x: 0.84, y: 0.73 },
              scalar: 0.8,
            });
          }, 280),
        );
      } catch {
        /* confetti is optional; ignore */
      }
    })();
    return () => {
      cancelled = true;
      if (fireRaf !== null) window.cancelAnimationFrame(fireRaf);
      burstTimers.forEach((id) => window.clearTimeout(id));
      burstTimers = [];
      confettiHandleRef.current?.reset();
      confettiHandleRef.current = null;
    };
  }, [active, revealed, reduceMotion]);

  useEffect(() => {
    if (!active || !revealed) return;
    const t = window.setTimeout(() => acknowledge(), AUTO_DISMISS_MS);
    return () => window.clearTimeout(t);
  }, [active, revealed, acknowledge]);

  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") acknowledge();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active, acknowledge]);

  if (!meId) return null;
  const resolvedQuote = quote ?? FALLBACK_QUOTES[0];

  return (
    <AnimatePresence>
      {active && (
        <motion.div
          key="day-complete"
          role="dialog"
          aria-modal="true"
          aria-label="Day complete"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.24 }}
          className="fixed inset-0 z-[60] flex items-center justify-center"
          onClick={() => {
            if (!revealed) return;
            acknowledge();
          }}
        >
          <div
            aria-hidden
            className="absolute inset-0 bg-gradient-to-b from-background/88 via-background/78 to-background/86 backdrop-blur-xl"
          />
          <div
            aria-hidden
            className="absolute inset-0 opacity-90"
            style={{
              background:
                "radial-gradient(62% 52% at 50% 38%, color-mix(in oklab, var(--duo) 34%, transparent) 0%, transparent 70%)",
            }}
          />
          {!reduceMotion && (
            <canvas
              ref={canvasRef}
              aria-hidden
              className="pointer-events-none absolute inset-0 h-full w-full"
            />
          )}

          <div
            className="relative flex flex-col items-center gap-6 px-6"
            onClick={(e) => e.stopPropagation()}
          >
            <AnimatePresence mode="wait">
              {!revealed ? (
                <motion.div
                  key="gift"
                  initial={{ opacity: 0, y: 8, scale: 0.96 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{
                    opacity: 0,
                    scale: 0.84,
                    y: -30,
                    filter: "blur(3px)",
                    transition: { duration: 0.24, ease: "easeInOut" },
                  }}
                  className="flex items-center justify-center"
                >
                  <GiftBox size={172} onReveal={handleReveal} clickable />
                </motion.div>
              ) : (
                <motion.div
                  key="reward"
                  initial={
                    reduceMotion
                      ? { opacity: 0 }
                      : { y: 30, opacity: 0, scaleY: 0.72, scaleX: 0.96, rotateX: -14 }
                  }
                  animate={
                    reduceMotion
                      ? { opacity: 1 }
                      : { y: 0, opacity: 1, scaleY: 1, scaleX: 1, rotateX: 0 }
                  }
                  transition={
                    reduceMotion
                      ? { duration: 0.24 }
                      : { type: "spring", stiffness: 190, damping: 20, mass: 0.9 }
                  }
                  className="w-[min(370px,calc(100vw-2.6rem))] [transform-style:preserve-3d]"
                >
                  <div className="relative overflow-hidden rounded-[32px] border border-amber-200/35 bg-[linear-gradient(180deg,rgba(255,251,242,0.97),rgba(254,246,232,0.96))] shadow-[0_34px_90px_-26px_rgba(0,0,0,0.45)] backdrop-blur-xl dark:border-amber-100/20 dark:bg-[linear-gradient(180deg,rgba(46,37,28,0.96),rgba(39,31,24,0.96))]">
                    <div
                      aria-hidden
                      className="pointer-events-none absolute left-1/2 top-0 h-5 w-[78%] -translate-x-1/2 rounded-b-[999px] bg-black/8 blur-sm dark:bg-black/30"
                    />
                    <div
                      aria-hidden
                      className="relative h-1.5 w-full"
                      style={{
                        background:
                          "linear-gradient(90deg, var(--duo), var(--duo-soft), var(--duo))",
                      }}
                    />
                    <div className="flex flex-col items-center gap-3 px-6 pb-6 pt-6 text-center">
                      <span className="text-[10px] font-semibold uppercase tracking-[0.34em] text-amber-700/80 dark:text-amber-200/80">
                        Day complete
                      </span>
                      <h2 className="text-[23px] font-semibold leading-tight text-foreground">
                        {doneCount > 1
                          ? `${doneCount} habits, done.`
                          : doneCount === 1
                            ? "1 habit, done."
                            : "You did it."}
                      </h2>
                      <figure className="flex flex-col items-center gap-2 pt-1">
                        <span
                          aria-hidden
                          className="block h-px w-12 rounded-full bg-duo/55"
                        />
                        {quote ? (
                          <>
                            <blockquote className="max-w-[290px] text-pretty text-[16px] font-medium leading-relaxed text-foreground/92">
                              &ldquo;{resolvedQuote.text}&rdquo;
                            </blockquote>
                            {resolvedQuote.author ? (
                              <figcaption className="text-[10.5px] font-medium uppercase tracking-[0.28em] text-foreground/55">
                                {resolvedQuote.author}
                              </figcaption>
                            ) : null}
                          </>
                        ) : (
                          <blockquote className="max-w-[290px] text-pretty text-[16px] font-medium leading-relaxed text-foreground/92">
                            &ldquo;{resolvedQuote.text}&rdquo;
                          </blockquote>
                        )}
                      </figure>
                      <Button
                        className="mt-3 h-10 rounded-full bg-duo px-7 text-sm font-semibold text-duo-foreground shadow-[0_10px_26px_-14px_rgba(0,0,0,0.5)] hover:bg-duo/90"
                        onClick={() => acknowledge()}
                      >
                        Collect
                      </Button>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
