const SYNC_META_KEY = "duo.sync.meta.v1";

export type DuoSyncMeta = {
  dirty: boolean;
  lastSyncedAt: string | null;
  lastServerUpdatedAt: string | null;
};

const emptyMeta: DuoSyncMeta = {
  dirty: false,
  lastSyncedAt: null,
  lastServerUpdatedAt: null,
};

export function readSyncMeta(): DuoSyncMeta {
  if (typeof window === "undefined") return emptyMeta;
  try {
    const raw = window.localStorage.getItem(SYNC_META_KEY);
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
    };
  } catch {
    return { ...emptyMeta };
  }
}

export function writeSyncMeta(meta: DuoSyncMeta): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(SYNC_META_KEY, JSON.stringify(meta));
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
}): void {
  writeSyncMeta({
    dirty: false,
    lastSyncedAt: args.lastSyncedAt,
    lastServerUpdatedAt: args.lastServerUpdatedAt,
  });
}

export function clearSyncMetaStorage(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(SYNC_META_KEY);
  } catch {
    /* ignore */
  }
}

/** One day in ms — background flush interval. */
export const DEFERRED_SYNC_INTERVAL_MS = 86_400_000;
