"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BookHeart, Home, Sparkles, UsersRound, Settings } from "lucide-react";
import { useStore } from "@/lib/store";
import { cn } from "@/lib/utils";

const TABS = [
  { href: "/today", label: "Today", icon: Home },
  { href: "/partner", label: "Partner", icon: UsersRound },
  { href: "/us", label: "Us", icon: Sparkles },
  { href: "/journal", label: "Journal", icon: BookHeart },
  { href: "/settings", label: "Settings", icon: Settings },
] as const;

export function TabBar() {
  const pathname = usePathname();
  const { partnerUpdatesBadge } = useStore();
  return (
    <nav
      aria-label="Primary"
      className="z-40 flex shrink-0 justify-center border-t border-border/40 bg-background/95 px-6 pt-2 pb-[max(env(safe-area-inset-bottom),0.5rem)] backdrop-blur-xl"
    >
      <div className="flex w-full max-w-[400px] items-stretch justify-between rounded-full border border-border/60 bg-background/90 p-1 shadow-[0_10px_40px_-12px_rgba(0,0,0,0.18)] backdrop-blur-xl">
        {TABS.map((t) => {
          const active =
            pathname === t.href || pathname.startsWith(`${t.href}/`);
          const Icon = t.icon;
          return (
            <Link
              key={t.href}
              href={t.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "group relative flex flex-1 flex-col items-center justify-center gap-0.5 rounded-full px-1 py-1.5 text-[10px] font-medium leading-none tracking-wide transition-colors",
                active
                  ? "bg-foreground text-background"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <Icon
                className={cn(
                  "size-[18px] transition-transform",
                  active && "scale-105",
                )}
                strokeWidth={active ? 2.25 : 1.75}
              />
              {t.href === "/partner" && partnerUpdatesBadge > 0 ? (
                <span
                  className={cn(
                    "absolute top-0.5 right-[calc(50%-14px)] inline-flex min-w-4 items-center justify-center rounded-full bg-gradient-to-r from-rose-600 via-red-500 to-pink-500 px-1.5 text-[9px] font-bold leading-4 text-white ring-1 ring-background/80 shadow-[0_6px_16px_-6px_rgba(244,63,94,0.9)]",
                    active &&
                      "from-background via-background to-background text-foreground ring-foreground/15 shadow-[0_6px_16px_-8px_rgba(0,0,0,0.35)]",
                  )}
                  aria-label={`${partnerUpdatesBadge} unread partner updates`}
                >
                  {partnerUpdatesBadge > 99 ? "99+" : partnerUpdatesBadge}
                </span>
              ) : null}
              <span>{t.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
