import { createServerClient } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

/** Skip Supabase round-trip when the browser has no Supabase session cookies (Clerk-only + service-role Duo). */
function requestMayHaveSupabaseAuthCookies(request: NextRequest): boolean {
  return request.cookies.getAll().some(({ name }) => {
    const n = name.toLowerCase();
    return (
      n.startsWith("sb-") &&
      (n.includes("auth") || n.includes("refresh") || n.includes("token"))
    );
  });
}

/**
 * Refreshes Supabase Auth cookies. Next.js 16: import this from `src/proxy.ts`
 * (do not add `src/middleware.ts` — it conflicts with `proxy.ts`).
 *
 * Uses `NextResponse.next({ request })` (full request) and only sets cookies
 * on the response — avoids Next.js routing 404s.
 */
export const createClient = async (request: NextRequest) => {
  if (!supabaseUrl || !supabaseKey) {
    return NextResponse.next({ request });
  }

  if (!requestMayHaveSupabaseAuthCookies(request)) {
    return NextResponse.next({ request });
  }

  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(supabaseUrl, supabaseKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        supabaseResponse = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          supabaseResponse.cookies.set(name, value, options),
        );
      },
    },
  });

  await supabase.auth.getUser();

  return supabaseResponse;
};
