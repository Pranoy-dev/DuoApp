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
  requestDeferredSnapshotFlushSoon,
  setSyncMetaScope,
} from "@/lib/duo-sync";
import type {
  AppState,
  Cheer,
  Completion,
  Couple,
  DayExcitementEntry,
  Habit,
  MilestoneAchievement,
  Person,
} from "./types";
import { habitIntent } from "./types";
import { todayKey, toDateKey, diffDays, addDays } from "./date";
import { replenishPersonRevives } from "./revives";
import { streakFor } from "./streak";
import { MILESTONE_TIERS } from "./milestones";

const LEGACY_STORAGE_KEY = "duo.state.v1";
const PARTNER_POLL_MS = 12_000;

const EMPTY: AppState = {
  me: null,
  couple: null,
  habits: [],
  completions: [],
  cheers: [],
  milestones: [],
  dayExcitement: [],
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
    };
  } catch {
    return EMPTY;
  }
}

function graceForUser(s: AppState, userId: string): boolean {
  if (s.me?.id === userId) return s.me.graceEnabled;
  const m = s.couple?.members.find((p) => p.id === userId);
  return m?.graceEnabled ?? true;
}

function milestonesAfterNewCompletion(
  s: AppState,
  habit: Habit,
  habitId: string,
  userId: string,
  completions: Completion[],
): MilestoneAchievement[] {
  const info = streakFor(
    habit,
    completions,
    userId,
    graceForUser(s, userId),
  );
  const already = new Set(
    s.milestones
      .filter((m) => m.habitId === habitId && m.userId === userId)
      .map((m) => m.tier),
  );
  const unlocked: MilestoneAchievement[] = [];
  for (const tier of MILESTONE_TIERS) {
    if (info.current >= tier && !already.has(tier)) {
      unlocked.push({
        id: uid("m"),
        habitId,
        userId,
        tier,
        achievedAt: new Date().toISOString(),
      });
    }
  }
  return unlocked;
}

function completionIdentity(habitId: string, userId: string, date: string): string {
  return `${habitId}::${userId}::${date}`;
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
  resetAll: () => Promise<void>;
  /** Replace store from server snapshot (deferred sync / bootstrap). */
  applyRemoteHydration: (data: AppState) => void;
  /** Live cloud: reload full state from Supabase (e.g. partner completions). */
  refreshBootstrapFromServer: () => Promise<void>;
  /** Apply realtime completion event pushed from server. */
  applyCompletionRealtimeEvent: (event: CompletionRealtimeEvent) => void;
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
}: {
  duoCloudActive: boolean;
  onRefresh: (s: AppState) => void;
}) {
  const { userId, isLoaded } = useAuth();
  useEffect(() => {
    if (!duoCloudActive || !isLoaded || !userId) return;
    let debounce: number | undefined;
    const pull = () => {
      if (debounce !== undefined) window.clearTimeout(debounce);
      debounce = window.setTimeout(() => {
        void (async () => {
          const r = await duoActions.getBootstrapStateAction();
          if (r.ok && r.data) onRefresh(r.data);
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
  }, [duoCloudActive, isLoaded, userId, onRefresh]);
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
  const stateRef = useRef<AppState>(EMPTY);
  const pendingByOpRef = useRef<Map<string, PendingCompletionMutation>>(new Map());
  const latestOpByIdentityRef = useRef<Map<string, string>>(new Map());
  const seenOperationIdsRef = useRef<Set<string>>(new Set());
  const previousPartnerSnapshotRef = useRef<PartnerActivitySnapshot>(
    partnerActivitySnapshot(EMPTY),
  );
  const remoteHydratedRef = useRef(false);

  const applyRemoteState = useCallback((data: AppState) => {
    const previous = previousPartnerSnapshotRef.current;
    const nextState = applyReplenishToState({
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
    });
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
    setState(
      nextState,
    );
  }, []);

  const refreshBootstrapFromServer = useCallback(async () => {
    if (!duoCloudActive) return;
    const r = await duoActions.getBootstrapStateAction();
    if (!r.ok || !r.data) return;
    applyRemoteState(r.data);
  }, [duoCloudActive, applyRemoteState]);

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

  const shouldBackgroundRefreshSoloCouple =
    duoCloudActive && ready && Boolean(state.couple?.id) && (state.couple?.members.length ?? 0) < 2;

  useEffect(() => {
    if (!shouldBackgroundRefreshSoloCouple) return;
    const pull = () => {
      void refreshBootstrapFromServer();
    };
    const id = window.setInterval(pull, PARTNER_POLL_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") pull();
    };
    window.addEventListener("focus", pull);
    window.addEventListener("pageshow", pull);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(id);
      window.removeEventListener("focus", pull);
      window.removeEventListener("pageshow", pull);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [refreshBootstrapFromServer, shouldBackgroundRefreshSoloCouple]);

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
      const previousDone = stateRef.current.completions.some(
        (c) => c.habitId === habitId && c.userId === userId && c.date === date,
      );
      const nextDone = !previousDone;
      const operationId = uid("op");
      const identity = completionIdentity(habitId, userId, date);

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
        const next = applyCompletionState(s, {
          habitId,
          userId,
          date,
          done: nextDone,
        });
        const habit = s.habits.find((h) => h.id === habitId);
        let milestones = next.milestones;
        if (habit && nextDone && !previousDone) {
          const unlocked = milestonesAfterNewCompletion(
            next,
            habit,
            habitId,
            userId,
            next.completions,
          );
          if (unlocked.length) milestones = [...milestones, ...unlocked];
        }
        return { ...next, milestones };
      });

      if (duoRuntime.duoDeferredSnapshotSync && !duoCloudActive) {
        requestDeferredSnapshotFlushSoon();
      }
      if (!duoCloudActive) return;

      const r = await duoActions.toggleCompletionAction({
        habitId,
        userId,
        date,
        action: nextDone ? "done" : "undone",
        operationId,
        clientTimestamp: new Date().toISOString(),
        deviceId: getDeviceId(),
      });
      if (!r.ok) {
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
        throw new Error(r.message);
      }

      pendingByOpRef.current.delete(operationId);
      if (latestOpByIdentityRef.current.get(identity) === operationId) {
        latestOpByIdentityRef.current.delete(identity);
      }
      seenOperationIdsRef.current.add(operationId);
      applyRemoteState(r.data.state);
    },
    [
      applyRemoteState,
      duoCloudActive,
      duoRuntime.duoDeferredSnapshotSync,
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
        let milestones = s.milestones;
        const unlocked = milestonesAfterNewCompletion(
          s,
          habit,
          args.habitId,
          args.partnerId,
          completions,
        );
        if (unlocked.length) milestones = [...milestones, ...unlocked];

        ok = true;
        return {
          ...s,
          completions,
          milestones,
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
      resetAll,
      applyRemoteHydration: applyRemoteState,
      refreshBootstrapFromServer,
      applyCompletionRealtimeEvent,
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
      resetAll,
      applyRemoteState,
      refreshBootstrapFromServer,
      applyCompletionRealtimeEvent,
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
            onHydrated={applyRemoteState}
            onSettled={() => setProfileResolved(true)}
          />
          <DuoCloudForegroundRefresh
            duoCloudActive={duoCloudActive}
            onRefresh={applyRemoteState}
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
