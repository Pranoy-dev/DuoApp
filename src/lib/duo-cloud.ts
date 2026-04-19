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

/** Client + SSR: Clerk publishable key present and cloud data flag on. */
export function duoCloudClientConfigured(): boolean {
  return (
    publicDuoCloudDataEnabled() &&
    Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY?.trim())
  );
}
