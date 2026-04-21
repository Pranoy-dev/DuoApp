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

/** Deterministic per (clerkId, dateKey) daily pick from the active quotes pool. */
export async function getDailyQuoteForClerkId(
  clerkId: string,
  dateKey: string,
): Promise<DailyQuote | null> {
  const pool = await loadPool();
  if (!pool.length) return null;
  const seed = stableHash(`${clerkId}::${dateKey}`);
  return pool[seed % pool.length] ?? null;
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
