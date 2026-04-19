"use client";

import { UserButton } from "@clerk/nextjs";
import { useMemo, useState } from "react";
import { Copy, Share2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { MobileScreen } from "@/components/mobile/mobile-screen";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import {
  computeDeferredHybridCoupleServerEnabled,
  computeDeferredSnapshotClientEnabled,
  computeDuoCloudClientConfigured,
} from "@/lib/duo-cloud";
import { useDuoRuntimeEnv } from "@/lib/duo-runtime-env";
import { readSyncMeta } from "@/lib/duo-sync";
import { useStore } from "@/lib/store";
import { habitIntent } from "@/lib/types";
import { QUOTE_TONES } from "@/lib/quotes";
import type { QuoteTone } from "@/lib/types";

export default function SettingsPage() {
  const duoRuntime = useDuoRuntimeEnv();
  const duoCloudActive = computeDuoCloudClientConfigured(duoRuntime);
  const hybridCouple = computeDeferredHybridCoupleServerEnabled(duoRuntime);
  const deferredSnapshot =
    computeDeferredSnapshotClientEnabled(duoRuntime) && !duoCloudActive;
  const clerkConfigured = Boolean(duoRuntime.clerkPublishableKey.trim());
  const [syncUiTick, setSyncUiTick] = useState(0);
  const syncMeta = useMemo(() => readSyncMeta(), [syncUiTick]);
  const {
    state,
    setTone,
    setGrace,
    removeHabit,
    resetAll,
    createCouple,
    joinCouple,
  } = useStore();
  const me = state.me!;
  const couple = state.couple;

  const [partnerCode, setPartnerCode] = useState("");

  const shareLink =
    typeof window !== "undefined" && couple
      ? `${window.location.origin}/invite/${couple.inviteCode}`
      : "";

  const copyCode = async () => {
    if (!couple) return;
    try {
      await navigator.clipboard.writeText(couple.inviteCode);
      toast("Invite code copied");
    } catch {
      toast("Copy failed — select and copy manually");
    }
  };

  const share = async () => {
    if (!couple) return;
    const text = `Join me on Duo — use code ${couple.inviteCode}`;
    const nav = typeof navigator !== "undefined" ? navigator : null;
    const canShare = nav && "share" in nav;
    if (canShare) {
      try {
        await (nav as Navigator & {
          share: (d: ShareData) => Promise<void>;
        }).share({ title: "Duo", text, url: shareLink });
        return;
      } catch {
        // user cancelled — fall through to copy
      }
    }
    try {
      await (nav as Navigator).clipboard.writeText(`${text} — ${shareLink}`);
      toast("Invite link copied");
    } catch {
      toast("Copy failed — select and copy manually");
    }
  };

  const partner = couple?.members.find((m) => m.id !== me.id);

  return (
    <MobileScreen
      eyebrow="Settings"
      title="You & Duo"
      trailing={
        clerkConfigured ? (
          <UserButton
            appearance={{
              elements: { avatarBox: "size-9 rounded-xl" },
            }}
          />
        ) : undefined
      }
    >
      <section className="mb-3 mt-1 flex items-center gap-3 rounded-2xl border border-border/60 bg-card/80 p-3">
        <span
          aria-hidden
          className="flex size-12 items-center justify-center rounded-xl bg-muted text-2xl"
        >
          {me.emoji}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-semibold leading-tight">{me.name}</p>
          <p className="mt-0.5 text-[12px] text-muted-foreground capitalize">
            {me.tone.replace("-", " ")} quotes
          </p>
        </div>
      </section>

      <SectionLabel>Your pair</SectionLabel>
      <section className="mb-4 overflow-hidden rounded-2xl border border-border/60 bg-card/80">
        {!couple ? (
          <div className="p-4">
            <p className="text-[13px] text-muted-foreground">
              Create a pair to get an invite code for your partner.
            </p>
            <Button
              className="mt-3 w-full"
              onClick={() => {
                void (async () => {
                  try {
                    const c = await createCouple();
                    toast(`Invite code: ${c.inviteCode}`);
                  } catch (e) {
                    toast.error(
                      e instanceof Error ? e.message : "Could not create pair",
                    );
                  }
                })();
              }}
            >
              Create pair
            </Button>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between gap-3 p-4">
              <div className="min-w-0">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                  Invite code
                </p>
                <p className="mt-0.5 font-mono text-xl font-semibold tracking-[0.2em]">
                  {couple.inviteCode}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                <Button
                  variant="secondary"
                  size="sm"
                  className="h-8 rounded-full px-3 text-xs"
                  onClick={copyCode}
                >
                  <Copy className="mr-1 size-3.5" /> Copy
                </Button>
                <Button
                  size="sm"
                  className="h-8 rounded-full px-3 text-xs"
                  onClick={share}
                >
                  <Share2 className="mr-1 size-3.5" /> Share
                </Button>
              </div>
            </div>
            {partner && (
              <div className="flex items-center gap-3 border-t border-border/60 p-3">
                <span
                  aria-hidden
                  className="flex size-9 items-center justify-center rounded-lg bg-muted text-lg"
                >
                  {partner.emoji}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-semibold leading-tight">
                    {partner.name}
                  </p>
                  <p className="text-[11px] text-muted-foreground">Paired</p>
                </div>
              </div>
            )}
            {couple.members.length < 2 && (
              <div className="border-t border-border/60 bg-muted/30 p-3">
                <Label
                  htmlFor="partner-invite-code"
                  className="text-[12px] font-semibold"
                >
                  Paste partner code
                </Label>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  If you both started Duo separately, paste the code from their
                  Settings here to link the same pair (or use their invite link).
                </p>
                <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-end">
                  <Input
                    id="partner-invite-code"
                    value={partnerCode}
                    onChange={(e) =>
                      setPartnerCode(e.target.value.toUpperCase())
                    }
                    placeholder="e.g. ABC123"
                    autoCapitalize="characters"
                    autoCorrect="off"
                    spellCheck={false}
                    className="h-10 rounded-xl font-mono text-sm tracking-wider sm:flex-1"
                    maxLength={8}
                  />
                  <Button
                    size="sm"
                    className="h-10 shrink-0 rounded-full px-4 text-xs sm:w-auto"
                    disabled={partnerCode.trim().length < 4}
                    onClick={() => {
                      void (async () => {
                        const raw = partnerCode.trim().toUpperCase();
                        if (raw.length < 4) return;
                        if (
                          couple &&
                          couple.inviteCode === raw &&
                          couple.members.length < 2
                        ) {
                          toast(
                            "That is your invite code — your partner should paste it on their phone.",
                          );
                          return;
                        }
                        try {
                          const joined = await joinCouple(raw);
                          if (!joined) {
                            toast.error(
                              "That code did not work. Check the code or ask your partner to copy it again from Settings.",
                            );
                            return;
                          }
                          setPartnerCode("");
                          toast.success("You are paired.");
                        } catch (e) {
                          toast.error(
                            e instanceof Error
                              ? e.message
                              : "Could not join with that code.",
                          );
                        }
                      })();
                    }}
                  >
                    Connect
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </section>

      {deferredSnapshot ? (
        <>
          <SectionLabel>Cloud backup</SectionLabel>
          <section className="mb-4 overflow-hidden rounded-2xl border border-border/60 bg-card/80 p-3.5">
            <p className="text-[13px] font-semibold">Supabase snapshot</p>
            <p className="mt-1 text-[11px] text-muted-foreground">
              Habits stay on this device for speed; we push a full backup on a
              daily timer, when you return to the app, or when you tap sync.
            </p>
            <Button
              size="sm"
              className="mt-3 h-9 rounded-full px-4 text-xs"
              onClick={() => {
                window.dispatchEvent(new CustomEvent("duo:deferred-sync-now"));
                setSyncUiTick((t) => t + 1);
                toast("Sync queued");
              }}
            >
              Sync now
            </Button>
            <p className="mt-2 text-[11px] text-muted-foreground" key={syncUiTick}>
              Last pushed:{" "}
              {syncMeta.lastSyncedAt
                ? new Date(syncMeta.lastSyncedAt).toLocaleString()
                : "Not yet"}
            </p>
          </section>
        </>
      ) : null}

      <SectionLabel>Preferences</SectionLabel>
      <section className="mb-4 overflow-hidden rounded-2xl border border-border/60 bg-card/80">
        <div className="flex items-center justify-between gap-3 p-3.5">
          <div className="min-w-0">
            <p className="text-[13px] font-semibold">Monthly grace</p>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              One missed day a month doesn't break a streak.
            </p>
          </div>
          <Switch
            checked={me.graceEnabled}
            onCheckedChange={(v) => void setGrace(v)}
          />
        </div>
        <div className="border-t border-border/60 p-3.5">
          <p className="text-[13px] font-semibold">Quote tone</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {QUOTE_TONES.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => void setTone(t.id as QuoteTone)}
                className={`rounded-full border px-3 py-1 text-[12px] transition-colors ${
                  me.tone === t.id
                    ? "border-foreground bg-foreground text-background"
                    : "border-border text-foreground hover:border-foreground/40"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>
      </section>

      {state.habits.length > 0 && (
        <>
          <SectionLabel>Your habits</SectionLabel>
          <section className="mb-4 overflow-hidden rounded-2xl border border-border/60 bg-card/80">
            <ul className="divide-y divide-border/60">
              {state.habits
                .filter((h) => h.ownerId === me.id)
                .map((h) => (
                  <li
                    key={h.id}
                    className="flex items-center gap-3 px-3 py-2.5"
                  >
                    <span
                      aria-hidden
                      className="flex size-8 items-center justify-center rounded-lg bg-muted text-base"
                    >
                      {h.emoji}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13px] font-semibold leading-tight">
                        {h.name}
                      </p>
                      <p className="text-[11px] text-muted-foreground">
                        {habitIntent(h) === "break" && h.breakGoalDays != null
                          ? `Break · ${h.breakGoalDays}d goal`
                          : h.type === "frequency"
                            ? `Build · ${h.targetPerWeek ?? 1}× / week`
                            : "Daily"}
                        {" · "}
                        {h.visibility}
                      </p>
                    </div>
                    <button
                      type="button"
                      aria-label={`Delete ${h.name}`}
                      onClick={() => void removeHabit(h.id)}
                      className="rounded-full p-1.5 text-muted-foreground hover:bg-muted hover:text-destructive"
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </li>
                ))}
            </ul>
          </section>
        </>
      )}

      <Separator className="my-4" />

      <Button
        variant="ghost"
        size="sm"
        className="w-full text-destructive hover:text-destructive"
        onClick={() => {
          if (confirm("Reset Duo? This clears all local data.")) {
            resetAll();
          }
        }}
      >
        Reset everything
      </Button>

      <p className="mt-4 text-center text-[11px] text-muted-foreground">
        v0.1 · Data stored locally on this device
      </p>
    </MobileScreen>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="mb-1.5 px-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
      {children}
    </h2>
  );
}
