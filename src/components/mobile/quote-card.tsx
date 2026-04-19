"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { Sparkles, Lock } from "lucide-react";
import type { Quote } from "@/lib/quotes";

type Props = {
  locked: boolean;
  progress: { done: number; total: number };
  quote?: Quote;
  onUnlock: () => void | Promise<unknown>;
};

export function QuoteCard({ locked, progress, quote, onUnlock }: Props) {
  const [revealed, setRevealed] = useState(!locked);
  const ready = progress.done >= progress.total && progress.total > 0;

  const handleClick = () => {
    if (locked && ready) {
      void Promise.resolve(onUnlock());
      setRevealed(true);
    } else if (!locked) {
      setRevealed((v) => !v);
    }
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      className={cn(
        "group relative block w-full overflow-hidden rounded-3xl text-left transition-transform",
        "bg-gradient-to-br from-duo-soft via-accent to-duo-soft",
        "border border-border/50 shadow-[0_20px_50px_-20px_color-mix(in_oklab,var(--duo)_40%,transparent)]",
        ready && "active:scale-[0.995]",
        !ready && "opacity-85",
      )}
    >
      <div
        aria-hidden
        className="absolute -right-16 -top-16 size-56 rounded-full bg-duo/25 blur-3xl"
      />
      <div
        aria-hidden
        className="absolute -bottom-20 -left-20 size-56 rounded-full bg-accent/50 blur-3xl"
      />
      <div className="relative p-5">
        <div className="mb-3.5 flex items-center justify-between">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-background/60 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-foreground/70 backdrop-blur">
            <Sparkles className="size-3" strokeWidth={2} />
            Daily quote
          </span>
          {locked && !revealed && (
            <span className="inline-flex items-center gap-1 rounded-full bg-background/60 px-2.5 py-0.5 text-[10px] font-semibold text-foreground/70 backdrop-blur">
              <Lock className="size-3" strokeWidth={2} />
              {progress.done}/{progress.total}
            </span>
          )}
        </div>
        {revealed && quote ? (
          <div>
            <p className="text-[17px] font-semibold leading-snug text-foreground">
              &ldquo;{quote.text}&rdquo;
            </p>
            <p className="mt-2 text-xs text-foreground/60">— {quote.author}</p>
          </div>
        ) : (
          <div>
            <p className="text-[17px] font-semibold leading-snug text-foreground/80">
              {ready
                ? "Tap to reveal today's quote."
                : "Finish today's habits to unlock a quote."}
            </p>
            <p className="mt-2 text-xs text-foreground/55">
              {ready
                ? "One quote a day, saved to your journal."
                : `${progress.done} of ${progress.total} done`}
            </p>
          </div>
        )}
      </div>
    </button>
  );
}
