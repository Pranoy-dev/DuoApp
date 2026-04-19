"use client";

import Link from "next/link";
import { useEffect } from "react";
import { toast } from "sonner";
import { MobileScreen } from "@/components/mobile/mobile-screen";
import { Button } from "@/components/ui/button";
import { computeDuoCloudClientConfigured } from "@/lib/duo-cloud";
import { useDuoRuntimeEnv } from "@/lib/duo-runtime-env";
import { useStore } from "@/lib/store";
import { streakFor } from "@/lib/streak";
import { habitIntent } from "@/lib/types";
import { addDays, formatDateKey, toDateKey, todayKey } from "@/lib/date";
import { cn } from "@/lib/utils";

const TIMELINE_DAYS = 14;
const MAX_REVIVES = 3;
const PARTNER_POLL_MS = 12_000;

function possessiveFirst(fullName: string): string {
  const first = fullName.split(" ")[0] || fullName;
  return `${first}'s`;
}

function dateKeysLastNDays(n: number): string[] {
  const start = new Date();
  const keys: string[] = [];
  for (let i = 0; i < n; i += 1) {
    keys.push(toDateKey(addDays(start, -i)));
  }
  return keys;
}

export default function PartnerPage() {
  const duoRuntime = useDuoRuntimeEnv();
  const duoCloudActive = computeDuoCloudClientConfigured(duoRuntime);
  const { state, revivePartnerMiss, refreshBootstrapFromServer } = useStore();
  const me = state.me!;
  const couple = state.couple;
  const partner = couple?.members.find((m) => m.id !== me.id);

  useEffect(() => {
    if (!duoCloudActive || !couple?.id || !partner?.id) return;
    void refreshBootstrapFromServer();
  }, [
    duoCloudActive,
    couple?.id,
    partner?.id,
    refreshBootstrapFromServer,
  ]);

  useEffect(() => {
    if (!duoCloudActive || !couple?.id || !partner?.id) return;
    const id = window.setInterval(() => {
      void refreshBootstrapFromServer();
    }, PARTNER_POLL_MS);
    return () => window.clearInterval(id);
  }, [
    duoCloudActive,
    couple?.id,
    partner?.id,
    refreshBootstrapFromServer,
  ]);

  useEffect(() => {
    if (!duoCloudActive || !couple?.id || !partner?.id) return;
    const onVis = () => {
      if (document.visibilityState === "visible") {
        void refreshBootstrapFromServer();
      }
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [
    duoCloudActive,
    couple?.id,
    partner?.id,
    refreshBootstrapFromServer,
  ]);

  if (!couple || !partner) {
    return (
      <MobileScreen eyebrow="Partner" title="You're solo for now">
        <WaitingRoom />
      </MobileScreen>
    );
  }

  const partnerHabits = state.habits.filter(
    (h) => h.ownerId === partner.id && h.visibility === "shared",
  );

  const timelineHabits = partnerHabits.filter((h) => h.type !== "frequency");

  const totalStreak = partnerHabits.reduce(
    (acc, h) =>
      acc +
      streakFor(h, state.completions, partner.id, partner.graceEnabled).current,
    0,
  );

  const revivesLeft = me.streakRevivesRemaining;
  const dateKeys = dateKeysLastNDays(TIMELINE_DAYS);

  const onRevive = async (habitId: string, date: string, habitName: string) => {
    const ok = await revivePartnerMiss({ partnerId: partner.id, habitId, date });
    if (ok) {
      toast("Streak revived", {
        description: `${partner.name.split(" ")[0]} — ${habitName} (${formatDateKey(date)})`,
      });
    } else {
      toast("Could not revive", {
        description: "Check revives left, date, and habit type.",
      });
    }
  };

  return (
    <MobileScreen
      eyebrow="Partner"
      title={partner.name}
      trailing={
        <div className="flex shrink-0 items-center pb-0.5">
          <span
            role="status"
            className={cn(
              "inline-flex h-8 shrink-0 items-center justify-center rounded-full bg-duo px-3 text-[0.8rem] font-medium tabular-nums text-duo-foreground shadow-sm",
              revivesLeft === 0 && "opacity-80",
            )}
            title="Revives you can use for your partner’s missed days"
          >
            Revives {revivesLeft}/{MAX_REVIVES}
          </span>
        </div>
      }
    >
      <div className="mb-4 mt-1 flex items-center gap-3 rounded-2xl border border-border/60 bg-card/80 p-3">
        <span
          aria-hidden
          className="flex size-12 items-center justify-center rounded-xl bg-muted text-2xl"
        >
          {partner.emoji}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-semibold leading-tight">
            {partner.name}
          </p>
          <p className="mt-0.5 text-[12px] text-muted-foreground">
            {partnerHabits.length} shared habit
            {partnerHabits.length === 1 ? "" : "s"} · {totalStreak} streak days
          </p>
        </div>
      </div>

      <section>
        <h2 className="mb-2 px-0.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
          Last {TIMELINE_DAYS} days
        </h2>
        {partnerHabits.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border bg-card/60 p-6 text-center text-[13px] text-muted-foreground">
            {partner.name.split(" ")[0]} hasn't shared any habits yet.
          </div>
        ) : timelineHabits.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border bg-card/60 p-6 text-center text-[13px] text-muted-foreground">
            Weekly habits don’t appear on this daily timeline. Add a daily or
            break habit to see check-ins here.
          </div>
        ) : (
          <ul className="flex flex-col gap-4">
            {dateKeys.map((date) => {
              const habitsForDate = timelineHabits.filter((habit) => {
                const createdKey = toDateKey(new Date(habit.createdAt));
                return date >= createdKey;
              });
              if (habitsForDate.length === 0) return null;

              return (
              <li key={date}>
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                  {formatDateKey(date)}
                  {date === todayKey() ? " · Today" : ""}
                </p>
                <ul className="flex flex-col gap-2">
                  {habitsForDate.map((habit) => {
                      const done = state.completions.some(
                        (c) =>
                          c.habitId === habit.id &&
                          c.userId === partner.id &&
                          c.date === date,
                      );

                      const first = partner.name.split(" ")[0] ?? partner.name;
                      const breakH = habitIntent(habit) === "break";

                      return (
                        <li
                          key={`${date}-${habit.id}`}
                          className={cn(
                            "flex min-h-[44px] items-center justify-between gap-3 rounded-2xl border px-3 py-2.5",
                            done
                              ? "border-border/60 bg-card/80"
                              : "border-destructive/35 bg-destructive/5",
                          )}
                        >
                          <p
                            className={cn(
                              "min-w-0 flex-1 text-[13px] leading-snug",
                              done ? "text-foreground" : "text-destructive",
                            )}
                            aria-label={
                              done
                                ? `${first} completed ${habit.name} on ${date}`
                                : `${first} missed ${habit.name} on ${date}`
                            }
                          >
                            {done ? (
                              breakH ? (
                                <>
                                  <span className="font-semibold text-foreground">
                                    {first}
                                  </span>{" "}
                                  avoided{" "}
                                  <span className="font-semibold">
                                    {habit.name}
                                  </span>
                                </>
                              ) : (
                                <>
                                  <span className="font-semibold text-foreground">
                                    {possessiveFirst(partner.name)}
                                  </span>{" "}
                                  <span className="font-semibold">
                                    {habit.name}
                                  </span>{" "}
                                  is done
                                </>
                              )
                            ) : (
                              <>
                                <span className="font-semibold">Missed · </span>
                                <span className="font-semibold">{first}</span>
                                {" — "}
                                <span className="font-semibold">
                                  {habit.name}
                                </span>
                              </>
                            )}
                          </p>
                          {!done && (
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              disabled={revivesLeft <= 0}
                              className="h-9 shrink-0 rounded-full border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
                              aria-label={`Revive ${habit.name} for ${first} on ${date}`}
                              onClick={() =>
                                void onRevive(habit.id, date, habit.name)
                              }
                            >
                              Revive
                            </Button>
                          )}
                        </li>
                      );
                    })}
                </ul>
              </li>
              );
            })}
          </ul>
        )}
      </section>
    </MobileScreen>
  );
}

