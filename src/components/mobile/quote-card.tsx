"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { Sparkles } from "lucide-react";
import type { Quote } from "@/lib/quotes";

type Props = {
  quote?: Quote;
  fallbackQuote?: Quote;
  onReveal: () => void | Promise<unknown>;
};

export function QuoteCard({ quote, fallbackQuote, onReveal }: Props) {
  const [revealed, setRevealed] = useState(Boolean(quote));
  const [revealing, setRevealing] = useState(false);
  const visibleQuote = quote ?? (revealed ? fallbackQuote : undefined);

  useEffect(() => {
    setRevealed(Boolean(quote));
  }, [quote?.id, quote?.text, quote?.author]);

  const handleClick = async () => {
    if (revealing) return;
    if (!quote) {
      try {
        setRevealing(true);
        await Promise.resolve(onReveal());
        setRevealed(true);
      } finally {
        setRevealing(false);
      }
      return;
    }
    setRevealed((v) => !v);
  };

  return (
    <button
      type="button"
      onClick={() => void handleClick()}
      disabled={revealing}
      className={cn(
        "group relative block w-full overflow-hidden rounded-3xl text-left transition-transform",
        "bg-gradient-to-br from-duo-soft via-accent to-duo-soft",
        "border border-border/50 shadow-[0_20px_50px_-20px_color-mix(in_oklab,var(--duo)_40%,transparent)]",
        "active:scale-[0.995]",
        revealing && "opacity-90",
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
        </div>
        {visibleQuote ? (
          <div>
            <p className="text-[17px] font-semibold leading-snug text-foreground">
              &ldquo;{visibleQuote.text}&rdquo;
            </p>
            <p className="mt-2 text-xs text-foreground/60">— {visibleQuote.author}</p>
          </div>
        ) : (
          <div>
            <p className="text-[17px] font-semibold leading-snug text-foreground/80">
              {revealing ? "Revealing today's quote..." : "Tap to reveal today's quote."}
            </p>
            <p className="mt-2 text-xs text-foreground/55">
              One quote a day, automatically refreshes every 24 hours.
            </p>
          </div>
        )}
      </div>
    </button>
  );
}
