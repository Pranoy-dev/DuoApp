"use client";

import { useAuth } from "@clerk/nextjs";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useDuoRuntimeEnv } from "@/lib/duo-runtime-env";
import { useStore } from "@/lib/store";

function LoadingDuo() {
  return (
    <div className="flex h-full flex-1 items-center justify-center">
      <div className="flex items-center gap-3 text-muted-foreground">
        <span
          aria-hidden
          className="inline-block size-2 animate-pulse rounded-full bg-duo"
        />
        <span className="text-sm">Loading Duo…</span>
      </div>
    </div>
  );
}

/** Local-only mode: no Clerk; profile lives in localStorage. */
function LocalRootRedirect() {
  const router = useRouter();
  const { state, ready, profileResolved } = useStore();

  useEffect(() => {
    if (!ready || !profileResolved) return;
    if (!state.me) router.replace("/onboarding");
    else router.replace("/today");
  }, [ready, profileResolved, state.me, router]);

  return <LoadingDuo />;
}

/**
 * With Clerk configured, wait for session before sending anonymous users to
 * onboarding (onboarding is for Duo profile setup after sign-in).
 */
function ClerkRootRedirect({ signInPath }: { signInPath: string }) {
  const router = useRouter();
  const { state, ready, profileResolved } = useStore();
  const { isLoaded, userId } = useAuth();

  useEffect(() => {
    if (!ready) return;
    if (!isLoaded) return;
    if (!userId) {
      router.replace(signInPath);
      return;
    }
    if (!profileResolved) return;
    if (!state.me) router.replace("/onboarding");
    else router.replace("/today");
  }, [ready, profileResolved, state.me, router, isLoaded, userId, signInPath]);

  return <LoadingDuo />;
}

export default function RootRedirect() {
  const { clerkPublishableKey, clerkSignInUrl } = useDuoRuntimeEnv();
  const clerkPk = clerkPublishableKey.trim();
  return clerkPk ? (
    <ClerkRootRedirect signInPath={clerkSignInUrl} />
  ) : (
    <LocalRootRedirect />
  );
}
