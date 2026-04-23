"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";
import { motion, useReducedMotion } from "framer-motion";

type GiftBoxProps = {
  size?: number;
  onReveal?: () => void;
  revealDelayMs?: number;
  clickable?: boolean;
};

type Sparkle = {
  id: number;
  x: number;
  y: number;
  rotate: number;
  delay: number;
  scale: number;
};

function buildSparkles(count: number): Sparkle[] {
  return Array.from({ length: count }, (_, i) => {
    const angle = (i / count) * Math.PI * 2;
    const radius = 110 + ((i * 41) % 50);
    return {
      id: i,
      x: Math.cos(angle) * radius,
      y: Math.sin(angle) * radius,
      rotate: (i * 57) % 360,
      delay: 0.52 + (i % 6) * 0.04,
      scale: 0.85 + ((i * 13) % 40) / 100,
    };
  });
}

/**
 * Self-contained SVG gift box that anticipates (wiggle), then opens, then calls
 * `onReveal` so the parent can fade the reward card in. Uses duo/accent CSS
 * variables so the look stays brand-synced with the rest of the app.
 */
export function GiftBox({
  size = 168,
  onReveal,
  revealDelayMs = 1000,
  clickable = false,
}: GiftBoxProps) {
  const reduceMotion = useReducedMotion();
  const sparkles = useMemo(() => buildSparkles(10), []);
  const firedRef = useRef(false);

  const fireReveal = useCallback(() => {
    if (firedRef.current) return;
    firedRef.current = true;
    onReveal?.();
  }, [onReveal]);

  useEffect(() => {
    const delay = reduceMotion ? 120 : revealDelayMs;
    const t = window.setTimeout(() => fireReveal(), delay);
    return () => window.clearTimeout(t);
  }, [fireReveal, reduceMotion, revealDelayMs]);

  const wiggle = reduceMotion
    ? undefined
    : { rotate: [0, -4, 4, -3, 3, -1.5, 0] };

  const lidExit = reduceMotion
    ? { y: -12, opacity: 0 }
    : { y: -70, rotate: -16, opacity: 0 };

  return (
    <div
      className={`relative flex items-center justify-center ${clickable ? "cursor-pointer" : ""}`}
      style={{ width: size, height: size }}
      aria-label={clickable ? "Open gift" : undefined}
      role={clickable ? "button" : undefined}
      tabIndex={clickable ? 0 : undefined}
      onClick={clickable ? fireReveal : undefined}
      onKeyDown={
        clickable
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                fireReveal();
              }
            }
          : undefined
      }
      aria-hidden={clickable ? undefined : true}
    >
      {!reduceMotion &&
        sparkles.map((s) => (
          <motion.span
            key={s.id}
            initial={{ x: 0, y: 0, opacity: 0, scale: 0 }}
            animate={{
              x: s.x,
              y: s.y,
              opacity: [0, 1, 0],
              scale: [0, s.scale, 0.4],
              rotate: s.rotate,
            }}
            transition={{ duration: 1.4, ease: "easeOut", delay: s.delay }}
            className="absolute left-1/2 top-1/2 block size-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-duo shadow-[0_0_14px_rgba(255,120,80,0.55)]"
          />
        ))}

      <motion.div
        className="absolute inset-0"
        initial={reduceMotion ? { opacity: 0, scale: 0.9 } : { scale: 0.55, opacity: 0 }}
        animate={
          reduceMotion
            ? { opacity: 1, scale: 1 }
            : {
                scale: 1,
                opacity: 1,
                y: [0, -2, 0, -1, 0],
                ...(wiggle ?? {}),
              }
        }
        transition={
          reduceMotion
            ? { duration: 0.3, ease: "easeOut" }
            : {
                scale: { type: "spring", stiffness: 240, damping: 17, delay: 0.05 },
                opacity: { duration: 0.24 },
                y: {
                  duration: 1.2,
                  delay: 0.2,
                  ease: "easeInOut",
                },
                rotate: {
                  duration: 0.7,
                  delay: 0.25,
                  ease: "easeInOut",
                },
              }
        }
      >
        <svg
          viewBox="0 0 160 160"
          width={size}
          height={size}
          xmlns="http://www.w3.org/2000/svg"
        >
          <defs>
            <linearGradient id="duoBoxGradient" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="var(--duo)" />
              <stop offset="100%" stopColor="var(--duo-soft)" />
            </linearGradient>
            <linearGradient id="duoRibbonGradient" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="var(--duo-foreground)" stopOpacity="0.95" />
              <stop offset="100%" stopColor="var(--duo-foreground)" stopOpacity="0.7" />
            </linearGradient>
            <radialGradient id="duoGlow" cx="0.5" cy="0.4" r="0.55">
              <stop offset="0%" stopColor="var(--duo)" stopOpacity="0.5" />
              <stop offset="100%" stopColor="var(--duo)" stopOpacity="0" />
            </radialGradient>
          </defs>

          <circle cx="80" cy="88" r="70" fill="url(#duoGlow)" />

          <g>
            <rect
              x="24"
              y="62"
              width="112"
              height="78"
              rx="12"
              fill="url(#duoBoxGradient)"
              stroke="var(--duo)"
              strokeOpacity="0.35"
              strokeWidth="1"
            />
            <rect
              x="72"
              y="62"
              width="16"
              height="78"
              fill="url(#duoRibbonGradient)"
            />
            <rect
              x="24"
              y="62"
              width="112"
              height="78"
              rx="12"
              fill="none"
              stroke="var(--duo-foreground)"
              strokeOpacity="0.12"
              strokeWidth="1"
            />
          </g>
        </svg>
      </motion.div>

      <motion.div
        className="absolute inset-0"
        initial={reduceMotion ? { opacity: 0, y: -6 } : { y: -18, opacity: 0, scale: 0.9 }}
        animate={{
          y: reduceMotion ? 0 : [-18, 0, -1.5, 0],
          opacity: 1,
          scale: 1,
          ...(reduceMotion ? {} : (wiggle ?? {})),
        }}
        exit={{ ...lidExit, filter: "blur(1.5px)" }}
        transition={
          reduceMotion
            ? { duration: 0.3, ease: "easeOut" }
            : {
                y: { duration: 0.42, ease: "easeOut" },
                opacity: { duration: 0.25 },
                rotate: {
                  duration: 0.7,
                  delay: 0.25,
                  ease: "easeInOut",
                },
              }
        }
      >
        <motion.div
          className="absolute inset-0"
          initial={false}
          animate={reduceMotion ? { y: 0, opacity: 1 } : { y: 0, opacity: 1 }}
          exit={lidExit}
          transition={{ duration: 0.5, ease: "easeOut", delay: reduceMotion ? 0 : 0.55 }}
        >
          <svg
            viewBox="0 0 160 160"
            width={size}
            height={size}
            xmlns="http://www.w3.org/2000/svg"
          >
            <defs>
              <linearGradient id="duoLidGradient" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor="var(--duo)" />
                <stop offset="100%" stopColor="var(--duo-soft)" />
              </linearGradient>
            </defs>
            <rect
              x="18"
              y="52"
              width="124"
              height="22"
              rx="8"
              fill="url(#duoLidGradient)"
              stroke="var(--duo)"
              strokeOpacity="0.35"
              strokeWidth="1"
            />
            <rect
              x="72"
              y="52"
              width="16"
              height="22"
              fill="url(#duoRibbonGradient)"
            />
            <g transform="translate(80 46)">
              <path
                d="M0 0 C -18 -22 -30 -4 0 6 C 30 -4 18 -22 0 0 Z"
                fill="url(#duoRibbonGradient)"
                stroke="var(--duo)"
                strokeOpacity="0.35"
                strokeWidth="1"
              />
              <circle cx="0" cy="3" r="4" fill="var(--duo)" />
            </g>
          </svg>
        </motion.div>
      </motion.div>
    </div>
  );
}
