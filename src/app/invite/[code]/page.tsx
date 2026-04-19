"use client";

import { useAuth } from "@clerk/nextjs";
import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { computeServerCoupleActionsEnabled } from "@/lib/duo-cloud";
import { useDuoRuntimeEnv } from "@/lib/duo-runtime-env";
import { useStore } from "@/lib/store";

type PageProps = { params: Promise<{ code: string }> };

function InviteSignInRedirect({ normalized }: { normalized: string }) {
  const { userId, isLoaded } = useAuth();
  const router = useRouter();
  useEffect(() => {
    if (!isLoaded || userId) return;
    router.replace(
      `/sign-up?redirect_url=${encodeURIComponent(`/invite/${normalized}`)}`,
    );
  }, [isLoaded, userId, normalized, router]);
  return null;
}

export default function InviteLanding({ params }: PageProps) {
  const duoRuntime = useDuoRuntimeEnv();
  const clerkInviteGate = computeServerCoupleActionsEnabled(duoRuntime);
  const { code } = use(params);
  const normalized = (code ?? "").toUpperCase();
  const router = useRouter();
  const { state, ready, createAccount, joinCouple } = useStore();
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!ready) return;
    if (state.me && state.couple?.inviteCode === normalized) {
      router.replace("/today");
    }
  }, [ready, state.me, state.couple, normalized, router]);

  const accept = () => {
    void (async () => {
      setError(null);
      try {
        if (!state.me) {
          await createAccount({
            name: name.trim() || "Partner",
            emoji: "🌙",
            tone: "stoic",
          });
        }
        const joined = await joinCouple(normalized, {
          name: name.trim() || "Partner",
        });
        if (!joined) {
          setError("That code didn't match any pair.");
          return;
        }
        router.replace("/today");
      } catch (e) {
        setError(e instanceof Error ? e.message : "Something went wrong");
      }
    })();
  };

  return (
    <div className="flex h-full flex-col safe-x">
      {clerkInviteGate ? (
        <InviteSignInRedirect normalized={normalized} />
      ) : null}
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
      </div>
      <div className="flex flex-1 flex-col justify-center">
        <div className="text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-muted-foreground">
            You've been invited
          </p>
          <h1 className="mt-3 text-4xl font-semibold leading-tight tracking-tight">
            Join the pair
          </h1>
          <p className="mt-3 text-base text-muted-foreground">
            Code{" "}
            <span className="font-mono text-foreground">{normalized}</span>
          </p>
        </div>
        <div className="mt-10 grid gap-5">
          <div>
            <Label htmlFor="invite-name">Your first name</Label>
            <Input
              id="invite-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Sam"
              className="mt-1.5 h-12 rounded-2xl text-base"
              autoFocus
            />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button
            size="lg"
            className="h-12 w-full rounded-2xl text-base"
            onClick={accept}
          >
            Join your partner
          </Button>
          <p className="text-center text-xs text-muted-foreground">
            You can personalize everything after joining.
          </p>
        </div>
      </div>
    </div>
  );
}
