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
}

const nextConfig: NextConfig = {
  /* config options here */
};

export default nextConfig;
