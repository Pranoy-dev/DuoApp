"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useStore } from "@/lib/store";
import { todayKey } from "@/lib/date";
import { MILESTONE_THEMES } from "@/lib/milestones";

const SEEN_MILESTONES_KEY = "duo.milestones.seen.v1";

export function MilestoneOverlay() {
  const { state } = useStore();
  const me = state.me;
  const storageKey = useMemo(
    () => `${SEEN_MILESTONES_KEY}:${me?.id ?? "anon"}`,
    [me?.id],
  );
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(() => {
    if (typeof window === "undefined") return new Set();
    try {
      const raw = window.localStorage.getItem(storageKey);
      if (!raw) return new Set();
      const parsed = JSON.parse(raw) as string[];
      return new Set(parsed);
    } catch {
      return new Set();
    }
  });
  const reduceMotion = useReducedMotion();
  const today = todayKey();
  const persistedDismissedIds = useMemo(() => {
    if (typeof window === "undefined") return new Set<string>();
    try {
      const raw = window.localStorage.getItem(storageKey);
      if (!raw) return new Set<string>();
      const parsed = JSON.parse(raw) as string[];
      return new Set(parsed);
    } catch {
      return new Set<string>();
    }
  }, [storageKey]);
  const allDismissedIds = useMemo(() => {
    const merged = new Set<string>(persistedDismissedIds);
    for (const id of dismissedIds) merged.add(id);
    return merged;
  }, [persistedDismissedIds, dismissedIds]);

  const activeMilestone = useMemo(() => {
    if (!me) return null;
    return (
      state.milestones.find((m) => {
        if (m.userId !== me.id || allDismissedIds.has(m.id)) return false;
        if (!m.achievedAt?.startsWith(today)) return false;
        return true;
      }) ?? null
    );
  }, [me, state.milestones, allDismissedIds, today]);
  const active = activeMilestone
    ? MILESTONE_THEMES[activeMilestone.tier as keyof typeof MILESTONE_THEMES] ??
      null
    : null;
  const particles = useMemo(() => {
    if (!active) return [];
    return Array.from({ length: 18 }, (_, i) => {
      const angle = (i / 18) * Math.PI * 2;
      const radius = 110 + ((i * 37) % 70);
      return {
        x: Math.cos(angle) * radius,
        y: Math.sin(angle) * (radius + 70),
      };
    });
  }, [active]);

  useEffect(() => {
    try {
      window.localStorage.setItem(
        storageKey,
        JSON.stringify([...allDismissedIds]),
      );
    } catch {
      // ignore write failures
    }
  }, [allDismissedIds, storageKey]);

  const dismissActive = useCallback(() => {
    if (!activeMilestone) return;
    setDismissedIds((prev) => {
      const next = new Set(prev);
      next.add(activeMilestone.id);
      return next;
    });
  }, [activeMilestone]);

  useEffect(() => {
    if (!activeMilestone) return;
    const t = window.setTimeout(() => {
      dismissActive();
    }, 2200);
    return () => clearTimeout(t);
  }, [activeMilestone, dismissActive]);

  return (
    <AnimatePresence>
      {active && (
        <motion.div
          key={active.tier}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-background/70 backdrop-blur-md"
          onClick={dismissActive}
        >
          <div className="relative flex flex-col items-center gap-6 px-8 text-center">
            {!reduceMotion &&
              particles.map((particle, i) => (
                <motion.span
                  key={i}
                  initial={{ x: 0, y: 0, opacity: 0 }}
                  animate={{
                    x: particle.x,
                    y: particle.y,
                    opacity: [0, 1, 0],
                  }}
                  transition={{
                    duration: 2.4,
                    ease: "easeOut",
                    delay: i * 0.02,
                  }}
                  className="absolute left-1/2 top-1/2 size-2 rounded-full bg-duo"
                />
              ))}
            <motion.div
              initial={reduceMotion ? { opacity: 0 } : { scale: 0.6, opacity: 0 }}
              animate={reduceMotion ? { opacity: 1 } : { scale: 1, opacity: 1 }}
              exit={reduceMotion ? { opacity: 0 } : { scale: 0.8, opacity: 0 }}
              transition={
                reduceMotion
                  ? { duration: 0.2 }
                  : { type: "spring", stiffness: 220, damping: 18 }
              }
              className="flex size-32 items-center justify-center rounded-full bg-gradient-to-br from-duo via-duo-soft to-accent text-5xl text-duo-foreground shadow-2xl"
              aria-hidden
            >
              {active.emoji}
            </motion.div>
            <motion.div
              initial={reduceMotion ? { opacity: 0 } : { y: 12, opacity: 0 }}
              animate={reduceMotion ? { opacity: 1 } : { y: 0, opacity: 1 }}
              transition={{ delay: reduceMotion ? 0 : 0.2 }}
              onClick={(e) => e.stopPropagation()}
            >
              <p className="text-xs font-semibold uppercase tracking-[0.3em] text-muted-foreground">
                Milestone · {active.tier} days
              </p>
              <h2 className="mt-2 text-2xl font-semibold">{active.label}</h2>
              <p className="mt-1 max-w-[280px] text-[15px] text-muted-foreground">
                {active.blurb}
              </p>
              <p className="mt-2 text-[11px] font-medium uppercase tracking-[0.24em] text-muted-foreground/80">
                Tap anywhere to close
              </p>
            </motion.div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
