"use client";

type LoadingScreenProps = {
  title?: string;
  subtitle?: string;
};

export function LoadingScreen({
  title = "Loading Duo...",
  subtitle = "Syncing your space",
}: LoadingScreenProps) {
  return (
    <div className="relative flex h-full flex-1 items-center justify-center overflow-hidden px-6">
      <div className="absolute inset-0 bg-gradient-to-b from-background via-muted/20 to-background" />
      <div className="absolute -top-24 left-1/2 size-64 -translate-x-1/2 rounded-full bg-duo/12 blur-3xl" />
      <div className="absolute -bottom-24 left-1/2 size-56 -translate-x-1/2 rounded-full bg-accent/12 blur-3xl" />

      <div className="relative flex w-full max-w-xs flex-col items-center gap-4 rounded-2xl border border-border/50 bg-card/75 px-6 py-7 text-center shadow-[0_16px_48px_-24px_rgba(0,0,0,0.35)] backdrop-blur">
        <div className="relative flex size-10 items-center justify-center">
          <span className="absolute size-10 animate-spin rounded-full border-2 border-duo/30 border-t-duo motion-reduce:animate-none" />
          <span className="size-2 rounded-full bg-duo" />
        </div>
        <div>
          <p className="text-sm font-semibold tracking-tight text-foreground">{title}</p>
          <p className="mt-1 text-xs text-muted-foreground">{subtitle}</p>
        </div>
      </div>
    </div>
  );
}
