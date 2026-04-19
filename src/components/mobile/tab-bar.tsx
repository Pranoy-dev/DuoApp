"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BookHeart, Home, Sparkles, UsersRound, Settings } from "lucide-react";
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
  return (
    <nav
      aria-label="Primary"
      className="pointer-events-none absolute inset-x-0 bottom-0 z-40 flex justify-center pb-[max(env(safe-area-inset-bottom),0.5rem)]"
    >
      <div className="pointer-events-auto mx-8 mb-1.5 flex w-full max-w-[400px] items-stretch justify-between rounded-full border border-border/60 bg-background/80 p-1 shadow-[0_10px_40px_-12px_rgba(0,0,0,0.18)] backdrop-blur-xl">
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
              <span>{t.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