function WaitingRoom() {
  const { state } = useStore();
  const couple = state.couple;

  const shareFromWaitingRoom = async () => {
    if (!couple) return;
    const link =
      typeof window !== "undefined"
        ? `${window.location.origin}/invite/${couple.inviteCode}`
        : `/invite/${couple.inviteCode}`;
    const nav = typeof navigator !== "undefined" ? navigator : null;
    const text = "Join me on Duo.";
    const canShare = nav && "share" in nav;
    if (canShare) {
      try {
        await (nav as Navigator & {
          share: (d: ShareData) => Promise<void>;
        }).share({ title: "Duo", text, url: link });
        return;
      } catch {
        // user cancelled — fall through to copy
      }
    }
    try {
      await (nav as Navigator).clipboard.writeText(`${text} — ${link}`);
      toast("Invite link copied");
    } catch {
      toast("Copy failed — select and copy manually");
    }
  };

  return (
    <div className="flex flex-col items-center gap-5 pt-8 text-center">
      <div className="flex size-28 items-center justify-center rounded-full bg-gradient-to-br from-duo-soft to-accent text-5xl">
        ✦
      </div>
      <div>
        <p className="text-lg font-semibold">Invite someone to join you</p>
        <p className="mt-1 max-w-[280px] text-sm text-muted-foreground">
          Streaks feel more meaningful with someone watching and rooting for
          you.
        </p>
      </div>
      {couple ? (
        <button
          type="button"
          onClick={() => void shareFromWaitingRoom()}
          className="rounded-full bg-foreground px-5 py-2.5 text-sm font-medium text-background"
        >
          Share invite link
        </button>
      ) : (
        <Link
          href="/onboarding"
          className="rounded-full bg-foreground px-5 py-2.5 text-sm font-medium text-background"
        >
          Set up your pair
        </Link>
      )}
    </div>
  );
}
