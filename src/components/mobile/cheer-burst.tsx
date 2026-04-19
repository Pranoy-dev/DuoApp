"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useStore } from "@/lib/store";

export function CheerBurst() {
  const { state, markCheersRead } = useStore();
  const me = state.me;
  const [active, setActive] = useState<string | null>(null);
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    if (!me) return;
    const unread = state.cheers.find((c) => c.toUserId === me.id && !c.read);
    if (unread) {
      setActive(unread.id);
      const t = setTimeout(() => {
        setActive(null);
        void markCheersRead();
      }, 2200);
      return () => clearTimeout(t);
    }
  }, [state.cheers, me, markCheersRead]);

  if (!me) return null;

  return (
    <AnimatePresence>
      {active && (
        <motion.div
          key={active}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center"
        >
          <div className="relative size-64">
            {!reduceMotion &&
              Array.from({ length: 12 }).map((_, i) => (
                <motion.span
                  key={i}
                  initial={{ x: 0, y: 0, opacity: 0, scale: 0.4 }}
                  animate={{
                    x: Math.cos((i / 12) * Math.PI * 2) * 110,
                    y: Math.sin((i / 12) * Math.PI * 2) * 110,
                    opacity: [0, 1, 0],
                    scale: [0.5, 1.2, 0.8],
                  }}
                  transition={{ duration: 1.6, ease: "easeOut" }}
                  className="absolute left-1/2 top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-duo"
                />
              ))}
            <motion.div
              initial={reduceMotion ? { opacity: 0 } : { scale: 0.6, opacity: 0 }}
              animate={reduceMotion ? { opacity: 1 } : { scale: 1, opacity: 1 }}
              exit={reduceMotion ? { opacity: 0 } : { scale: 0.8, opacity: 0 }}
              transition={
                reduceMotion
                  ? { duration: 0.2 }
                  : { type: "spring", stiffness: 260, damping: 20 }
              }
              className="absolute inset-0 flex items-center justify-center"
            >
              <div className="rounded-full bg-background/90 px-5 py-3 text-base font-semibold shadow-xl backdrop-blur">
                A cheer from your partner
              </div>
            </motion.div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
