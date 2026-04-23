const LEGACY_SCOPE = "anon";
let scope = LEGACY_SCOPE;

export type CachedQuote = {
  id: string | null;
  text: string;
  author: string | null;
};

type CachedQuoteEnvelopeV2 = {
  schemaVersion: 2;
  quote: CachedQuote;
  dateKey: string;
  scope: string;
  prefetchedAt: string;
};

export function setCelebrationStorageScope(next: string): void {
  scope = next && next.length > 0 ? next : LEGACY_SCOPE;
}

function seenKey(dateKey: string): string {
  return `duo.celebration.day.v1:${scope}:${dateKey}`;
}

function quoteKey(dateKey: string): string {
  return `duo.celebration.quote.v1:${scope}:${dateKey}`;
}

function localDeviceSeedKey(): string {
  return `duo.celebration.seed.v1:${scope}`;
}

export function hasSeenCelebrationFor(dateKey: string): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(seenKey(dateKey)) === "1";
  } catch {
    return false;
  }
}

export function markCelebrationSeen(dateKey: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(seenKey(dateKey), "1");
  } catch {
    /* storage disabled / quota — fine, we just re-show once */
  }
}

export function readCachedQuote(dateKey: string): CachedQuote | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(quoteKey(dateKey));
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (
      parsed &&
      typeof parsed === "object" &&
      "schemaVersion" in parsed &&
      (parsed as { schemaVersion?: unknown }).schemaVersion === 2
    ) {
      const envelope = parsed as Partial<CachedQuoteEnvelopeV2>;
      if (
        envelope.quote &&
        typeof envelope.quote.text === "string" &&
        envelope.quote.text.trim() &&
        envelope.dateKey === dateKey &&
        envelope.scope === scope
      ) {
        return {
          id: typeof envelope.quote.id === "string" ? envelope.quote.id : null,
          text: envelope.quote.text,
          author:
            typeof envelope.quote.author === "string"
              ? envelope.quote.author
              : null,
        };
      }
      return null;
    }
    if (
      parsed &&
      typeof parsed === "object" &&
      "text" in parsed &&
      typeof (parsed as { text?: unknown }).text === "string" &&
      (parsed as { text: string }).text.trim()
    ) {
      const legacy = parsed as Partial<CachedQuote>;
      return {
        id: typeof legacy.id === "string" ? legacy.id : null,
        text: legacy.text as string,
        author: typeof legacy.author === "string" ? legacy.author : null,
      };
    }
    return null;
  } catch {
    return null;
  }
}

export function writeCachedQuote(dateKey: string, quote: CachedQuote): void {
  if (typeof window === "undefined") return;
  try {
    const payload: CachedQuoteEnvelopeV2 = {
      schemaVersion: 2,
      quote,
      dateKey,
      scope,
      prefetchedAt: new Date().toISOString(),
    };
    window.localStorage.setItem(quoteKey(dateKey), JSON.stringify(payload));
  } catch {
    /* ignore */
  }
}

/**
 * Stable per-install seed used when the user isn't signed in so the
 * deterministic quote pick still stays consistent across reloads.
 */
export function getLocalDeviceSeed(): string {
  if (typeof window === "undefined") return "server";
  try {
    const key = localDeviceSeedKey();
    const existing = window.localStorage.getItem(key);
    if (existing) return existing;
    const generated = `seed_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`;
    window.localStorage.setItem(key, generated);
    return generated;
  } catch {
    return "anon";
  }
}

/**
 * Small curated fallback shown when the server action fails (offline, env not
 * configured yet, etc.) so the celebration still feels alive.
 */
export const FALLBACK_QUOTES: CachedQuote[] = [
  { id: null, text: "Small steps every day, hand in hand.", author: null },
  { id: null, text: "You showed up. That is the whole trick.", author: null },
  { id: null, text: "Done beats perfect, every single time.", author: null },
  { id: null, text: "Consistency is compound interest for the soul.", author: null },
  { id: null, text: "Keep stacking good days.", author: null },
];

export function pickFallbackQuote(dateKey: string): CachedQuote {
  let h = 2166136261;
  for (let i = 0; i < dateKey.length; i += 1) {
    h ^= dateKey.charCodeAt(i);
    h = (h * 16777619) >>> 0;
  }
  return FALLBACK_QUOTES[h % FALLBACK_QUOTES.length];
}
