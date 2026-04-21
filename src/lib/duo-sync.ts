const LEGACY_SYNC_META_KEY = "duo.sync.meta.v1";
let syncMetaKey = LEGACY_SYNC_META_KEY;

export type DuoSyncMeta = {
  dirty: boolean;
  lastSyncedAt: string | null;
  lastServerUpdatedAt: string | null;
  lastCursor: string | null;
  lastRealtimeEventAt: string | null;
  realtimeDisconnects: number;
  fallbackPullCount: number;
};

const emptyMeta: DuoSyncMeta = {
  dirty: false,
  lastSyncedAt: null,
  lastServerUpdatedAt: null,
  lastCursor: null,
  lastRealtimeEventAt: null,
  realtimeDisconnects: 0,
  fallbackPullCount: 0,
};

export function setSyncMetaScope(scope: string): void {
  syncMetaKey = `duo.sync.meta.v1:${scope}`;
}

export function readSyncMeta(): DuoSyncMeta {
  if (typeof window === "undefined") return emptyMeta;
  try {
    const raw =
      window.localStorage.getItem(syncMetaKey) ??
      window.localStorage.getItem(LEGACY_SYNC_META_KEY);
    if (!raw) return { ...emptyMeta };
    const o = JSON.parse(raw) as Partial<DuoSyncMeta>;
    return {
      dirty: Boolean(o.dirty),
      lastSyncedAt:
        typeof o.lastSyncedAt === "string" ? o.lastSyncedAt : null,
      lastServerUpdatedAt:
        typeof o.lastServerUpdatedAt === "string"
          ? o.lastServerUpdatedAt
          : null,
      lastCursor: typeof o.lastCursor === "string" ? o.lastCursor : null,
      lastRealtimeEventAt:
        typeof o.lastRealtimeEventAt === "string" ? o.lastRealtimeEventAt : null,
      realtimeDisconnects:
        typeof o.realtimeDisconnects === "number"
          ? Math.max(0, Math.floor(o.realtimeDisconnects))
          : 0,
      fallbackPullCount:
        typeof o.fallbackPullCount === "number"
          ? Math.max(0, Math.floor(o.fallbackPullCount))
          : 0,
    };
  } catch {
    return { ...emptyMeta };
  }
}

export function writeSyncMeta(meta: DuoSyncMeta): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(syncMetaKey, JSON.stringify(meta));
  } catch {
    /* ignore */
  }
}

export function markSyncDirty(): void {
  const prev = readSyncMeta();
  writeSyncMeta({ ...prev, dirty: true });
}

export function clearSyncDirty(args: {
  lastSyncedAt: string;
  lastServerUpdatedAt: string;
  lastCursor?: string | null;
}): void {
  const prev = readSyncMeta();
  writeSyncMeta({
    dirty: false,
    lastSyncedAt: args.lastSyncedAt,
    lastServerUpdatedAt: args.lastServerUpdatedAt,
    lastCursor: args.lastCursor ?? prev.lastCursor,
    lastRealtimeEventAt: prev.lastRealtimeEventAt,
    realtimeDisconnects: prev.realtimeDisconnects,
    fallbackPullCount: prev.fallbackPullCount,
  });
}

export function updateSyncCursor(cursor: string): void {
  const prev = readSyncMeta();
  writeSyncMeta({ ...prev, lastCursor: cursor });
}

export function markRealtimeEventSeen(isoTs?: string): void {
  const prev = readSyncMeta();
  writeSyncMeta({ ...prev, lastRealtimeEventAt: isoTs ?? new Date().toISOString() });
}

export function incrementRealtimeDisconnects(): void {
  const prev = readSyncMeta();
  writeSyncMeta({ ...prev, realtimeDisconnects: prev.realtimeDisconnects + 1 });
}

export function incrementFallbackPullCount(): void {
  const prev = readSyncMeta();
  writeSyncMeta({ ...prev, fallbackPullCount: prev.fallbackPullCount + 1 });
}

export function clearSyncMetaStorage(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(syncMetaKey);
    if (syncMetaKey !== LEGACY_SYNC_META_KEY) {
      window.localStorage.removeItem(LEGACY_SYNC_META_KEY);
    }
  } catch {
    /* ignore */
  }
}

/** One day in ms — background flush interval. */
export const DEFERRED_SYNC_INTERVAL_MS = 86_400_000;

/** Mark dirty and flush deferred snapshot on the next microtask (after React state commits). */
export function requestDeferredSnapshotFlushSoon(): void {
  if (typeof window === "undefined") return;
  markSyncDirty();
  queueMicrotask(() => {
    window.dispatchEvent(new CustomEvent("duo:deferred-sync-now"));
  });
}
