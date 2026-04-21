import { readFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();

const checks = [
  {
    file: "src/lib/store.tsx",
    mustContain: [
      "profileResolved",
      "setSyncMetaScope(",
      "storageScope(",
      "storageKeyForScope(",
      "readInitial(scopedStorageKey)",
    ],
  },
  {
    file: "src/app/page.tsx",
    mustContain: [
      "profileResolved",
      "if (!ready || !profileResolved) return;",
      "if (!profileResolved) return;",
    ],
  },
  {
    file: "src/app/(app)/layout.tsx",
    mustContain: [
      "profileResolved",
      "if (!ready || !profileResolved) return;",
      "if (!ready || !profileResolved || !state.me)",
    ],
  },
  {
    file: "src/app/onboarding/page.tsx",
    mustContain: [
      "profileResolved",
      "if (!ready || !profileResolved) return;",
      "if (state.me) router.replace(\"/today\")",
    ],
  },
  {
    file: "src/app/invite/[code]/page.tsx",
    mustContain: [
      "isLoaded: authLoaded",
      "Please wait a moment while we verify your session.",
      "disabled={clerkInviteGate && (!authLoaded || !userId)}",
    ],
  },
  {
    file: "src/lib/duo-cloud.ts",
    mustContain: [
      "computeDuoCloudClientConfigured",
      "computeServerCoupleActionsEnabled",
      "duoUseServerData",
    ],
  },
];

let failed = false;

for (const check of checks) {
  const fullPath = path.join(root, check.file);
  const content = await readFile(fullPath, "utf8");
  for (const needle of check.mustContain) {
    if (!content.includes(needle)) {
      failed = true;
      console.error(`Missing required invariant in ${check.file}: ${needle}`);
    }
  }
}

if (failed) {
  console.error("\nCritical flow check failed.");
  process.exit(1);
}

console.log("Critical flow check passed.");
