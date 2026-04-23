"use client";

import { useAuth } from "@clerk/nextjs";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import * as duoActions from "@/app/actions/duo";
import { runClerkSignOut } from "@/lib/clerk-signout-ref";
import {
  computeDuoCloudClientConfigured,
  computeServerCoupleActionsEnabled,
} from "@/lib/duo-cloud";
import { useDuoRuntimeEnv } from "@/lib/duo-runtime-env";
import {
  markSyncDirty,
  clearSyncMetaStorage,
  clearSyncDirty,
  incrementFallbackPullCount,
  incrementRealtimeDisconnects,
  markRealtimeEventSeen,
  readSyncMeta,
  requestDeferredSnapshotFlushSoon,
  setSyncMetaScope,
  updateSyncCursor,
} from "@/lib/duo-sync";
import type {
  AppState,
  Cheer,
  Completion,
  Couple,
  DayExcitementEntry,
  Habit,
  JournalEntry,
  JournalUserBucket,
  MilestoneAchievement,
  Person,
} from "./types";
import { habitIntent } from "./types";
import { todayKey, toDateKey, diffDays, addDays } from "./date";
import { replenishPersonRevives } from "./revives";
import { MILESTONE_TIERS } from "./milestones";

const LEGACY_STORAGE_KEY = "duo.state.v1";
const ADAPTIVE_POLL_STEPS_MS = [5_000, 10_000, 20_000, 40_000] as const;
const STALE_SYNC_THRESHOLD_MS = 90_000;

const EMPTY: AppState = {
  me: null,
  couple: null,
  habits: [],
  completions: [],
  cheers: [],
  milestones: [],
  dayExcitement: [],
  journalEntries: [],
  journalUserBuckets: [],
};

