import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function clampNote(raw: string): string {
  const t = raw.trim();
  return t.length > 2000 ? t.slice(0, 2000) : t;
}

export async function POST(req: Request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRole) {
    return NextResponse.json({ ok: false, skipped: true }, { status: 200 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  if (!body || typeof body !== "object") {
    return NextResponse.json({ ok: false, error: "invalid_body" }, { status: 400 });
  }

  const o = body as Record<string, unknown>;
  const externalUserId =
    typeof o.externalUserId === "string" ? o.externalUserId.trim() : "";
  const date = typeof o.date === "string" ? o.date.trim() : "";
  const starsRaw = o.stars;
  const note = typeof o.note === "string" ? clampNote(o.note) : "";

  if (!externalUserId || externalUserId.length > 128) {
    return NextResponse.json({ ok: false, error: "external_user_id" }, { status: 400 });
  }
  if (!DATE_RE.test(date)) {
    return NextResponse.json({ ok: false, error: "date" }, { status: 400 });
  }
  const stars =
    typeof starsRaw === "number" && Number.isFinite(starsRaw)
      ? Math.min(5, Math.max(1, Math.round(starsRaw)))
      : NaN;
  if (Number.isNaN(stars)) {
    return NextResponse.json({ ok: false, error: "stars" }, { status: 400 });
  }

  const supabase = createClient(url, serviceRole, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const savedAt =
    typeof o.savedAt === "string" && o.savedAt ? o.savedAt : new Date().toISOString();

  const { error } = await supabase.from("day_excitement_local").upsert(
    {
      external_user_id: externalUserId,
      date,
      stars,
      note,
      saved_at: savedAt,
    },
    { onConflict: "external_user_id,date" },
  );

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 502 });
  }

  return NextResponse.json({ ok: true });
}
