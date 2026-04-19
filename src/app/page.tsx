"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useStore } from "@/lib/store";

export default function RootRedirect() {
  const router = useRouter();
  const { state, ready } = useStore();

  useEffect(() => {
    if (!ready) return;
    if (!state.me) router.replace("/onboarding");
    else router.replace("/today");
  }, [ready, state.me, router]);

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
