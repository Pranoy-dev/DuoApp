"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { Copy, Share2 } from "lucide-react";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useStore } from "@/lib/store";
import { QUOTE_TONES } from "@/lib/quotes";
import type { QuoteTone } from "@/lib/types";

const EMOJIS = ["☀️", "🌙", "🌷", "🌊", "🌿", "⭐️", "🍊", "🫧"];

type Step = "welcome" | "name" | "tone" | "pair" | "invite" | "done";

export default function OnboardingPage() {
  const router = useRouter();
  const { createAccount, createCouple } = useStore();
  const [step, setStep] = useState<Step>("welcome");
  const [name, setName] = useState("");
  const [emoji, setEmoji] = useState(EMOJIS[0]);
  const [tone, setTone] = useState<QuoteTone>("stoic");
  const [inviteLink, setInviteLink] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [inviteReady, setInviteReady] = useState(false);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const buildInviteLink = (nextInviteCode: string): string => {
    if (typeof window === "undefined") return `/invite/${nextInviteCode}`;
    return `${window.location.origin}/invite/${nextInviteCode}`;
  };

  const startInviteFlow = async () => {
    setError(null);
    setWorking(true);
    try {
      await createAccount({ name: name.trim() || "You", emoji, tone });
      const couple = await createCouple();
      setInviteCode(couple.inviteCode);
      setInviteLink(buildInviteLink(couple.inviteCode));
      setInviteReady(true);
      setStep("invite");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not create invite link.");
    } finally {
      setWorking(false);
    }
  };

  const copyInviteLink = async () => {
    if (!inviteLink) return;
    try {
      await navigator.clipboard.writeText(inviteLink);
    } catch {
      setError("Could not copy link automatically. Long-press and copy it.");
    }
  };

  const shareInviteLink = async () => {
    if (!inviteLink) return;
    const nav = typeof navigator !== "undefined" ? navigator : null;
    const canShare = nav && "share" in nav;
    if (!canShare) {
      await copyInviteLink();
      return;
    }
    try {
      await (nav as Navigator & { share: (d: ShareData) => Promise<void> }).share({
        title: "Join my Duo pair",
        text: "Tap this link to join my Duo pair.",
        url: inviteLink,
      });
    } catch {
      // user cancelled or share failed; keep flow uninterrupted
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col safe-x">
      <div className="safe-top flex shrink-0 items-center justify-between py-4">
        <div className="flex items-center gap-2 text-sm font-semibold tracking-tight">
          <span
            aria-hidden
            className="flex size-7 items-center justify-center rounded-xl bg-gradient-to-br from-duo to-duo-soft text-duo-foreground"
          >
            ✦
          </span>
          Duo
        </div>
        {step !== "welcome" && step !== "done" && (
          <button
            type="button"
            onClick={() => {
              const order: Step[] = ["welcome", "name", "tone", "pair", "invite"];
              const i = order.indexOf(step);
              if (i > 0) setStep(order[i - 1]);
            }}
            className="text-sm text-muted-foreground hover:text-foreground"
          >
            Back
          </button>
        )}
      </div>

      <div className="flex min-h-0 flex-1 flex-col">
        <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-contain px-0.5 pt-2">
          <AnimatePresence mode="wait">
            {step === "welcome" && (
              <StepFrame key="welcome">
                <Hero />
                <p className="mt-8 text-center text-xs text-muted-foreground">
                  Takes under a minute.
                </p>
              </StepFrame>
            )}

            {step === "name" && (
              <StepFrame key="name">
                <StepHeader
                  eyebrow="Step 1 of 3"
                  title="What should we call you?"
                  blurb="This is how your partner will see you."
                />
                <div className="mt-8 grid gap-5 pb-4">
                  <div>
                    <Label htmlFor="name">First name</Label>
                    <Input
                      id="name"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="Alex"
                      className="mt-1.5 h-12 rounded-2xl text-base"
                      autoFocus
                    />
                  </div>
                  <div>
                    <Label>Pick an icon</Label>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {EMOJIS.map((e) => (
                        <button
                          key={e}
                          type="button"
                          onClick={() => setEmoji(e)}
                          className={`flex size-12 items-center justify-center rounded-2xl border text-2xl transition-colors ${
                            emoji === e
                              ? "border-foreground bg-foreground/5"
                              : "border-border hover:border-foreground/40"
                          }`}
                        >
                          {e}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </StepFrame>
            )}

            {step === "tone" && (
              <StepFrame key="tone">
                <StepHeader
                  eyebrow="Step 2 of 3"
                  title="Pick your tone"
                  blurb="Your daily quote is chosen from this shelf. You can switch later."
                />
                <div className="mt-6 flex flex-col gap-2 pb-4">
                  {QUOTE_TONES.map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => setTone(t.id as QuoteTone)}
                      className={`flex items-center justify-between rounded-2xl border px-4 py-3.5 text-left transition-colors ${
                        tone === t.id
                          ? "border-foreground bg-foreground/5"
                          : "border-border hover:border-foreground/40"
                      }`}
                    >
                      <div>
                        <p className="text-base font-semibold">{t.label}</p>
                        <p className="text-sm text-muted-foreground">{t.blurb}</p>
                      </div>
                      {tone === t.id && (
                        <span
                          aria-hidden
                          className="flex size-6 shrink-0 items-center justify-center rounded-full bg-foreground text-background"
                        >
                          ✓
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              </StepFrame>
            )}

            {step === "pair" && (
              <StepFrame key="pair">
                <StepHeader
                  eyebrow="Step 3 of 3"
                  title="Are you the first one here?"
                  blurb="Create your pair and share a deep link with your partner."
                />
                <div className="mt-6 grid gap-3 pb-4">
                  <button
                    type="button"
                    onClick={() => void startInviteFlow()}
                    className="rounded-2xl border border-border p-4 text-left transition-colors hover:border-foreground/40"
                    disabled={working}
                  >
                    <p className="text-base font-semibold">I'll invite my partner</p>
                    <p className="text-sm text-muted-foreground">
                      Create a pair now and share a private invite link.
                    </p>
                  </button>
                </div>
              </StepFrame>
            )}

            {step === "invite" && (
              <StepFrame key="invite">
                <StepHeader
                  eyebrow="Share this link"
                  title="Invite your partner"
                  blurb="Send this deep link. Whoever opens it will join your pair directly."
                />
                <div className="mt-6 pb-4">
                  <Label htmlFor="invite-link">Invite link</Label>
                  <Input
                    id="invite-link"
                    value={inviteLink}
                    readOnly
                    className="mt-1.5 h-12 rounded-2xl text-sm"
                  />
                  <p className="mt-2 text-xs text-muted-foreground">
                    Code:{" "}
                    <span className="font-mono tracking-wider text-foreground">
                      {inviteCode || "—"}
                    </span>
                  </p>
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <Button
                      type="button"
                      variant="secondary"
                      className="h-10 rounded-xl"
                      onClick={() => void copyInviteLink()}
                      disabled={!inviteReady}
                    >
                      <Copy className="mr-1.5 size-4" />
                      Copy link
                    </Button>
                    <Button
                      type="button"
                      className="h-10 rounded-xl"
                      onClick={() => void shareInviteLink()}
                      disabled={!inviteReady}
                    >
                      <Share2 className="mr-1.5 size-4" />
                      Share
                    </Button>
                  </div>
                  {error && (
                    <p className="mt-2 text-sm text-destructive">{error}</p>
                  )}
                </div>
              </StepFrame>
            )}
          </AnimatePresence>
        </div>

        <div className="shrink-0 border-t border-border/60 bg-background/90 px-0.5 pt-3 shadow-[0_-8px_24px_-8px_rgba(0,0,0,0.12)] backdrop-blur-xl pb-[max(env(safe-area-inset-bottom),0.75rem)]">
          {step === "welcome" && (
            <Button
              size="lg"
              className="h-12 w-full rounded-2xl text-base"
              onClick={() => setStep("name")}
            >
              Let&apos;s begin <ArrowRight className="ml-1.5 size-4" />
            </Button>
          )}
          {step === "name" && (
            <Button
              size="lg"
              className="h-12 w-full rounded-2xl text-base"
              onClick={() => setStep("tone")}
              disabled={!name.trim()}
            >
              Continue
            </Button>
          )}
          {step === "tone" && (
            <Button
              size="lg"
              className="h-12 w-full rounded-2xl text-base"
              onClick={() => setStep("pair")}
            >
              Continue
            </Button>
          )}
          {step === "pair" && (
            <Button
              size="lg"
              className="h-12 w-full rounded-2xl text-base"
              onClick={() => void startInviteFlow()}
              disabled={working}
            >
              {working ? "Preparing link..." : "Continue"}
            </Button>
          )}
          {step === "invite" && (
            <Button
              size="lg"
              className="h-12 w-full rounded-2xl text-base"
              onClick={() => {
                router.replace("/today");
              }}
              disabled={!inviteReady}
            >
              Done
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

function StepFrame({ children }: { children: React.ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.22, ease: "easeOut" }}
      className="w-full"
    >
      {children}
    </motion.div>
  );
}

function StepHeader({
  eyebrow,
  title,
  blurb,
}: {
  eyebrow: string;
  title: string;
  blurb: string;
}) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-[0.25em] text-muted-foreground">
        {eyebrow}
      </p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight">{title}</h1>
      <p className="mt-2 text-base text-muted-foreground">{blurb}</p>
    </div>
  );
}

function Hero() {
  return (
    <div className="flex flex-col items-center text-center">
      <div className="relative mb-6 flex size-28 items-center justify-center">
        <span
          aria-hidden
          className="absolute size-20 rounded-full bg-gradient-to-br from-duo to-duo-soft opacity-80"
        />
        <span
          aria-hidden
          className="absolute size-20 translate-x-5 rounded-full bg-gradient-to-br from-accent to-duo-soft opacity-80 mix-blend-multiply"
        />
      </div>
      <p className="text-xs font-semibold uppercase tracking-[0.3em] text-muted-foreground">
        Duo
      </p>
      <h1 className="mt-2 text-4xl font-semibold leading-tight tracking-tight">
        A habit streak
        <br />
        for two.
      </h1>
      <p className="mt-4 max-w-[280px] text-base text-muted-foreground">
        Small daily wins, together. One quiet quote a day as the reward.
      </p>
    </div>
  );
}
