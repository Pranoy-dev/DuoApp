import type { NextConfig } from "next";

if (process.env.VERCEL === "1") {
  const pk = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY?.trim();
  const sk = process.env.CLERK_SECRET_KEY?.trim();
  if (pk && !sk) {
    console.warn(
      "[Duo/Vercel] NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY is set but CLERK_SECRET_KEY is missing — auth proxy will not run. Add CLERK_SECRET_KEY in Vercel → Project → Settings → Environment Variables, then redeploy.",
    );
  }
  if (!pk && sk) {
    console.warn(
      "[Duo/Vercel] CLERK_SECRET_KEY is set but NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY is missing — ClerkProvider will not mount. Add NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY for this environment and redeploy.",
    );
  }
  const deferred = process.env.NEXT_PUBLIC_DUO_DEFERRED_SNAPSHOT_SYNC?.trim();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const sr = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (
    deferred &&
    (deferred === "1" || deferred.toLowerCase() === "true") &&
    (!url || !sr || !sk)
  ) {
    console.warn(
      "[Duo/Vercel] NEXT_PUBLIC_DUO_DEFERRED_SNAPSHOT_SYNC is on but Supabase URL, SUPABASE_SERVICE_ROLE_KEY, or CLERK_SECRET_KEY is missing — snapshot sync will not run.",
    );
  }
  const serverInvites = process.env.NEXT_PUBLIC_DUO_SERVER_INVITES?.trim();
  if (
    serverInvites &&
    (serverInvites === "1" || serverInvites.toLowerCase() === "true") &&
    (!url || !sr || !sk)
  ) {
    console.warn(
      "[Duo/Vercel] NEXT_PUBLIC_DUO_SERVER_INVITES is on but Supabase URL, SUPABASE_SERVICE_ROLE_KEY, or CLERK_SECRET_KEY is missing — server pairing will not run.",
    );
  }
}

const nextConfig: NextConfig = {
  /* config options here */
};

export default nextConfig;
