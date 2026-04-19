"use client";

import { useAuth } from "@clerk/nextjs";
import { createBrowserClient } from "@supabase/ssr";
import { useEffect, useRef } from "react";
import { computeDuoSupabaseJwtExchangeEnabled } from "@/lib/duo-cloud";
import { useDuoRuntimeEnv } from "@/lib/duo-runtime-env";

/**
 * Phase 2: exchange Clerk session for Supabase Auth so browser PostgREST
 * calls run under RLS. Requires Clerk JWT template "supabase" + Supabase
 * third-party auth configuration.
 */
export function SupabaseJwtBridge() {
  const runtime = useDuoRuntimeEnv();
  const { getToken, isLoaded, userId } = useAuth();
  const clientRef = useRef<ReturnType<typeof createBrowserClient> | null>(null);

  useEffect(() => {
    if (
      !computeDuoSupabaseJwtExchangeEnabled(runtime) ||
      !isLoaded ||
      !userId
    ) {
      return;
    }

    const url = runtime.supabaseUrl;
    const key =
      runtime.supabasePublishableKey || runtime.supabaseAnonKey;
    if (!url || !key) return;

    if (!clientRef.current) {
      clientRef.current = createBrowserClient(url, key);
    }
    const supabase = clientRef.current;

    let cancelled = false;
    void (async () => {
      try {
        const token = await getToken({ template: "supabase" });
        if (cancelled || !token) return;
        await supabase.auth.signInWithIdToken({
          provider: "clerk",
          token,
        });
      } catch {
        // Template or Supabase third-party auth not configured yet.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [getToken, isLoaded, userId, runtime]);

  return null;
}
