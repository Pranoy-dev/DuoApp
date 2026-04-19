import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  serverDeferredSnapshotSyncEnabled,
  serverDuoCloudDataEnabled,
  serverInvitePairingEnabled,
} from "@/lib/duo-cloud";

/** Service-role client. Bypasses RLS — only use after Clerk verification + explicit filters. */
export function getServiceSupabase(): SupabaseClient | null {
  if (
    !serverDuoCloudDataEnabled() &&
    !serverDeferredSnapshotSyncEnabled() &&
    !serverInvitePairingEnabled()
  ) {
    return null;
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) return null;
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