function uid(prefix = "id"): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 9)}${Date.now().toString(36).slice(-4)}`;
}

function getDeviceId(): string {
  if (typeof window === "undefined") return "server";
  const key = "duo.device.id";
  try {
    const existing = window.localStorage.getItem(key);
    if (existing) return existing;
    const generated = uid("device");
    window.localStorage.setItem(key, generated);
    return generated;
  } catch {
    return uid("device");
  }
}

function inviteCode(): string {
  const chars = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < 6; i += 1) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

function normalizeHabit(h: Habit): Habit {
  return { ...h, intent: habitIntent(h) };
}

const MS_14D = 14 * 86_400_000;

function normalizePerson(p: Person): Person {
  const raw = p as Person & { streakRevivesNextRefillAt?: string };
  const merged: Person = {
    ...raw,
    streakRevivesRemaining: raw.streakRevivesRemaining ?? 3,
    streakRevivesNextRefillAt:
      raw.streakRevivesNextRefillAt ??
      new Date(Date.now() + MS_14D).toISOString(),
  };
  return replenishPersonRevives(merged);
}

function applyReplenishToState(s: AppState): AppState {
  return {
    ...s,
    me: s.me ? replenishPersonRevives(s.me) : null,
    couple: s.couple
      ? {
          ...s.couple,
          members: s.couple.members.map((m) => replenishPersonRevives(m)),
        }
      : null,
  };
}

function storageScope(args: {
  clerkUserId: string | null;
  duoCloudActive: boolean;
  deferredSnapshot: boolean;
}): string {
  const mode = args.duoCloudActive
    ? "cloud"
    : args.deferredSnapshot
      ? "deferred"
      : "local";
  return `${mode}:${args.clerkUserId ?? "anon"}`;
}

function storageKeyForScope(scope: string): string {
  return `${LEGACY_STORAGE_KEY}:${scope}`;
}

function readInitial(storageKey: string): AppState {
  if (typeof window === "undefined") return EMPTY;
  try {
    const raw =
      window.localStorage.getItem(storageKey) ??
      window.localStorage.getItem(LEGACY_STORAGE_KEY);
    if (!raw) return EMPTY;
    const parsed = JSON.parse(raw) as AppState;
    const habits = (parsed.habits ?? []).map((h) => normalizeHabit(h as Habit));
    const me = parsed.me ? normalizePerson(parsed.me as Person) : null;
    const couple = parsed.couple
      ? {
          ...parsed.couple,
          members: (parsed.couple.members ?? []).map((m) =>
            normalizePerson(m as Person),
          ),
        }
      : null;
    return {
      ...EMPTY,
      ...parsed,
      habits,
      me,
      couple,
      dayExcitement: parsed.dayExcitement ?? [],
      journalEntries: parsed.journalEntries ?? [],
      journalUserBuckets: parsed.journalUserBuckets ?? [],
    };
  } catch {
    return EMPTY;
  }
}

function firstCompletionForUserOnDate(
  completions: Completion[],
  userId: string,
  date: string,
): boolean {
  return !completions.some((c) => c.userId === userId && c.date === date);
}

function sharedCoupleStreakDays(
  completions: Completion[],
  memberIds: string[],
  asOfDate: string,
): number {
  if (memberIds.length < 2) return 0;
  const memberSet = new Set(memberIds);
  const doneByDate = new Map<string, Set<string>>();
  for (const c of completions) {
    if (!memberSet.has(c.userId)) continue;
    const bucket = doneByDate.get(c.date) ?? new Set<string>();
    bucket.add(c.userId);
    doneByDate.set(c.date, bucket);
  }

  let streak = 0;
  let cursor = asOfDate;
  while (true) {
    const done = doneByDate.get(cursor);
    const everyoneDone = memberIds.every((id) => done?.has(id));
    if (!everyoneDone) break;
    streak += 1;
    cursor = toDateKey(addDays(new Date(`${cursor}T00:00:00`), -1));
  }
  return streak;
}

function globalMilestonesAfterFirstDailyCompletion(
  s: AppState,
  date: string,
  completions: Completion[],
): MilestoneAchievement[] {
  if (!s.couple || s.couple.members.length < 2) return [];
  const memberIds = s.couple.members.map((m) => m.id);
  const streak = sharedCoupleStreakDays(completions, memberIds, date);
  const unlocked: MilestoneAchievement[] = [];
  for (const memberId of memberIds) {
    const already = new Set(
      s.milestones.filter((m) => m.userId === memberId).map((m) => m.tier),
    );
    for (const tier of MILESTONE_TIERS) {
      if (streak >= tier && !already.has(tier)) {
        unlocked.push({
          id: uid("m"),
          userId: memberId,
          tier,
          achievedAt: new Date().toISOString(),
        });
      }
    }
  }
  return unlocked;
}

function completionIdentity(habitId: string, userId: string, date: string): string {
  return `${habitId}::${userId}::${date}`;
}

function completionDoneInState(
  s: AppState,
  habitId: string,
  userId: string,
  date: string,
): boolean {
  return s.completions.some(
    (c) => c.habitId === habitId && c.userId === userId && c.date === date,
  );
}

function applyCompletionState(
  s: AppState,
  args: { habitId: string; userId: string; date: string; done: boolean; completionId?: string },
): AppState {
  const existing = s.completions.find(
    (c) =>
      c.habitId === args.habitId &&
      c.userId === args.userId &&
      c.date === args.date,
  );
  let completions = s.completions;
  if (args.done) {
    if (!existing) {
      completions = [
        ...s.completions,
        {
          id: args.completionId ?? uid("x"),
          habitId: args.habitId,
          userId: args.userId,
          date: args.date,
        },
      ];
    }
  } else if (existing) {
    completions = s.completions.filter((c) => c !== existing);
  }

  return { ...s, completions };
}

function applyCompletionWithGlobalMilestones(
  s: AppState,
  args: { habitId: string; userId: string; date: string; done: boolean; completionId?: string },
): AppState {
  const before = completionDoneInState(s, args.habitId, args.userId, args.date);
  const wasFirstForDay =
    args.done && !before && firstCompletionForUserOnDate(s.completions, args.userId, args.date);
  const next = applyCompletionState(s, args);
  if (!wasFirstForDay) return next;
  const unlocked = globalMilestonesAfterFirstDailyCompletion(
    s,
    args.date,
    next.completions,
  );
  if (!unlocked.length) return next;
  return { ...next, milestones: [...next.milestones, ...unlocked] };
}

type PendingCompletionMutation = {
  operationId: string;
  identity: string;
  habitId: string;
  userId: string;
  date: string;
  previousDone: boolean;
  nextDone: boolean;
};

type PartnerActivitySnapshot = {
  partnerId: string | null;
  sharedHabitIds: Set<string>;
  completionKeys: Set<string>;
};

function partnerActivitySnapshot(s: AppState): PartnerActivitySnapshot {
  if (!s.me || !s.couple) {
    return { partnerId: null, sharedHabitIds: new Set(), completionKeys: new Set() };
  }
  const partner = s.couple.members.find((m) => m.id !== s.me?.id);
  if (!partner) {
    return { partnerId: null, sharedHabitIds: new Set(), completionKeys: new Set() };
  }
  const sharedHabitIds = new Set(
    s.habits
      .filter((h) => h.ownerId === partner.id && h.visibility === "shared")
      .map((h) => h.id),
  );
  const completionKeys = new Set(
    s.completions
      .filter((c) => c.userId === partner.id && sharedHabitIds.has(c.habitId))
      .map((c) => `${c.habitId}::${c.date}`),
  );
  return {
    partnerId: partner.id,
    sharedHabitIds,
    completionKeys,
  };
}

export type CompletionRealtimeEvent = {
  operationId: string;
  completionId: string;
  habitId: string;
  userId: string;
  date: string;
  action: "done" | "undone";
  version: number;
  serverTs: string;
};

type RealtimeHealthEvent = {
  connected: boolean;
  at?: string;
};

type StoreValue = {
  state: AppState;
  ready: boolean;
  profileResolved: boolean;
  createAccount: (p: {
    name: string;
    emoji: string;
  }) => Promise<Person>;
  signOut: () => Promise<void>;
  createCouple: () => Promise<Couple>;
  joinCouple: (code: string, partner?: Partial<Person>) => Promise<Couple | null>;
  addPartner: (partner: { name: string; emoji: string }) => Promise<Couple | null>;
  addHabit: (h: Omit<Habit, "id" | "ownerId" | "createdAt">) => Promise<Habit>;
  updateHabit: (
    habitId: string,
    patch: Pick<Habit, "name" | "visibility" | "targetPerWeek" | "breakGoalDays">,
  ) => Promise<void>;
  removeHabit: (id: string) => Promise<void>;
  toggleCompletion: (habitId: string, userId: string, date?: string) => Promise<void>;
  revivePartnerMiss: (args: {
    partnerId: string;
    habitId: string;
    date: string;
  }) => Promise<boolean>;
  sendCheer: (toUserId: string, habitId?: string) => Promise<void>;
  markCheersRead: () => Promise<void>;
  setGrace: (enabled: boolean) => Promise<void>;
  saveDayExcitement: (input: { stars: number; note: string }) => Promise<void>;
  saveJournalEntry: (input: {
    mood: number;
    promptId: string;
    promptText: string;
    reflection: string;
    causeBuckets: string[];
  }) => Promise<void>;
  createJournalUserBucket: (label: string) => Promise<void>;
  resetAll: () => Promise<void>;
  /** Replace store from server snapshot (deferred sync / bootstrap). */
  applyRemoteHydration: (data: AppState) => void;
  /** Live cloud: reload full state from Supabase (e.g. partner completions). */
  refreshBootstrapFromServer: () => Promise<void>;
  /** Delta sync pull for adaptive fallback/foreground refresh. */
  refreshDeltaFromServer: () => Promise<void>;
  /** Apply realtime completion event pushed from server. */
  applyCompletionRealtimeEvent: (event: CompletionRealtimeEvent) => void;
  /** Realtime channel connection state updates. */
  reportRealtimeHealth: (event: RealtimeHealthEvent) => void;
  /** Number of unseen partner updates for Partner tab badge. */
  partnerUpdatesBadge: number;
  /** Clear partner update badge after opening Partner tab. */
  markPartnerUpdatesSeen: () => void;
};

const StoreContext = createContext<StoreValue | null>(null);

function DuoCloudHydration({
  duoCloudActive,
  onHydrated,
  onSettled,
}: {
  duoCloudActive: boolean;
  onHydrated: (s: AppState) => void;
  onSettled: () => void;
}) {
  const { userId, isLoaded } = useAuth();
  useEffect(() => {
    if (!duoCloudActive || !isLoaded || !userId) return;
    let cancelled = false;
    void (async () => {
      const r = await duoActions.getBootstrapStateAction();
      if (cancelled) return;
      if (r.ok && r.data) onHydrated(r.data);
      onSettled();
    })();
    return () => {
      cancelled = true;
    };
  }, [duoCloudActive, userId, isLoaded, onHydrated, onSettled]);
  return null;
}

/** When the app returns to the foreground, pull latest couple state (partner check-ins). */
function DuoCloudForegroundRefresh({
  duoCloudActive,
  onRefresh,
  onCursor,
  sinceCursor,
}: {
  duoCloudActive: boolean;
  onRefresh: (s: AppState) => void;
  onCursor: (cursor: string) => void;
  sinceCursor: string | null;
}) {
  const { userId, isLoaded } = useAuth();
  useEffect(() => {
    if (!duoCloudActive || !isLoaded || !userId) return;
    let debounce: number | undefined;
    const pull = () => {
      if (debounce !== undefined) window.clearTimeout(debounce);
      debounce = window.setTimeout(() => {
        void (async () => {
          const r = await duoActions.getDeltaStateAction({
            sinceCursor,
          });
          if (!r.ok) return;
          if (r.data.state && r.data.changed) onRefresh(r.data.state);
          if (r.data.cursor) onCursor(r.data.cursor);
        })();
      }, 500);
    };
    const onVis = () => {
      if (document.visibilityState === "visible") pull();
    };
    window.addEventListener("focus", pull);
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("pageshow", pull);
    return () => {
      if (debounce !== undefined) window.clearTimeout(debounce);
      window.removeEventListener("focus", pull);
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("pageshow", pull);
    };
  }, [duoCloudActive, isLoaded, onCursor, onRefresh, sinceCursor, userId]);
  return null;
}

function StoreProviderCore({
  children,
  clerkUserId,
  clerkLoaded,
}: {
  children: React.ReactNode;
  clerkUserId: string | null;
  clerkLoaded: boolean;
}) {
  const duoRuntime = useDuoRuntimeEnv();
  const duoCloudActive = computeDuoCloudClientConfigured(duoRuntime);
  const serverCoupleActionsEnabled =
    computeServerCoupleActionsEnabled(duoRuntime);
  const clerkAuthEnabled = Boolean(duoRuntime.clerkPublishableKey.trim());
  const deferredSnapshotEnabled = Boolean(duoRuntime.duoDeferredSnapshotSync);
  const stateScope = useMemo(
    () =>
      storageScope({
        clerkUserId,
        duoCloudActive,
        deferredSnapshot: deferredSnapshotEnabled,
      }),
    [clerkUserId, deferredSnapshotEnabled, duoCloudActive],
  );
  const scopedStorageKey = useMemo(
    () => storageKeyForScope(stateScope),
    [stateScope],
  );
  const [state, setState] = useState<AppState>(EMPTY);
  const [ready, setReady] = useState(false);
  const [profileResolved, setProfileResolved] = useState(false);
  const [partnerUpdatesBadge, setPartnerUpdatesBadge] = useState(0);
  const [deltaCursor, setDeltaCursor] = useState<string | null>(null);
  const stateRef = useRef<AppState>(EMPTY);
  const pendingByOpRef = useRef<Map<string, PendingCompletionMutation>>(new Map());
  const latestOpByIdentityRef = useRef<Map<string, string>>(new Map());
  /** Desired completion targets still to sync after the in-flight Duo request (same identity). */
  const completionTargetQueueRef = useRef<Map<string, boolean[]>>(new Map());
  const seenOperationIdsRef = useRef<Set<string>>(new Set());
  const previousPartnerSnapshotRef = useRef<PartnerActivitySnapshot>(
    partnerActivitySnapshot(EMPTY),
  );
  const remoteHydratedRef = useRef(false);
  const remoteRequestSeqRef = useRef(0);
  const lastAppliedRemoteRequestSeqRef = useRef(0);
  const deltaCursorRef = useRef<string | null>(null);
  const lastSuccessfulSyncAtRef = useRef<number>(0);
  const realtimeHealthyRef = useRef(false);

  const nextRemoteRequestSeq = useCallback(() => {
    remoteRequestSeqRef.current += 1;
    return remoteRequestSeqRef.current;
  }, []);

  /**
   * Merges server `data` into local state. Optional `requestSeq` is only used for
   * completion-toggle HTTP acks so out-of-order toggle responses cannot undo each
   * other. Bootstrap/delta/foreground pulls omit `requestSeq` so they never block
   * a toggle ack, and in-flight optimistic completions are re-applied afterward.
   */
  const applyRemoteState = useCallback((data: AppState, requestSeq?: number) => {
    if (
      typeof requestSeq === "number" &&
      requestSeq < lastAppliedRemoteRequestSeqRef.current
    ) {
      return;
    }
    if (typeof requestSeq === "number") {
      lastAppliedRemoteRequestSeqRef.current = requestSeq;
    }
    const previous = previousPartnerSnapshotRef.current;
    let nextState = applyReplenishToState({
      ...EMPTY,
      ...data,
      habits: (data.habits ?? []).map((h) => normalizeHabit(h)),
      me: data.me ? normalizePerson(data.me) : null,
      couple: data.couple
        ? {
            ...data.couple,
            members: (data.couple.members ?? []).map((m) =>
              normalizePerson(m as Person),
            ),
          }
        : null,
      dayExcitement: data.dayExcitement ?? [],
      journalEntries: data.journalEntries ?? [],
      journalUserBuckets: data.journalUserBuckets ?? [],
    });
    // Preserve newer local journal edits when cloud responses lag behind.
    const localState = stateRef.current;
    if (localState.journalEntries.length > 0) {
      const mergedByDay = new Map<string, JournalEntry>();
      for (const entry of nextState.journalEntries) {
        mergedByDay.set(`${entry.userId}::${entry.date}`, entry);
      }
      for (const entry of localState.journalEntries) {
        const key = `${entry.userId}::${entry.date}`;
        const existing = mergedByDay.get(key);
        if (!existing || entry.savedAt > existing.savedAt) {
          mergedByDay.set(key, entry);
        }
      }
      nextState = { ...nextState, journalEntries: [...mergedByDay.values()] };
    }
    if (localState.journalUserBuckets.length > 0) {
      const mergedBuckets = new Map<string, JournalUserBucket>();
      for (const bucket of nextState.journalUserBuckets) {
        mergedBuckets.set(`${bucket.userId}::${bucket.normalizedLabel}`, bucket);
      }
      for (const bucket of localState.journalUserBuckets) {
        const key = `${bucket.userId}::${bucket.normalizedLabel}`;
        const existing = mergedBuckets.get(key);
        const existingRecency = existing?.lastSelectedAt ?? "";
        const localRecency = bucket.lastSelectedAt ?? "";
        if (!existing || localRecency > existingRecency) {
          mergedBuckets.set(key, bucket);
        }
      }
      nextState = { ...nextState, journalUserBuckets: [...mergedBuckets.values()] };
    }
    for (const p of pendingByOpRef.current.values()) {
      nextState = applyCompletionState(nextState, {
        habitId: p.habitId,
        userId: p.userId,
        date: p.date,
        done: p.nextDone,
      });
    }
    const next = partnerActivitySnapshot(nextState);
    if (remoteHydratedRef.current) {
      let delta = 0;
      if (!previous.partnerId && next.partnerId) delta += 1;
      if (previous.partnerId && next.partnerId && previous.partnerId === next.partnerId) {
        for (const id of next.sharedHabitIds) {
          if (!previous.sharedHabitIds.has(id)) delta += 1;
        }
        for (const key of next.completionKeys) {
          if (!previous.completionKeys.has(key)) delta += 1;
        }
      }
      if (delta > 0) setPartnerUpdatesBadge((n) => n + delta);
    } else {
      remoteHydratedRef.current = true;
    }
    previousPartnerSnapshotRef.current = next;
    setState(nextState);
  }, []);

  const refreshBootstrapFromServer = useCallback(async () => {
    if (!duoCloudActive) return;
    const r = await duoActions.getBootstrapStateAction();
    if (!r.ok || !r.data) return;
    applyRemoteState(r.data);
    const nowIso = new Date().toISOString();
    lastSuccessfulSyncAtRef.current = Date.now();
    clearSyncDirty({
      lastSyncedAt: nowIso,
      lastServerUpdatedAt: nowIso,
      lastCursor: deltaCursorRef.current,
    });
  }, [duoCloudActive, applyRemoteState]);

  const refreshDeltaFromServer = useCallback(async () => {
    if (!duoCloudActive) return;
    incrementFallbackPullCount();
    const r = await duoActions.getDeltaStateAction({
      sinceCursor: deltaCursorRef.current,
    });
    if (!r.ok) return;
    if (r.data.state && r.data.changed) applyRemoteState(r.data.state);
    if (r.data.cursor) {
      deltaCursorRef.current = r.data.cursor;
      setDeltaCursor(r.data.cursor);
      updateSyncCursor(r.data.cursor);
    }
    const nowIso = new Date().toISOString();
    lastSuccessfulSyncAtRef.current = Date.now();
    clearSyncDirty({
      lastSyncedAt: nowIso,
      lastServerUpdatedAt: r.data.cursor || nowIso,
      lastCursor: r.data.cursor,
    });
  }, [duoCloudActive, applyRemoteState]);

  const reportRealtimeHealth = useCallback((event: RealtimeHealthEvent) => {
    if (event.connected) {
      realtimeHealthyRef.current = true;
      markRealtimeEventSeen(event.at);
      return;
    }
    if (realtimeHealthyRef.current) incrementRealtimeDisconnects();
    realtimeHealthyRef.current = false;
  }, []);

  const applyCompletionRealtimeEvent = useCallback(
    (event: CompletionRealtimeEvent) => {
      if (seenOperationIdsRef.current.has(event.operationId)) return;
      seenOperationIdsRef.current.add(event.operationId);
      if (seenOperationIdsRef.current.size > 500) {
        const first = seenOperationIdsRef.current.values().next().value;
        if (first) seenOperationIdsRef.current.delete(first);
      }

      const pending = pendingByOpRef.current.get(event.operationId);
      if (pending) {
        pendingByOpRef.current.delete(event.operationId);
        if (latestOpByIdentityRef.current.get(pending.identity) === event.operationId) {
          latestOpByIdentityRef.current.delete(pending.identity);
        }
      }

      let incrementBadge = false;
      markRealtimeEventSeen(event.serverTs);
      setState((s) => {
        const beforePartnerId = s.me
          ? s.couple?.members.find((m) => m.id !== s.me?.id)?.id
          : null;
        const nextState = applyCompletionState(s, {
          habitId: event.habitId,
          userId: event.userId,
          date: event.date,
          done: event.action === "done",
          completionId: event.completionId,
        });
        const afterPartnerId = nextState.me
          ? nextState.couple?.members.find((m) => m.id !== nextState.me?.id)?.id
          : null;
        const partnerId = afterPartnerId ?? beforePartnerId;
        if (
          event.action === "done" &&
          partnerId &&
          event.userId === partnerId
        ) {
          const habit = nextState.habits.find((h) => h.id === event.habitId);
          if (habit?.ownerId === partnerId && habit.visibility === "shared") {
            incrementBadge = true;
          }
        }
        previousPartnerSnapshotRef.current = partnerActivitySnapshot(nextState);
        return nextState;
      });
      if (incrementBadge) setPartnerUpdatesBadge((n) => n + 1);
    },
    [],
  );

  const markPartnerUpdatesSeen = useCallback(() => {
    setPartnerUpdatesBadge(0);
  }, []);

  useEffect(() => {
    queueMicrotask(() => {
      setState(readInitial(scopedStorageKey));
      setReady(true);
    });
  }, [scopedStorageKey]);

  useEffect(() => {
    setSyncMetaScope(stateScope);
    const meta = readSyncMeta();
    deltaCursorRef.current = meta.lastCursor;
    queueMicrotask(() => {
      setDeltaCursor(meta.lastCursor);
    });
    lastSuccessfulSyncAtRef.current = meta.lastSyncedAt
      ? Date.parse(meta.lastSyncedAt)
      : 0;
  }, [stateScope]);

  useEffect(() => {
    queueMicrotask(() => {
      setProfileResolved(false);
    });
  }, [stateScope]);

  useEffect(() => {
    if (!ready) return;
    if (!clerkAuthEnabled || !duoCloudActive) {
      queueMicrotask(() => {
        setProfileResolved(true);
      });
      return;
    }
    if (!clerkLoaded) return;
    if (!clerkUserId) {
      queueMicrotask(() => {
        setProfileResolved(true);
      });
      return;
    }
    if (remoteHydratedRef.current) {
      queueMicrotask(() => {
        setProfileResolved(true);
      });
    }
  }, [ready, clerkAuthEnabled, duoCloudActive, clerkLoaded, clerkUserId]);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    if (!ready) return;
    const tick = () => setState((s) => applyReplenishToState(s));
    const intervalMs = 6 * 60 * 60 * 1000;
    const id = window.setInterval(tick, intervalMs);
    const onVisibleOrFocus = () => {
      if (document.visibilityState === "visible") tick();
    };
    document.addEventListener("visibilitychange", onVisibleOrFocus);
    window.addEventListener("focus", tick);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVisibleOrFocus);
      window.removeEventListener("focus", tick);
    };
  }, [ready]);

  useEffect(() => {
    if (!ready) return;
    try {
      window.localStorage.setItem(scopedStorageKey, JSON.stringify(state));
      if (duoRuntime.duoDeferredSnapshotSync && !duoCloudActive) {
        markSyncDirty();
      }
    } catch {
      // storage quota / private mode — ignore
    }
  }, [state, ready, duoCloudActive, duoRuntime.duoDeferredSnapshotSync, scopedStorageKey]);

  useEffect(() => {
    if (!duoCloudActive || !ready) return;
    const id = window.setInterval(() => {
      const meta = readSyncMeta();
      const staleMs = Date.now() - (lastSuccessfulSyncAtRef.current || 0);
      const payload = {
        p95SyncLatencyMs: staleMs,
        realtimeDisconnectRate: meta.realtimeDisconnects,
        fallbackPullCount: meta.fallbackPullCount,
        deltaPayloadSize: JSON.stringify(state).length,
        missedEventRecoveryCount: meta.fallbackPullCount,
      };
      window.dispatchEvent(new CustomEvent("duo:sync-metrics", { detail: payload }));
      if (meta.fallbackPullCount > 30) {
        console.warn("[duo-sync] fallback pull spike detected", payload);
      }
      if (staleMs > STALE_SYNC_THRESHOLD_MS * 2) {
        console.warn("[duo-sync] stale sync threshold exceeded", payload);
      }
    }, 60_000);
    return () => window.clearInterval(id);
  }, [duoCloudActive, ready, state]);

  const shouldAdaptiveFallback =
    duoCloudActive && ready && Boolean(state.couple?.id);

  useEffect(() => {
    if (!shouldAdaptiveFallback) return;
    let pollIdx = 0;
    let timerId: number | undefined;
    const scheduleNext = () => {
      const wait = ADAPTIVE_POLL_STEPS_MS[Math.min(pollIdx, ADAPTIVE_POLL_STEPS_MS.length - 1)];
      timerId = window.setTimeout(async () => {
        if (document.visibilityState !== "visible") {
          scheduleNext();
          return;
        }
        const staleFor = Date.now() - (lastSuccessfulSyncAtRef.current || 0);
        const stale = staleFor > STALE_SYNC_THRESHOLD_MS;
        if (!realtimeHealthyRef.current || stale) {
          await refreshDeltaFromServer();
          pollIdx = 0;
        } else {
          pollIdx = Math.min(pollIdx + 1, ADAPTIVE_POLL_STEPS_MS.length - 1);
        }
        scheduleNext();
      }, wait);
    };
    const foregroundSync = () => {
      if (document.visibilityState === "visible") {
        pollIdx = 0;
        void refreshDeltaFromServer();
      }
    };
    scheduleNext();
    window.addEventListener("focus", foregroundSync);
    window.addEventListener("pageshow", foregroundSync);
    document.addEventListener("visibilitychange", foregroundSync);
    return () => {
      if (timerId !== undefined) window.clearTimeout(timerId);
      window.removeEventListener("focus", foregroundSync);
      window.removeEventListener("pageshow", foregroundSync);
      document.removeEventListener("visibilitychange", foregroundSync);
    };
  }, [refreshDeltaFromServer, shouldAdaptiveFallback]);

  const createAccount = useCallback(
    async (p: { name: string; emoji: string }) => {
      if (serverCoupleActionsEnabled) {
        const r = await duoActions.provisionDuoUserAction(p);
        if (!r.ok) throw new Error(r.message);
        applyRemoteState(r.data);
        return r.data.me!;
      }
      const now = new Date();
      const me: Person = {
        id: uid("u"),
        name: p.name,
        emoji: p.emoji,
        graceEnabled: true,
        streakRevivesRemaining: 3,
        streakRevivesNextRefillAt: addDays(now, 14).toISOString(),
      };
      setState((s) => ({ ...s, me }));
      return me;
    },
    [applyRemoteState, serverCoupleActionsEnabled],
  );

  const signOut = useCallback(async () => {
    if (clerkAuthEnabled) await runClerkSignOut();
    setState(EMPTY);
    try {
      window.localStorage.removeItem(scopedStorageKey);
      clearSyncMetaStorage();
    } catch {
      /* ignore */
    }
  }, [clerkAuthEnabled, scopedStorageKey]);

  const createCouple = useCallback(async () => {
    if (serverCoupleActionsEnabled) {
      const r = await duoActions.createCoupleAction();
      if (!r.ok) throw new Error(r.message);
      applyRemoteState(r.data);
      if (duoRuntime.duoDeferredSnapshotSync && !duoCloudActive) {
        requestDeferredSnapshotFlushSoon();
      }
      return r.data.couple!;
    }
    let next: Couple | null = null;
    setState((s) => {
      if (!s.me) return s;
      next = {
        id: uid("c"),
        createdAt: new Date().toISOString(),
        inviteCode: inviteCode(),
        members: [normalizePerson(s.me)],
      };
      return { ...s, couple: next };
    });
    return next!;
  }, [
    applyRemoteState,
    duoCloudActive,
    duoRuntime.duoDeferredSnapshotSync,
    serverCoupleActionsEnabled,
  ]);

  const joinCouple = useCallback(
    async (code: string) => {
      const normalized = code.trim().toUpperCase();
      if (!normalized) return null;

      if (clerkUserId) {
        const r = await duoActions.joinCoupleAction(normalized);
        if (r.ok && r.data) {
          applyRemoteState(r.data);
          if (duoRuntime.duoDeferredSnapshotSync && !duoCloudActive) {
            requestDeferredSnapshotFlushSoon();
          }
          return r.data.couple;
        }
        if (!r.ok) {
          if (r.code === "not_found") {
            if (r.message.includes("Profile not provisioned")) {
              throw new Error(
                "Finish your profile on this device first, then try the invite code again.",
              );
            }
            return null;
          }
          // Use server message (lists missing env on Vercel, etc.) so older cached UI still shows useful text.
          throw new Error(r.message);
        }
      }

      return null;
    },
    [
      applyRemoteState,
      clerkUserId,
      duoCloudActive,
      duoRuntime.duoDeferredSnapshotSync,
    ],
  );

  const addPartner = useCallback(
    async (partner: { name: string; emoji: string }) => {
      if (duoCloudActive || serverCoupleActionsEnabled) return null;
      let next: Couple | null = null;
      setState((s) => {
        if (!s.me || !s.couple) return s;
        if (s.couple.members.length >= 2) {
          next = s.couple;
          return s;
        }
        const createdAt = new Date();
        const partnerPerson: Person = {
          id: uid("u"),
          name: partner.name,
          emoji: partner.emoji,
          graceEnabled: true,
          streakRevivesRemaining: 3,
          streakRevivesNextRefillAt: addDays(createdAt, 14).toISOString(),
        };
        next = {
          ...s.couple,
          members: [
            ...s.couple.members.map(normalizePerson),
            normalizePerson(partnerPerson),
          ],
        };
        return { ...s, couple: next };
      });
      return next;
    },
    [duoCloudActive, serverCoupleActionsEnabled],
  );

  const addHabit = useCallback(
    async (h: Omit<Habit, "id" | "ownerId" | "createdAt">) => {
      if (duoCloudActive) {
        const r = await duoActions.addHabitAction(h);
        if (!r.ok) throw new Error(r.message);
        applyRemoteState(r.data);
        const mine = r.data.habits.filter((x) => x.ownerId === r.data.me!.id);
        if (!mine.length) throw new Error("Habit missing after save");
        return mine.reduce((a, b) =>
          a.createdAt > b.createdAt ? a : b,
        );
      }
      let created: Habit | null = null;
      setState((s) => {
        if (!s.me) return s;
        created = {
          ...h,
          id: uid("h"),
          ownerId: s.me.id,
          createdAt: new Date().toISOString(),
        };
        return { ...s, habits: [...s.habits, created] };
      });
      return created!;
    },
    [applyRemoteState, duoCloudActive],
  );

  const updateHabit = useCallback(
    async (
      habitId: string,
      patch: Pick<
        Habit,
        "name" | "visibility" | "targetPerWeek" | "breakGoalDays"
      >,
    ) => {
      const name = patch.name.trim();
      if (!name) throw new Error("Habit name is required.");
      if (patch.targetPerWeek != null) {
        const n = Math.floor(patch.targetPerWeek);
        if (n < 1 || n > 7) throw new Error("Times per week must be 1-7.");
      }
      if (patch.breakGoalDays != null) {
        const n = Math.floor(patch.breakGoalDays);
        if (n < 1 || n > 365) throw new Error("Break goal days must be 1-365.");
      }

      if (duoCloudActive) {
        const r = await duoActions.updateHabitAction(habitId, {
          name,
          visibility: patch.visibility,
          targetPerWeek:
            patch.targetPerWeek != null ? Math.floor(patch.targetPerWeek) : undefined,
          breakGoalDays:
            patch.breakGoalDays != null ? Math.floor(patch.breakGoalDays) : undefined,
        });
        if (!r.ok) throw new Error(r.message);
        applyRemoteState(r.data);
        return;
      }

      setState((s) => {
        const current = s.habits.find((h) => h.id === habitId);
        if (!current || !s.me || current.ownerId !== s.me.id) return s;
        const nextHabits = s.habits.map((h) => {
          if (h.id !== habitId) return h;
          if (h.type === "frequency") {
            return normalizeHabit({
              ...h,
              name,
              visibility: patch.visibility,
              targetPerWeek: Math.floor(patch.targetPerWeek ?? h.targetPerWeek ?? 1),
              breakGoalDays: undefined,
            });
          }
          return normalizeHabit({
            ...h,
            name,
            visibility: patch.visibility,
            breakGoalDays: Math.floor(patch.breakGoalDays ?? h.breakGoalDays ?? 1),
          });
        });
        return { ...s, habits: nextHabits };
      });
    },
    [applyRemoteState, duoCloudActive],
  );

  const removeHabit = useCallback(
    async (id: string) => {
      if (duoCloudActive) {
        const r = await duoActions.removeHabitAction(id);
        if (!r.ok) throw new Error(r.message);
        applyRemoteState(r.data);
        return;
      }
      setState((s) => ({
        ...s,
        habits: s.habits.filter((h) => h.id !== id),
        completions: s.completions.filter((c) => c.habitId !== id),
      }));
    },
    [applyRemoteState, duoCloudActive],
  );

  const toggleCompletion = useCallback(
    async (habitId: string, userId: string, date = todayKey()) => {
      const identity = completionIdentity(habitId, userId, date);
      const existingOperationId = latestOpByIdentityRef.current.get(identity);
      const inFlight =
        Boolean(existingOperationId) &&
        pendingByOpRef.current.has(existingOperationId!);

      if (inFlight && duoCloudActive) {
        const pending = pendingByOpRef.current.get(existingOperationId!)!;
        const q = completionTargetQueueRef.current.get(identity) ?? [];
        const tailDone = q.length > 0 ? q[q.length - 1]! : pending.nextDone;
        const nextDesired = !tailDone;
        q.push(nextDesired);
        completionTargetQueueRef.current.set(identity, q);
        setState((s) => {
          const next = applyCompletionWithGlobalMilestones(s, {
            habitId,
            userId,
            date,
            done: nextDesired,
          });
          return next;
        });
        return;
      }

      if (inFlight && !duoCloudActive) {
        return;
      }

      const previousDone = completionDoneInState(
        stateRef.current,
        habitId,
        userId,
        date,
      );
      const nextDone = !previousDone;
      const operationId = uid("op");
      const requestSeq = nextRemoteRequestSeq();

      pendingByOpRef.current.set(operationId, {
        operationId,
        identity,
        habitId,
        userId,
        date,
        previousDone,
        nextDone,
      });
      latestOpByIdentityRef.current.set(identity, operationId);

      setState((s) => {
        const next = applyCompletionWithGlobalMilestones(s, {
          habitId,
          userId,
          date,
          done: nextDone,
        });
        return next;
      });

      if (duoRuntime.duoDeferredSnapshotSync && !duoCloudActive) {
        requestDeferredSnapshotFlushSoon();
      }
      if (!duoCloudActive) {
        pendingByOpRef.current.delete(operationId);
        latestOpByIdentityRef.current.delete(identity);
        return;
      }

      const rollbackThisOp = () => {
        const latest = latestOpByIdentityRef.current.get(identity);
        pendingByOpRef.current.delete(operationId);
        if (latest === operationId) {
          latestOpByIdentityRef.current.delete(identity);
          setState((s) =>
            applyCompletionState(s, {
              habitId,
              userId,
              date,
              done: previousDone,
            }),
          );
        }
        completionTargetQueueRef.current.delete(identity);
      };

      let r: Awaited<ReturnType<typeof duoActions.toggleCompletionAction>>;
      try {
        r = await duoActions.toggleCompletionAction({
          habitId,
          userId,
          date,
          action: nextDone ? "done" : "undone",
          operationId,
          clientTimestamp: new Date().toISOString(),
          deviceId: getDeviceId(),
        });
      } catch {
        rollbackThisOp();
        throw new Error("Could not sync this change.");
      }
      if (!r.ok) {
        rollbackThisOp();
        throw new Error(r.message);
      }

      pendingByOpRef.current.delete(operationId);
      if (latestOpByIdentityRef.current.get(identity) === operationId) {
        latestOpByIdentityRef.current.delete(identity);
      }
      seenOperationIdsRef.current.add(operationId);
      const pendingCountAfterAck = pendingByOpRef.current.size;
      if (pendingCountAfterAck === 0) {
        applyRemoteState(r.data.state, requestSeq);
      }

      const flushCompletionTargetQueue = async (baselineServerState: AppState) => {
        let serverSnapshot = baselineServerState;
        for (;;) {
          const q = completionTargetQueueRef.current.get(identity);
          if (!q?.length) return;

          const cur = completionDoneInState(serverSnapshot, habitId, userId, date);
          while (q.length > 0 && q[0] === cur) {
            q.shift();
          }
          if (q.length === 0) {
            completionTargetQueueRef.current.delete(identity);
            return;
          }
          completionTargetQueueRef.current.set(identity, q);

          const nextTarget = q[0];
          if (nextTarget === cur) return;

          const chainPreviousDone = cur;
          const chainNextDone = nextTarget;
          const chainOperationId = uid("op");
          const chainRequestSeq = nextRemoteRequestSeq();

          pendingByOpRef.current.set(chainOperationId, {
            operationId: chainOperationId,
            identity,
            habitId,
            userId,
            date,
            previousDone: chainPreviousDone,
            nextDone: chainNextDone,
          });
          latestOpByIdentityRef.current.set(identity, chainOperationId);

          setState((s) => {
            const next = applyCompletionWithGlobalMilestones(s, {
              habitId,
              userId,
              date,
              done: chainNextDone,
            });
            return next;
          });

          let chainR: Awaited<ReturnType<typeof duoActions.toggleCompletionAction>>;
          try {
            chainR = await duoActions.toggleCompletionAction({
              habitId,
              userId,
              date,
              action: chainNextDone ? "done" : "undone",
              operationId: chainOperationId,
              clientTimestamp: new Date().toISOString(),
              deviceId: getDeviceId(),
            });
          } catch {
            const latest = latestOpByIdentityRef.current.get(identity);
            pendingByOpRef.current.delete(chainOperationId);
            if (latest === chainOperationId) {
              latestOpByIdentityRef.current.delete(identity);
              setState((s) =>
                applyCompletionState(s, {
                  habitId,
                  userId,
                  date,
                  done: chainPreviousDone,
                }),
              );
            }
            completionTargetQueueRef.current.delete(identity);
            throw new Error("Could not sync this change.");
          }
          if (!chainR.ok) {
            const latest = latestOpByIdentityRef.current.get(identity);
            pendingByOpRef.current.delete(chainOperationId);
            if (latest === chainOperationId) {
              latestOpByIdentityRef.current.delete(identity);
              setState((s) =>
                applyCompletionState(s, {
                  habitId,
                  userId,
                  date,
                  done: chainPreviousDone,
                }),
              );
            }
            completionTargetQueueRef.current.delete(identity);
            throw new Error(chainR.message);
          }

          pendingByOpRef.current.delete(chainOperationId);
          if (latestOpByIdentityRef.current.get(identity) === chainOperationId) {
            latestOpByIdentityRef.current.delete(identity);
          }
          seenOperationIdsRef.current.add(chainOperationId);

          const restPending = pendingByOpRef.current.size;
          if (restPending === 0) {
            applyRemoteState(chainR.data.state, chainRequestSeq);
          }

          const dq = completionTargetQueueRef.current.get(identity);
          if (dq?.length) {
            dq.shift();
            if (dq.length === 0) {
              completionTargetQueueRef.current.delete(identity);
            } else {
              completionTargetQueueRef.current.set(identity, dq);
            }
          }

          serverSnapshot = chainR.data.state;
        }
      };

      await flushCompletionTargetQueue(r.data.state);
    },
    [
      applyRemoteState,
      duoCloudActive,
      duoRuntime.duoDeferredSnapshotSync,
      nextRemoteRequestSeq,
    ],
  );

  const revivePartnerMiss = useCallback(
    async (args: { partnerId: string; habitId: string; date: string }) => {
      if (duoCloudActive) {
        const r = await duoActions.revivePartnerMissAction(args);
        if (!r.ok) return false;
        applyRemoteState(r.data);
        return true;
      }
      let ok = false;
      setState((s) => {
        if (!s.me) return s;
        const me = replenishPersonRevives(s.me);
        if (me.id === args.partnerId) return { ...s, me };
        if (me.streakRevivesRemaining <= 0) return { ...s, me };

        const habit = s.habits.find((h) => h.id === args.habitId);
        if (
          !habit ||
          habit.ownerId !== args.partnerId ||
          habit.visibility !== "shared"
        ) {
          return { ...s, me };
        }
        if (habit.type === "frequency") return { ...s, me };

        const today = todayKey();
        if (args.date >= today) return { ...s, me };

        const exists = s.completions.some(
          (c) =>
            c.habitId === args.habitId &&
            c.userId === args.partnerId &&
            c.date === args.date,
        );
        if (exists) return { ...s, me };

        const habitFrom = toDateKey(new Date(habit.createdAt));
        if (diffDays(args.date, habitFrom) < 0) return { ...s, me };

        const completions: Completion[] = [
          ...s.completions,
          {
            id: uid("x"),
            habitId: args.habitId,
            userId: args.partnerId,
            date: args.date,
          },
        ];

        ok = true;
        return {
          ...s,
          completions,
          me: {
            ...me,
            streakRevivesRemaining: me.streakRevivesRemaining - 1,
          },
        };
      });
      return ok;
    },
    [applyRemoteState, duoCloudActive],
  );

  const sendCheer = useCallback(
    async (toUserId: string, habitId?: string) => {
      if (duoCloudActive) {
        const r = await duoActions.sendCheerAction({ toUserId, habitId });
        if (!r.ok) throw new Error(r.message);
        applyRemoteState(r.data);
        return;
      }
      setState((s) => {
        if (!s.me) return s;
        const cheer: Cheer = {
          id: uid("ch"),
          fromUserId: s.me.id,
          toUserId,
          habitId,
          createdAt: new Date().toISOString(),
          read: false,
        };
        return { ...s, cheers: [...s.cheers, cheer] };
      });
    },
    [applyRemoteState, duoCloudActive],
  );

  const markCheersRead = useCallback(async () => {
    if (duoCloudActive) {
      const r = await duoActions.markCheersReadAction();
      if (!r.ok) throw new Error(r.message);
      applyRemoteState(r.data);
      return;
    }
    setState((s) => ({
      ...s,
      cheers: s.cheers.map((c) =>
        s.me && c.toUserId === s.me.id ? { ...c, read: true } : c,
      ),
    }));
  }, [applyRemoteState, duoCloudActive]);

  const setGrace = useCallback(
    async (enabled: boolean) => {
      if (duoCloudActive) {
        const r = await duoActions.setGraceAction(enabled);
        if (!r.ok) throw new Error(r.message);
        applyRemoteState(r.data);
        return;
      }
      setState((s) =>
        s.me ? { ...s, me: { ...s.me, graceEnabled: enabled } } : s,
      );
    },
    [applyRemoteState, duoCloudActive],
  );

  const saveDayExcitement = useCallback(
    async (input: { stars: number; note: string }) => {
      if (duoCloudActive) {
        const r = await duoActions.saveDayExcitementAction(input);
        if (!r.ok) throw new Error(r.message);
        applyRemoteState(r.data);
        return;
      }
      let syncPayload: {
        externalUserId: string;
        date: string;
        stars: number;
        note: string;
        savedAt: string;
      } | null = null;

      setState((s) => {
        if (!s.me) return s;
        const date = todayKey();
        const stars = Math.min(5, Math.max(1, Math.round(input.stars)));
        const note = input.note.trim();
        const savedAt = new Date().toISOString();
        const row: DayExcitementEntry = {
          id: uid("exc"),
          userId: s.me.id,
          date,
          stars,
          note,
          savedAt,
        };
        syncPayload = {
          externalUserId: s.me.id,
          date,
          stars,
          note,
          savedAt,
        };
        const list = s.dayExcitement ?? [];
        const rest = list.filter(
          (e) => !(e.userId === s.me!.id && e.date === date),
        );
        return { ...s, dayExcitement: [...rest, row] };
      });

      if (syncPayload && typeof window !== "undefined") {
        void fetch("/api/day-excitement", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(syncPayload),
          keepalive: true,
        }).catch(() => {});
      }
    },
    [applyRemoteState, duoCloudActive],
  );

  const saveJournalEntry = useCallback(
    async (input: {
      mood: number;
      promptId: string;
      promptText: string;
      reflection: string;
      causeBuckets: string[];
    }) => {
      const applyLocalJournalEntry = () => {
        setState((s) => {
          if (!s.me) return s;
          const date = todayKey();
          const mood = Math.min(10, Math.max(1, Math.round(input.mood)));
          const reflection = input.reflection.trim().slice(0, 600);
          const savedAt = new Date().toISOString();
          const dedupedBuckets = Array.from(
            new Set(input.causeBuckets.map((bucket) => bucket.trim()).filter(Boolean)),
          ).slice(0, 4);
          const row: JournalEntry = {
            id: uid("jrnl"),
            userId: s.me.id,
            date,
            mood,
            promptId: input.promptId.trim().slice(0, 80),
            promptText: input.promptText.trim().slice(0, 280),
            reflection,
            causeBuckets: dedupedBuckets,
            savedAt,
          };
          const list = s.journalEntries ?? [];
          const rest = list.filter((e) => !(e.userId === s.me!.id && e.date === date));
          const recency = new Date().toISOString();
          const nextBuckets = [...(s.journalUserBuckets ?? [])];
          for (const label of dedupedBuckets) {
            const normalized = label.trim().replace(/\s+/g, " ").toLowerCase();
            const idx = nextBuckets.findIndex((bucket) => bucket.normalizedLabel === normalized);
            if (idx >= 0) {
              nextBuckets[idx] = { ...nextBuckets[idx]!, label, lastSelectedAt: recency };
            } else {
              const created: JournalUserBucket = {
                id: uid("jbucket"),
                userId: s.me.id,
                label,
                normalizedLabel: normalized,
                createdAt: recency,
                lastSelectedAt: recency,
              };
              nextBuckets.push(created);
            }
          }
          return { ...s, journalEntries: [...rest, row], journalUserBuckets: nextBuckets };
        });
      };

      if (duoCloudActive) {
        try {
          const r = await duoActions.saveJournalEntryAction(input);
          if (!r.ok) {
            // Keep Journal usable even if backend migration isn't applied yet.
            applyLocalJournalEntry();
            return;
          }
          applyRemoteState(r.data);
          return;
        } catch {
          // Network/server action failure should still not block journal UX.
          applyLocalJournalEntry();
          return;
        }
      }

      applyLocalJournalEntry();
    },
    [applyRemoteState, duoCloudActive],
  );

  const createJournalUserBucket = useCallback(
    async (label: string) => {
      if (duoCloudActive) {
        const r = await duoActions.createJournalUserBucketAction({ label });
        if (!r.ok) throw new Error(r.message);
        applyRemoteState(r.data);
        return;
      }
      setState((s) => {
        if (!s.me) return s;
        const clean = label.trim().replace(/\s+/g, " ").slice(0, 40);
        if (!clean) return s;
        const normalized = clean.toLowerCase();
        const existing = (s.journalUserBuckets ?? []).find(
          (bucket) => bucket.normalizedLabel === normalized,
        );
        const nowIso = new Date().toISOString();
        if (existing) {
          return {
            ...s,
            journalUserBuckets: (s.journalUserBuckets ?? []).map((bucket) =>
              bucket.normalizedLabel === normalized
                ? { ...bucket, label: clean, lastSelectedAt: bucket.lastSelectedAt ?? nowIso }
                : bucket,
            ),
          };
        }
        const created: JournalUserBucket = {
          id: uid("jbucket"),
          userId: s.me.id,
          label: clean,
          normalizedLabel: normalized,
          createdAt: nowIso,
          lastSelectedAt: null,
        };
        return { ...s, journalUserBuckets: [...(s.journalUserBuckets ?? []), created] };
      });
    },
    [applyRemoteState, duoCloudActive],
  );

  const resetAll = useCallback(async () => {
    if (serverCoupleActionsEnabled) {
      const r = await duoActions.resetDuoAction();
      if (!r.ok) throw new Error(r.message);
    }
    setState(EMPTY);
    try {
      window.localStorage.removeItem(scopedStorageKey);
      clearSyncMetaStorage();
    } catch {
      /* ignore */
    }
  }, [scopedStorageKey, serverCoupleActionsEnabled]);

  const value = useMemo<StoreValue>(
    () => ({
      state,
      ready,
      profileResolved,
      createAccount,
      signOut,
      createCouple,
      joinCouple,
      addPartner,
      addHabit,
      updateHabit,
      removeHabit,
      toggleCompletion,
      revivePartnerMiss,
      sendCheer,
      markCheersRead,
      setGrace,
      saveDayExcitement,
      saveJournalEntry,
      createJournalUserBucket,
      resetAll,
      applyRemoteHydration: applyRemoteState,
      refreshBootstrapFromServer,
      refreshDeltaFromServer,
      applyCompletionRealtimeEvent,
      reportRealtimeHealth,
      partnerUpdatesBadge,
      markPartnerUpdatesSeen,
    }),
    [
      state,
      ready,
      profileResolved,
      createAccount,
      signOut,
      createCouple,
      joinCouple,
      addPartner,
      addHabit,
      updateHabit,
      removeHabit,
      toggleCompletion,
      revivePartnerMiss,
      sendCheer,
      markCheersRead,
      setGrace,
      saveDayExcitement,
      saveJournalEntry,
      createJournalUserBucket,
      resetAll,
      applyRemoteState,
      refreshBootstrapFromServer,
      refreshDeltaFromServer,
      applyCompletionRealtimeEvent,
      reportRealtimeHealth,
      partnerUpdatesBadge,
      markPartnerUpdatesSeen,
    ],
  );

  return (
    <StoreContext.Provider value={value}>
      {duoCloudActive ? (
        <>
          <DuoCloudHydration
            duoCloudActive={duoCloudActive}
            onHydrated={(data) => applyRemoteState(data)}
            onSettled={() => setProfileResolved(true)}
          />
          <DuoCloudForegroundRefresh
            duoCloudActive={duoCloudActive}
            onRefresh={(data) => applyRemoteState(data)}
            onCursor={(cursor) => {
              deltaCursorRef.current = cursor;
              setDeltaCursor(cursor);
              updateSyncCursor(cursor);
            }}
            sinceCursor={deltaCursor}
          />
        </>
      ) : null}
      {children}
    </StoreContext.Provider>
  );
}

function ClerkScopedStoreProvider({ children }: { children: React.ReactNode }) {
  const { userId, isLoaded } = useAuth();
  return (
    <StoreProviderCore clerkUserId={userId ?? null} clerkLoaded={isLoaded}>
      {children}
    </StoreProviderCore>
  );
}

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const duoRuntime = useDuoRuntimeEnv();
  if (!duoRuntime.clerkPublishableKey.trim()) {
    return (
      <StoreProviderCore clerkUserId={null} clerkLoaded={true}>
        {children}
      </StoreProviderCore>
    );
  }
  return <ClerkScopedStoreProvider>{children}</ClerkScopedStoreProvider>;
}

export function useStore(): StoreValue {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error("useStore must be used inside StoreProvider");
  return ctx;
}

export function usePartnerOf(personId: string | undefined) {
  const { state } = useStore();
  if (!personId || !state.couple) return null;
  return state.couple.members.find((m) => m.id !== personId) ?? null;
}
