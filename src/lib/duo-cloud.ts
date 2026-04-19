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

/** Server only: full stack available for Server Actions. */
export function serverDuoCloudDataEnabled(): boolean {
  if (!publicDuoCloudDataEnabled()) return false;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const sr = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  const clerk = process.env.CLERK_SECRET_KEY?.trim();
  return Boolean(url && sr && clerk);
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
