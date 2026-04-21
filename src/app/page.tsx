"use client";

import { useAuth } from "@clerk/nextjs";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { LoadingScreen } from "@/components/mobile/loading-screen";
import { useDuoRuntimeEnv } from "@/lib/duo-runtime-env";
import { useStore } from "@/lib/store";

/** Local-only mode: no Clerk; profile lives in localStorage. */
function LocalRootRedirect() {
  const router = useRouter();
  const { state, ready, profileResolved } = useStore();

  useEffect(() => {
    if (!ready || !profileResolved) return;
    if (!state.me) router.replace("/onboarding");
    else router.replace("/today");
  }, [ready, profileResolved, state.me, router]);

  return <LoadingScreen title="Loading Duo..." subtitle="Preparing your day" />;
}

/**
 * With Clerk configured, wait for session before sending anonymous users to
 * onboarding (onboarding is for Duo profile setup after sign-in).
 */
function ClerkRootRedirect({ signInPath }: { signInPath: string }) {
  const router = useRouter();
  const { state, ready, profileResolved } = useStore();
  const { isLoaded, userId } = useAuth();
  const signedOut = isLoaded && !userId;

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

  return (
    <LoadingScreen
      title={signedOut ? "Logging out..." : "Loading Duo..."}
      subtitle={signedOut ? "Redirecting to sign-in" : "Preparing your day"}
    />
  );
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
