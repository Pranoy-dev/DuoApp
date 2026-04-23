"use server";

import { auth } from "@clerk/nextjs/server";
import {
  getDailyQuoteForClerkId,
  getDailyQuoteForSeed,
  type DailyQuote,
} from "@/lib/server/quotes";
import { serverDuoServiceStackConfigured } from "@/lib/duo-cloud";

export type QuoteActionResult =
  | { ok: true; data: DailyQuote | null }
  | { ok: false; code: string; message: string };

/**
 * Non-repeating quote fetch. In cloud mode this advances a per-user sequence.
 * Falls back to a client-supplied seed when the user is not signed in.
 */
export async function getDailyQuoteAction(input: {
  dateKey: string;
  localSeed?: string;
}): Promise<QuoteActionResult> {
  try {
    if (!serverDuoServiceStackConfigured()) {
      return { ok: true, data: null };
    }
    if (!input.dateKey) {
      return { ok: false, code: "bad_request", message: "Missing dateKey" };
    }
    const { userId } = await auth();
    if (userId) {
      const quote = await getDailyQuoteForClerkId(userId);
      return { ok: true, data: quote };
    }
    if (input.localSeed) {
      const quote = await getDailyQuoteForSeed(input.localSeed, input.dateKey);
      return { ok: true, data: quote };
    }
    return { ok: true, data: null };
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return { ok: false, code: "error", message };
  }
}
