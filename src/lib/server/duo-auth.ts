import { auth } from "@clerk/nextjs/server";
import { getServiceSupabase } from "@/lib/server/supabase-admin";
import {
  serverDeferredSnapshotSyncEnabled,
  serverDuoCloudDataEnabled,
} from "@/lib/duo-cloud";

export class DuoActionError extends Error {
  constructor(
    message: string,
    public code: "unauthorized" | "not_configured" | "not_found" | "bad_request",
  ) {
    super(message);
    this.name = "DuoActionError";
  }
}

export async function requireClerkUserId(): Promise<string> {
  if (!serverDuoCloudDataEnabled() && !serverDeferredSnapshotSyncEnabled()) {
    throw new DuoActionError("Cloud data is not configured", "not_configured");
  }
  const { userId } = await auth();
  if (!userId) throw new DuoActionError("Sign in required", "unauthorized");
  return userId;
}

export type DuoContext = {
  clerkId: string;
  userUuid: string;
  coupleId: string | null;
  partnerUuid: string | null;
};

export async function requireDuoContext(): Promise<DuoContext> {
  const clerkId = await requireClerkUserId();
  const supabase = getServiceSupabase();
  if (!supabase) {
    throw new DuoActionError("Cloud data is not configured", "not_configured");
  }

  const { data: userRow, error: userErr } = await supabase
    .from("users")
    .select("id")
    .eq("clerk_id", clerkId)
    .maybeSingle();

  if (userErr) throw new DuoActionError(userErr.message, "bad_request");
  if (!userRow) {
    throw new DuoActionError("Profile not provisioned yet", "not_found");
  }

  const userUuid = userRow.id as string;

  const { data: memberRows } = await supabase
    .from("couple_members")
    .select("couple_id, user_id")
    .eq("user_id", userUuid);

  const coupleId =
    memberRows && memberRows.length > 0
      ? (memberRows[0].couple_id as string)
      : null;

  let partnerUuid: string | null = null;
  if (coupleId) {
    const { data: members } = await supabase
      .from("couple_members")
      .select("user_id")
      .eq("couple_id", coupleId);
    const ids = (members ?? []).map((m) => m.user_id as string);
    partnerUuid = ids.find((id) => id !== userUuid) ?? null;
  }

  return { clerkId, userUuid, coupleId, partnerUuid };
}

/** Require user row + membership in `coupleId` (habit-scoped writes). */
export async function requireCoupleMember(coupleId: string): Promise<DuoContext> {
  const ctx = await requireDuoContext();
  if (!ctx.coupleId || ctx.coupleId !== coupleId) {
    throw new DuoActionError("Not a member of this couple", "unauthorized");
  }
  return ctx;
}
