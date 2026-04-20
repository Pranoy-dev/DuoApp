import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { ClerkProvider } from "@clerk/nextjs";
import { Toaster } from "@/components/ui/sonner";
import { readDuoRuntimePublicEnv } from "@/lib/duo-cloud";
import { DuoRuntimeEnvProvider } from "@/lib/duo-runtime-env";
import { DeferredSnapshotSync } from "@/components/deferred-snapshot-sync";
import { CompletionRealtimeSync } from "@/components/completion-realtime-sync";
import { StoreProvider } from "@/lib/store";
import { CheerBurst } from "@/components/mobile/cheer-burst";
import { MilestoneOverlay } from "@/components/mobile/milestone-overlay";
import { ClerkSignOutRegistrar } from "@/components/clerk-signout-registrar";
import { SupabaseJwtBridge } from "@/components/supabase-jwt-bridge";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Duo — a habit streak for two",
  description:
    "A shared habit tracker for couples. Streaks and cheers.",
  applicationName: "Duo",
  appleWebApp: {
    capable: true,
    title: "Duo",
    statusBarStyle: "default",
  },
  icons: {
    icon: "/icon.svg",
    apple: "/icon.svg",
  },
  formatDetection: { telephone: false, email: false, address: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f9f6f2" },
    { media: "(prefers-color-scheme: dark)", color: "#161513" },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const runtimeEnv = readDuoRuntimePublicEnv();
  const clerkPk = runtimeEnv.clerkPublishableKey.trim();
  const shell = (
    <StoreProvider>
      <DeferredSnapshotSync />
      {clerkPk ? <CompletionRealtimeSync /> : null}
      <main className="phone-frame flex min-h-0 flex-col">{children}</main>
      <CheerBurst />
      <MilestoneOverlay />
      <Toaster position="bottom-center" offset={88} />
    </StoreProvider>
  );

  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="app-shell min-h-full bg-gradient-to-b from-muted/60 to-background">
        <DuoRuntimeEnvProvider value={runtimeEnv}>
          {clerkPk ? (
            <ClerkProvider publishableKey={clerkPk}>
              <ClerkSignOutRegistrar />
              <SupabaseJwtBridge />
              {shell}
            </ClerkProvider>
          ) : (
            shell
          )}
        </DuoRuntimeEnvProvider>
      </body>
    </html>
  );
}
