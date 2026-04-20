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
  const { state, ready, profileResolved } = useStore();

  useEffect(() => {
    if (!ready || !profileResolved) return;
    if (!state.me) router.replace("/onboarding");
  }, [ready, profileResolved, state.me, router]);

  if (!ready || !profileResolved || !state.me) {
    return (
      <div className="flex h-full flex-1 items-center justify-center text-sm text-muted-foreground">
        Loading…
      </div>
    );
  }

  return (
    <div className="relative flex h-full min-h-0 w-full flex-1 flex-col">
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">{children}</div>
      <TabBar />
    </div>
  );
}
