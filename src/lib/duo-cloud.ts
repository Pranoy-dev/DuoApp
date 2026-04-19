/**
 * Duo “cloud” mode: Clerk + Supabase server actions with service role and
 * explicit scoping. Enable with NEXT_PUBLIC_DUO_USE_SERVER_DATA=1 and full
 * server env (Clerk secret, Supabase URL, service role).
 */

function truthy(v: string | undefined): boolean {
  return v === "1" || v?.toLowerCase() === "true";
}

/** Client + server: user opted into server-backed data (public flag). */
export function publicDuoCloudDataEnabled(): boolean {
  return truthy(process.env.NEXT_PUBLIC_DUO_USE_SERVER_DATA);
}

/** Clerk secret + Supabase URL + service role (shared by live sync and deferred snapshot). */
export function serverDuoServiceStackConfigured(): boolean {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const sr = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  const clerk = process.env.CLERK_SECRET_KEY?.trim();
  return Boolean(url && sr && clerk);
}

/** Server only: per-action Server Actions + live Supabase (NEXT_PUBLIC_DUO_USE_SERVER_DATA=1). */
export function serverDuoCloudDataEnabled(): boolean {
  if (!publicDuoCloudDataEnabled()) return false;
  return serverDuoServiceStackConfigured();
}

/**
 * Deferred snapshot sync: local-first UI, batch push/pull to Supabase without
 * NEXT_PUBLIC_DUO_USE_SERVER_DATA. Requires service stack + public flag.
 */
export function serverDeferredSnapshotSyncEnabled(): boolean {
  return (
    truthy(process.env.NEXT_PUBLIC_DUO_DEFERRED_SNAPSHOT_SYNC) &&
    serverDuoServiceStackConfigured()
  );
}

/** Invite rows in Supabase without full habit sync or deferred snapshots (pairing only). */
export function serverInvitePairingEnabled(): boolean {
  return (
    truthy(process.env.NEXT_PUBLIC_DUO_SERVER_INVITES) &&
    serverDuoServiceStackConfigured()
  );
}

/** Phase 2: exchange Clerk token for Supabase session (optional). */
export function publicDuoSupabaseJwtExchangeEnabled(): boolean {
  return truthy(process.env.NEXT_PUBLIC_DUO_SUPABASE_JWT_EXCHANGE);
}

/**
 * Public env read on the server each request and passed into the client tree.
 * Ensures Vercel (and local) pick up `NEXT_PUBLIC_*` after deploy without relying
 * on client-bundle build-time inlining alone.
 */
export type DuoRuntimePublicEnv = {
  clerkPublishableKey: string;
  clerkSignInUrl: string;
  clerkSignUpUrl: string;
  duoUseServerData: boolean;
  /** Local-first + nightly/visibility snapshot push to Supabase (see README). */
  duoDeferredSnapshotSync: boolean;
  /** Write couples/invites to Supabase for cross-device join without live habit sync. */
  duoServerInvites: boolean;
  duoSupabaseJwtExchange: boolean;
  supabaseUrl: string;
  supabasePublishableKey: string;
  supabaseAnonKey: string;
};

export function readDuoRuntimePublicEnv(): DuoRuntimePublicEnv {
  return {
    clerkPublishableKey:
      process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY?.trim() ?? "",
    clerkSignInUrl:
      process.env.NEXT_PUBLIC_CLERK_SIGN_IN_URL?.trim() || "/sign-in",
    clerkSignUpUrl:
      process.env.NEXT_PUBLIC_CLERK_SIGN_UP_URL?.trim() || "/sign-up",
    duoUseServerData: truthy(process.env.NEXT_PUBLIC_DUO_USE_SERVER_DATA),
    duoDeferredSnapshotSync: truthy(
      process.env.NEXT_PUBLIC_DUO_DEFERRED_SNAPSHOT_SYNC,
    ),
    duoServerInvites: truthy(process.env.NEXT_PUBLIC_DUO_SERVER_INVITES),
    duoSupabaseJwtExchange: truthy(
      process.env.NEXT_PUBLIC_DUO_SUPABASE_JWT_EXCHANGE,
    ),
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ?? "",
    supabasePublishableKey:
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim() ?? "",
    supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() ?? "",
  };
}

/** Use with {@link readDuoRuntimePublicEnv} or {@link useDuoRuntimeEnv} on the client. */
export function computeDuoCloudClientConfigured(
  env: DuoRuntimePublicEnv,
): boolean {
  return env.duoUseServerData && Boolean(env.clerkPublishableKey.trim());
}

export function computeDuoSupabaseJwtExchangeEnabled(
  env: DuoRuntimePublicEnv,
): boolean {
  return env.duoSupabaseJwtExchange;
}

/** Client: deferred snapshot mode is on (server still needs service stack). */
export function computeDeferredSnapshotClientEnabled(
  env: DuoRuntimePublicEnv,
): boolean {
  return env.duoDeferredSnapshotSync && Boolean(env.clerkPublishableKey.trim());
}

/**
 * Use server for provision / create couple / join only while habits stay local
 * (deferred snapshot on, live NEXT_PUBLIC_DUO_USE_SERVER_DATA off).
 */
export function computeDeferredHybridCoupleServerEnabled(
  env: DuoRuntimePublicEnv,
): boolean {
  return (
    computeDeferredSnapshotClientEnabled(env) &&
    !computeDuoCloudClientConfigured(env)
  );
}

/**
 * Use Supabase Server Actions for provision / create couple / join (so invite
 * codes exist in `invites` for the other device). True for live cloud, hybrid
 * deferred, or {@link DuoRuntimePublicEnv.duoServerInvites} only.
 */
export function computeServerCoupleActionsEnabled(
  env: DuoRuntimePublicEnv,
): boolean {
  if (computeDuoCloudClientConfigured(env)) return true;
  const clerk = Boolean(env.clerkPublishableKey.trim());
  if (!clerk || env.duoUseServerData) return false;
  return Boolean(env.duoDeferredSnapshotSync || env.duoServerInvites);
}
