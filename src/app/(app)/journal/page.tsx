"use client";

import { useEffect, useMemo, useState } from "react";
import { Star } from "lucide-react";
import { MobileScreen } from "@/components/mobile/mobile-screen";
import { Button } from "@/components/ui/button";
import { useStore } from "@/lib/store";
import { todayKey } from "@/lib/date";
import { cn } from "@/lib/utils";

const STAR_MAX = 5;

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

export default function JournalPage() {
  const { state, saveDayExcitement } = useStore();
  const me = state.me!;
  const today = todayKey();

  const todayEntry = useMemo(
    () =>
      state.dayExcitement.find((e) => e.userId === me.id && e.date === today),
    [state.dayExcitement, me.id, today],
  );

  /** When false and today is saved, the big check-in card is collapsed. */
  const [wantsToEdit, setWantsToEdit] = useState(false);

  const formCollapsed = Boolean(todayEntry) && !wantsToEdit;

  const [stars, setStars] = useState(0);
  const [note, setNote] = useState("");

  useEffect(() => {
    if (formCollapsed) return;
    if (todayEntry) {
      setStars(todayEntry.stars);
      setNote(todayEntry.note);
    } else {
      setStars(0);
      setNote("");
    }
  }, [formCollapsed, today, todayEntry?.id, todayEntry?.stars, todayEntry?.note]);

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

  const canSave = stars >= 1 && stars <= STAR_MAX;

  const handleSave = () => {
    if (!canSave) return;
    void (async () => {
      try {
        await saveDayExcitement({ stars, note });
        setWantsToEdit(false);
      } catch {
        /* toast optional */
      }
    })();
  };

  return (
    <MobileScreen eyebrow="Journal" title="How today feels">
      {!formCollapsed ? (
        <section className="mt-1 rounded-2xl border border-border/60 bg-card/80 p-4">
          <p className="text-center text-[13px] font-semibold leading-snug">
            How excited are you about the day?
          </p>
          <div className="mt-3">
            <StarRow value={stars} onChange={setStars} />
          </div>
          <label className="mt-4 block">
            <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              Note (optional)
            </span>
            <textarea
              className="mt-1.5 min-h-[88px] w-full resize-y rounded-xl border border-border/80 bg-background/80 px-3 py-2 text-[14px] leading-relaxed outline-none ring-offset-background placeholder:text-muted-foreground/60 focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
              placeholder="Anything on your mind…"
              value={note}
              onChange={(e) => setNote(e.target.value)}
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
        <section className="mt-1 rounded-2xl border border-border/60 bg-card/80 p-4">
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
              onClick={() => setWantsToEdit(true)}
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
    </MobileScreen>
  );
}
