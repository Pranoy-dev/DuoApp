# Release Checklist

Run this every time before pushing important changes and before merging pull requests.

## Automated gate

1. Run `pnpm check`.
2. Confirm all steps pass:
   - `pnpm lint`
   - `pnpm typecheck`
   - `pnpm check:critical`
   - `pnpm build:check`

## Manual regression checks (high risk flows)

### Existing user cold start

1. Open app with an already paired account that has habits.
2. Confirm app lands on `/today`.
3. Confirm no onboarding flash appears.

Expected: User remains in app shell with existing data intact.

### Pairing consistency (inviter and accepter)

1. User A creates/shares invite link.
2. User B accepts link on another device/session.
3. Return to User A app tab and trigger refresh by focus/visibility.

Expected: Both users see each other as partner.

### Shared habit cross-device visibility

1. User A adds a shared habit.
2. User B refreshes/focuses app.

Expected: User B sees the new shared habit.

### Account switch isolation

1. Sign out user A.
2. Sign in user B on same browser/device.
3. Visit app root.

Expected: No user A profile or habits leak into user B session.

## GitHub branch protection (one-time setup)

Set the `Quality Gate` workflow status check as required for `main` so merges are blocked when checks fail.
