"use client";

import { useAuth } from "@clerk/nextjs";
import { useCallback, useEffect, useRef } from "react";
import * as duoActions from "@/app/actions/duo";
import {
  computeDeferredSnapshotClientEnabled,
  computeDuoCloudClientConfigured,
} from "@/lib/duo-cloud";
import { useDuoRuntimeEnv } from "@/lib/duo-runtime-env";
import {
  clearSyncDirty,
  DEFERRED_SYNC_INTERVAL_MS,
  readSyncMeta,
  writeSyncMeta,
} from "@/lib/duo-sync";
import { useStore } from "@/lib/store";

/**
 * Pull server snapshot after sign-in, push on interval / visibility / manual trigger.
 * Only active when deferred snapshot env is on and live server-backed Duo is off.
 */
export function DeferredSnapshotSync() {
  const duoRuntime = useDuoRuntimeEnv();
  const duoCloudActive = computeDuoCloudClientConfigured(duoRuntime);
  const deferredEnabled = computeDeferredSnapshotClientEnabled(duoRuntime);
  const { isLoaded, userId } = useAuth();
  const { state, ready, applyRemoteHydration } = useStore();
  const stateRef = useRef(state);
  const userIdRef = useRef(userId);
  const pulledRef = useRef(false);

  const shouldRun = deferredEnabled && !duoCloudActive && ready;
  const shouldPullForMembershipOrPartnerHabits = Boolean(
    state.me &&
      state.couple &&
      ((state.couple.members?.length ?? 0) < 2 ||
        state.habits.filter(
          (h) =>
            h.visibility === "shared" &&
            h.ownerId !== state.me?.id,
        ).length === 0),
  );

  const flush = useCallback(async () => {
    if (!userIdRef.current) return;
    const meta = readSyncMeta();
    if (!meta.dirty) return;
    const r = await duoActions.pushDeferredSnapshotAction(
      JSON.stringify(stateRef.current),
    );
    if (!r.ok || !r.data) return;
    const now = new Date().toISOString();
    clearSyncDirty({
      lastSyncedAt: now,
      lastServerUpdatedAt: r.data.updatedAt,
    });
  }, []);

  // Pull once per mount after Clerk is ready (server wins if newer).
  const pullIfNewer = useCallback(async () => {
    const r = await duoActions.pullDeferredSnapshotAction();
    if (!r.ok || !r.data) return;
    const { state: remote, updatedAt } = r.data;
    const meta = readSyncMeta();
    const serverTs = new Date(updatedAt).getTime();
    const localTs = meta.lastServerUpdatedAt
      ? new Date(meta.lastServerUpdatedAt).getTime()
      : 0;
    if (serverTs > localTs) {
      applyRemoteHydration(remote);
      writeSyncMeta({
        ...meta,
        lastServerUpdatedAt: updatedAt,
        dirty: false,
      });
    }
  }, [applyRemoteHydration]);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    userIdRef.current = userId;
  }, [userId]);

  useEffect(() => {
    if (!shouldRun || !isLoaded || !userId) return;
    if (pulledRef.current) return;
    pulledRef.current = true;
    void pullIfNewer();
  }, [shouldRun, isLoaded, userId, pullIfNewer]);

  // Daily interval + flush when tab becomes visible and online.
  useEffect(() => {
    if (!shouldRun || !userId) return;
    const id = window.setInterval(() => {
      void flush();
      if (shouldPullForMembershipOrPartnerHabits) {
        void pullIfNewer();
      }
    }, DEFERRED_SYNC_INTERVAL_MS);
    const onVis = () => {
      if (
        document.visibilityState === "visible" &&
        typeof navigator !== "undefined" &&
        navigator.onLine
      ) {
        void flush();
        if (shouldPullForMembershipOrPartnerHabits) {
          void pullIfNewer();
        }
      }
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [
    shouldRun,
    userId,
    flush,
    pullIfNewer,
    shouldPullForMembershipOrPartnerHabits,
  ]);

  useEffect(() => {
    if (!shouldRun) return;
    const handler = () => {
      void flush();
    };
    window.addEventListener("duo:deferred-sync-now", handler);
    return () => window.removeEventListener("duo:deferred-sync-now", handler);
  }, [shouldRun, flush]);

  return null;
}
