import { type NextRequest } from "next/server";
import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { createClient } from "@/utils/supabase/middleware";

const hasClerk = Boolean(process.env.CLERK_SECRET_KEY);

const publishableKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY?.trim();

/** Require a signed-in Clerk user whenever the app ships a publishable key. */
const requireClerkSession =
  Boolean(publishableKey) &&
  process.env.NEXT_PUBLIC_CLERK_DISABLE_ROUTE_GUARD !== "1";

const isPublicRoute = createRouteMatcher([
  "/sign-in(.*)",
  "/sign-up(.*)",
  "/invite(.*)",
]);

/** Clerk (optional) + Supabase session refresh — Next.js 16 `proxy.ts`. */
export default hasClerk
  ? clerkMiddleware(async (auth, request) => {
      if (requireClerkSession && !isPublicRoute(request)) {
        await auth.protect();
      }
      return createClient(request);
    })
  : async (request: NextRequest) => createClient(request);

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
