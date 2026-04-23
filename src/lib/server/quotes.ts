import { getServiceSupabase } from "@/lib/server/supabase-admin";

export type DailyQuote = {
  id: string;
  text: string;
  author: string | null;
};

type CachedQuotePool = {
  fetchedAt: number;
  quotes: DailyQuote[];
};

const POOL_TTL_MS = 5 * 60 * 1000;
let cachedPool: CachedQuotePool | null = null;

function stableHash(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i);
    h = (h * 16777619) >>> 0;
  }
  return h >>> 0;
}

async function loadPool(): Promise<DailyQuote[]> {
  const now = Date.now();
  if (cachedPool && now - cachedPool.fetchedAt < POOL_TTL_MS) {
    return cachedPool.quotes;
  }
  const supabase = getServiceSupabase();
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("quotes")
    .select("id, text, author")
    .eq("active", true)
    .order("id", { ascending: true });
  if (error || !data) return cachedPool?.quotes ?? [];
  const quotes = data.map((row) => ({
    id: row.id as string,
    text: row.text as string,
    author: (row.author as string | null) ?? null,
  }));
  cachedPool = { fetchedAt: now, quotes };
  return quotes;
}

/** Sequential non-repeating pick per user from the active quotes pool. */
export async function getDailyQuoteForClerkId(
  clerkId: string,
): Promise<DailyQuote | null> {
  const supabase = getServiceSupabase();
  if (!supabase) return null;
  const pool = await loadPool();
  if (!pool.length) return null;
  const { data: userRow } = await supabase
    .from("users")
    .select("id")
    .eq("clerk_id", clerkId)
    .maybeSingle();
  const userId = userRow?.id as string | undefined;
  if (!userId) {
    const seed = stableHash(`${clerkId}::fallback`);
    return pool[seed % pool.length] ?? null;
  }

  const { data: rotationRow } = await supabase
    .from("user_quote_rotation")
    .select("last_quote_id")
    .eq("user_id", userId)
    .maybeSingle();

  const lastQuoteId = (rotationRow?.last_quote_id as string | null | undefined) ?? null;
  const lastIndex = lastQuoteId
    ? pool.findIndex((quote) => quote.id === lastQuoteId)
    : -1;
  const nextIndex = (lastIndex + 1 + pool.length) % pool.length;
  const nextQuote = pool[nextIndex] ?? pool[0] ?? null;
  if (!nextQuote) return null;

  await supabase.from("user_quote_rotation").upsert(
    {
      user_id: userId,
      last_quote_id: nextQuote.id,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" },
  );

  return nextQuote;
}

/** Same as above but keyed on an arbitrary client-provided seed (local-only mode). */
export async function getDailyQuoteForSeed(
  seed: string,
  dateKey: string,
): Promise<DailyQuote | null> {
  const pool = await loadPool();
  if (!pool.length) return null;
  const h = stableHash(`${seed}::${dateKey}`);
  return pool[h % pool.length] ?? null;
}
