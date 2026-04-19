"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
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
  const { createAccount, createCouple, joinCouple } = useStore();
  const [step, setStep] = useState<Step>("welcome");
  const [name, setName] = useState("");
  const [emoji, setEmoji] = useState(EMOJIS[0]);
  const [tone, setTone] = useState<QuoteTone>("stoic");
  const [pairMode, setPairMode] = useState<"create" | "join" | null>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);

  const finish = async (options?: { code?: string | null }) => {
    setError(null);
    try {
      await createAccount({ name: name.trim() || "You", emoji, tone });
      if (options?.code) {
        const joined = await joinCouple(options.code);
        if (!joined) {
          setError("That code didn't match. Try again?");
          return;
        }
      } else if (pairMode === "create") {
        await createCouple();
      }
      router.replace("/today");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    }
  };

  return (
    <div className="flex h-full flex-col safe-x">
      <div className="safe-top flex items-center justify-between py-4">
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

      <div className="flex flex-1 flex-col justify-center">
        <AnimatePresence mode="wait">
          {step === "welcome" && (
            <StepFrame key="welcome">
              <Hero />
              <div className="mt-10 flex flex-col gap-3">
                <Button
                  size="lg"
                  className="h-12 w-full rounded-2xl text-base"
                  onClick={() => setStep("name")}
                >
                  Let's begin <ArrowRight className="ml-1.5 size-4" />
                </Button>
                <p className="text-center text-xs text-muted-foreground">
                  Takes under a minute.
                </p>
              </div>
            </StepFrame>
          )}

          {step === "name" && (
            <StepFrame key="name">
              <StepHeader
                eyebrow="Step 1 of 3"
                title="What should we call you?"
                blurb="This is how your partner will see you."
              />
              <div className="mt-8 grid gap-5">
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
              <div className="mt-8">
                <Button
                  size="lg"
                  className="h-12 w-full rounded-2xl text-base"
                  onClick={() => setStep("tone")}
                  disabled={!name.trim()}
                >
                  Continue
                </Button>
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
              <div className="mt-6 flex flex-col gap-2">
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
                        className="flex size-6 items-center justify-center rounded-full bg-foreground text-background"
                      >
                        ✓
                      </span>
                    )}
                  </button>
                ))}
              </div>
              <div className="mt-8">
                <Button
                  size="lg"
                  className="h-12 w-full rounded-2xl text-base"
                  onClick={() => setStep("pair")}
                >
                  Continue
                </Button>
              </div>
            </StepFrame>
          )}

          {step === "pair" && (
            <StepFrame key="pair">
              <StepHeader
                eyebrow="Step 3 of 3"
                title="Are you the first one here?"
                blurb="You can invite your partner now or join with a code they sent."
              />
              <div className="mt-6 grid gap-3">
                <button
                  type="button"
                  onClick={() => setPairMode("create")}
                  className={`rounded-2xl border p-4 text-left transition-colors ${
                    pairMode === "create"
                      ? "border-foreground bg-foreground/5"
                      : "border-border hover:border-foreground/40"
                  }`}
                >
                  <p className="text-base font-semibold">I'll invite my partner</p>
                  <p className="text-sm text-muted-foreground">
                    Create a pair now and share the code.
                  </p>
                </button>
                <button
                  type="button"
                  onClick={() => setPairMode("join")}
                  className={`rounded-2xl border p-4 text-left transition-colors ${
                    pairMode === "join"
                      ? "border-foreground bg-foreground/5"
                      : "border-border hover:border-foreground/40"
                  }`}
                >
                  <p className="text-base font-semibold">I have a code</p>
                  <p className="text-sm text-muted-foreground">
                    Join the pair your partner already started.
                  </p>
                </button>
              </div>
              <div className="mt-8">
                <Button
                  size="lg"
                  className="h-12 w-full rounded-2xl text-base"
                  onClick={() => {
                    if (pairMode === "create") void finish();
                    else if (pairMode === "join") setStep("invite");
                  }}
                  disabled={!pairMode}
                >
                  Continue
                </Button>
              </div>
            </StepFrame>
          )}

          {step === "invite" && (
            <StepFrame key="invite">
              <StepHeader
                eyebrow="Almost there"
                title="Enter the code"
                blurb="Ask your partner to share it from Settings on their phone."
              />
              <div className="mt-6">
                <Label htmlFor="code">Invite code</Label>
                <Input
                  id="code"
                  value={code}
                  onChange={(e) => {
                    setCode(e.target.value.toUpperCase());
                    setError(null);
                  }}
                  placeholder="ABC123"
                  className="mt-1.5 h-14 rounded-2xl text-center font-mono text-2xl tracking-[0.3em]"
                  maxLength={8}
                  autoFocus
                />
                {error && (
                  <p className="mt-2 text-sm text-destructive">{error}</p>
                )}
              </div>
              <div className="mt-8">
                <Button
                  size="lg"
                  className="h-12 w-full rounded-2xl text-base"
                  onClick={() => void finish({ code })}
                  disabled={code.length < 4}
                >
                  Join pair
                </Button>
              </div>
            </StepFrame>
          )}
        </AnimatePresence>
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
