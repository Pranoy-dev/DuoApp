/** Set by `ClerkSignOutRegistrar` when ClerkProvider is active. */
let clerkSignOut: (() => Promise<void>) | null = null;

export function setClerkSignOut(fn: (() => Promise<void>) | null): void {
  clerkSignOut = fn;
}

export async function runClerkSignOut(): Promise<void> {
  if (clerkSignOut) await clerkSignOut();
}
