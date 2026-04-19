import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { ClerkProvider } from "@clerk/nextjs";
import { Toaster } from "@/components/ui/sonner";
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
    "A shared habit tracker for couples. Streaks, cheers, and a daily quote.",
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
  const clerkPk = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY?.trim();
  const shell = (
    <StoreProvider>
      <main className="phone-frame flex flex-col">{children}</main>
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
        {clerkPk ? (
          <ClerkProvider publishableKey={clerkPk}>
            <ClerkSignOutRegistrar />
            <SupabaseJwtBridge />
            {shell}
          </ClerkProvider>
        ) : (
          shell
        )}
      </body>
    </html>
  );
}
