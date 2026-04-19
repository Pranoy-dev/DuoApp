"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useStore } from "@/lib/store";
import { TabBar } from "@/components/mobile/tab-bar";

export default function AppShellLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const { state, ready } = useStore();

  useEffect(() => {
    if (!ready) return;
    if (!state.me) router.replace("/onboarding");
  }, [ready, state.me, router]);

  if (!ready || !state.me) {
    return (
      <div className="flex h-full flex-1 items-center justify-center text-sm text-muted-foreground">
        Loading…
      </div>
    );
  }

  return (
    <div className="relative flex h-full min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 overflow-hidden">{children}</div>
      <TabBar />
    </div>
  );
}
