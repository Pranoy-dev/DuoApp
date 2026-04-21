"use client";

import { useAuth } from "@clerk/nextjs";
import { createBrowserClient } from "@supabase/ssr";
import type { RealtimePostgresInsertPayload } from "@supabase/supabase-js";
import { useEffect, useMemo, useRef } from "react";
import { computeDuoCloudClientConfigured } from "@/lib/duo-cloud";
import { useDuoRuntimeEnv } from "@/lib/duo-runtime-env";
import { useStore, type CompletionRealtimeEvent } from "@/lib/store";

type CompletionEventRow = {
  id: string;
  couple_id: string;
  habit_id: string;
  user_id: string;
  date: string;
  action: "done" | "undone";
  operation_id: string;
  version: number;
  server_ts: string;
};

/**
 * Live push for partner completion updates.
 * Falls back to existing bootstrap refresh paths if realtime auth is unavailable.
 */
export function CompletionRealtimeSync() {
  const runtime = useDuoRuntimeEnv();
  const duoCloudActive = computeDuoCloudClientConfigured(runtime);
  const {
    state,
    applyCompletionRealtimeEvent,
    refreshDeltaFromServer,
    reportRealtimeHealth,
  } = useStore();
  const { getToken, isLoaded, userId } = useAuth();
  const coupleId = state.couple?.id ?? null;
  const clientRef = useRef<ReturnType<typeof createBrowserClient> | null>(null);

  const supabaseKey = useMemo(
    () => runtime.supabasePublishableKey || runtime.supabaseAnonKey,
    [runtime.supabasePublishableKey, runtime.supabaseAnonKey],
  );

  useEffect(() => {
    if (!duoCloudActive || !isLoaded || !userId || !coupleId) return;
    if (!runtime.supabaseUrl || !supabaseKey) return;

    if (!clientRef.current) {
      clientRef.current = createBrowserClient(runtime.supabaseUrl, supabaseKey);
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
        // Optional. If JWT exchange is not configured, fallback refresh paths still run.
      }
    })();

    const channel = supabase
      .channel(`duo-events:${coupleId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "completion_events",
          filter: `couple_id=eq.${coupleId}`,
        },
        (payload: RealtimePostgresInsertPayload<CompletionEventRow>) => {
          const row = payload.new as CompletionEventRow;
          reportRealtimeHealth({ connected: true, at: row.server_ts });
          const event: CompletionRealtimeEvent = {
            operationId: row.operation_id,
            completionId: row.id,
            habitId: row.habit_id,
            userId: row.user_id,
            date: row.date,
            action: row.action,
            version: Number(row.version ?? 0),
            serverTs: row.server_ts,
          };
          applyCompletionRealtimeEvent(event);
        },
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "habits",
          filter: `couple_id=eq.${coupleId}`,
        },
        () => {
          reportRealtimeHealth({ connected: true });
          void refreshDeltaFromServer();
        },
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "cheers",
        },
        () => {
          reportRealtimeHealth({ connected: true });
          void refreshDeltaFromServer();
        },
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "milestones",
        },
        () => {
          reportRealtimeHealth({ connected: true });
          void refreshDeltaFromServer();
        },
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "day_excitement",
        },
        () => {
          reportRealtimeHealth({ connected: true });
          void refreshDeltaFromServer();
        },
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "couple_members",
          filter: `couple_id=eq.${coupleId}`,
        },
        () => {
          reportRealtimeHealth({ connected: true });
          void refreshDeltaFromServer();
        },
      )
      .subscribe((status: string) => {
        if (status === "SUBSCRIBED") {
          reportRealtimeHealth({ connected: true });
        }
        if (
          status === "CHANNEL_ERROR" ||
          status === "TIMED_OUT" ||
          status === "CLOSED"
        ) {
          reportRealtimeHealth({ connected: false });
        }
      });

    return () => {
      cancelled = true;
      void supabase.removeChannel(channel);
    };
  }, [
    applyCompletionRealtimeEvent,
    coupleId,
    duoCloudActive,
    getToken,
    isLoaded,
    runtime.supabaseUrl,
    supabaseKey,
    refreshDeltaFromServer,
    reportRealtimeHealth,
    userId,
  ]);

  return null;
}
