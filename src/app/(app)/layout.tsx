"use client";

import { useAuth } from "@clerk/nextjs";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { LoadingScreen } from "@/components/mobile/loading-screen";
import { useDuoRuntimeEnv } from "@/lib/duo-runtime-env";
import { useStore } from "@/lib/store";
import { TabBar } from "@/components/mobile/tab-bar";

export default function AppShellLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const duoRuntime = useDuoRuntimeEnv();
  const clerkConfigured = Boolean(duoRuntime.clerkPublishableKey.trim());
  const { isLoaded, userId } = useAuth();
  const { state, ready, profileResolved } = useStore();

  useEffect(() => {
    if (clerkConfigured) {
      if (!isLoaded) return;
      if (!userId) {
        router.replace(duoRuntime.clerkSignInUrl || "/sign-in");
        return;
      }
    }
    if (!ready || !profileResolved) return;
    if (!state.me) router.replace("/onboarding");
  }, [
    clerkConfigured,
    isLoaded,
    userId,
    ready,
    profileResolved,
    state.me,
    router,
    duoRuntime.clerkSignInUrl,
  ]);

  if (!ready || !profileResolved || !state.me) {
    return (
      <LoadingScreen
        title="Loading Duo..."
        subtitle="Syncing your habits and partner updates"
      />
    );
  }

  if (clerkConfigured && (!isLoaded || !userId)) {
    return (
      <LoadingScreen
        title="Loading Duo..."
        subtitle="Syncing your habits and partner updates"
      />
    );
  }

  return (
    <div className="relative flex h-full min-h-0 w-full flex-1 flex-col">
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">{children}</div>
      <TabBar />
    </div>
  );
}
