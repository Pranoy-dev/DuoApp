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
  setCelebrationStorageScope,
  type CachedQuote,
} from "@/lib/quotes-storage";
import { useDayCompleteTrigger } from "@/hooks/use-day-complete-trigger";
import { GiftBox } from "./gift-box";

const AUTO_DISMISS_MS = 10000;

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
  const handleReveal = useCallback(() => {
    setRevealed(true);
  }, []);

  const loadQuote = useCallback(
    async (dateKey: string) => {
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
                        <blockquote className="max-w-[290px] text-pretty text-[16px] font-medium leading-relaxed text-foreground/92">
                          &ldquo;{resolvedQuote.text}&rdquo;
                        </blockquote>
                        {resolvedQuote.author ? (
                          <figcaption className="text-[10.5px] font-medium uppercase tracking-[0.28em] text-foreground/55">
                            {resolvedQuote.author}
                          </figcaption>
                        ) : null}
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
