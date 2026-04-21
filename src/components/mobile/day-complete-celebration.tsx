"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { getDailyQuoteAction } from "@/app/actions/quotes";
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

const AUTO_DISMISS_MS = 9000;

export function DayCompleteCelebration() {
  const { state } = useStore();
  const reduceMotion = useReducedMotion();
  const meId = state.me?.id ?? null;

  useEffect(() => {
    setCelebrationStorageScope(meId ?? "anon");
  }, [meId]);

  const { active, date, doneCount, acknowledge } = useDayCompleteTrigger();

  const [revealed, setRevealed] = useState(false);
  const [quote, setQuote] = useState<CachedQuote | null>(null);
  const confettiHandleRef = useRef<{ reset: () => void } | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const loadQuote = useCallback(
    async (dateKey: string) => {
      const cached = readCachedQuote(dateKey);
      if (cached) {
        setQuote(cached);
        return;
      }
      try {
        const r = await getDailyQuoteAction({
          dateKey,
          localSeed: getLocalDeviceSeed(),
        });
        if (r.ok && r.data) {
          const next: CachedQuote = {
            id: r.data.id,
            text: r.data.text,
            author: r.data.author,
          };
          setQuote(next);
          writeCachedQuote(dateKey, next);
          return;
        }
      } catch {
        /* fall through to fallback */
      }
      const fallback = pickFallbackQuote(dateKey);
      setQuote(fallback);
    },
    [],
  );

  useEffect(() => {
    if (!active) {
      queueMicrotask(() => {
        setRevealed(false);
        setQuote(null);
      });
      return;
    }
    queueMicrotask(() => {
      void loadQuote(date);
    });
  }, [active, date, loadQuote]);

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
            particleCount: 90,
            spread: 75,
            startVelocity: 38,
            origin: { x: 0.5, y: 0.55 },
            scalar: 0.95,
            ticks: 220,
          });
        });
        burstTimers.push(
          window.setTimeout(() => {
            fn({
              particleCount: 55,
              angle: 60,
              spread: 60,
              startVelocity: 42,
              origin: { x: 0.1, y: 0.7 },
              scalar: 0.9,
            });
            fn({
              particleCount: 55,
              angle: 120,
              spread: 60,
              startVelocity: 42,
              origin: { x: 0.9, y: 0.7 },
              scalar: 0.9,
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
          onClick={() => acknowledge()}
        >
          <div
            aria-hidden
            className="absolute inset-0 bg-gradient-to-b from-background/80 via-background/70 to-background/85 backdrop-blur-xl"
          />
          <div
            aria-hidden
            className="absolute inset-0 opacity-80"
            style={{
              background:
                "radial-gradient(60% 50% at 50% 40%, color-mix(in oklab, var(--duo) 30%, transparent) 0%, transparent 70%)",
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
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0, scale: 0.8, transition: { duration: 0.2 } }}
                  className="flex items-center justify-center"
                >
                  <GiftBox size={172} onReveal={() => setRevealed(true)} />
                </motion.div>
              ) : (
                <motion.div
                  key="reward"
                  initial={
                    reduceMotion
                      ? { opacity: 0 }
                      : { y: 28, opacity: 0, scale: 0.94 }
                  }
                  animate={
                    reduceMotion
                      ? { opacity: 1 }
                      : { y: 0, opacity: 1, scale: 1 }
                  }
                  transition={
                    reduceMotion
                      ? { duration: 0.24 }
                      : { type: "spring", stiffness: 200, damping: 22 }
                  }
                  className="w-[min(360px,calc(100vw-3rem))]"
                >
                  <div className="overflow-hidden rounded-3xl border border-border/50 bg-card/95 shadow-[0_30px_80px_-20px_rgba(0,0,0,0.35)] backdrop-blur-xl">
                    <div
                      aria-hidden
                      className="relative h-1.5 w-full"
                      style={{
                        background:
                          "linear-gradient(90deg, var(--duo), var(--duo-soft), var(--duo))",
                      }}
                    />
                    <div className="flex flex-col items-center gap-3 px-6 pb-5 pt-6 text-center">
                      <span className="text-[10px] font-semibold uppercase tracking-[0.32em] text-muted-foreground">
                        Day complete
                      </span>
                      <h2 className="text-[22px] font-semibold leading-tight text-foreground">
                        {doneCount > 1
                          ? `${doneCount} habits, done.`
                          : doneCount === 1
                            ? "1 habit, done."
                            : "You did it."}
                      </h2>
                      <figure className="flex flex-col items-center gap-2 pt-1">
                        <span
                          aria-hidden
                          className="block h-px w-10 rounded-full bg-duo/50"
                        />
                        <blockquote className="max-w-[280px] text-pretty text-[15.5px] font-medium leading-relaxed text-foreground/90">
                          &ldquo;{resolvedQuote.text}&rdquo;
                        </blockquote>
                        {resolvedQuote.author ? (
                          <figcaption className="text-[10.5px] font-medium uppercase tracking-[0.28em] text-muted-foreground">
                            {resolvedQuote.author}
                          </figcaption>
                        ) : null}
                      </figure>
                      <Button
                        className="mt-3 h-10 rounded-full bg-duo px-6 text-sm font-semibold text-duo-foreground shadow-sm hover:bg-duo/90"
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
