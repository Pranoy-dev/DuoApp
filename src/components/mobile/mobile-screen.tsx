import { cn } from "@/lib/utils";

type Props = {
  title?: string;
  eyebrow?: string;
  trailing?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  scroll?: boolean;
};

export function MobileScreen({
  title,
  eyebrow,
  trailing,
  children,
  className,
  scroll = true,
}: Props) {
  return (
    <div className={cn("flex h-full flex-col", className)}>
      {(title || eyebrow || trailing) && (
        <header
          className="safe-x flex items-end justify-between gap-3 pb-3"
          style={{
            paddingTop: "max(env(safe-area-inset-top), 2rem)",
          }}
        >
          <div className="min-w-0">
            {eyebrow && (
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                {eyebrow}
              </p>
            )}
            {title && (
              <h1 className="mt-0.5 truncate text-[26px] font-semibold leading-tight tracking-tight">
                {title}
              </h1>
            )}
          </div>
          {trailing && (
            <div className="flex shrink-0 items-center gap-2 pb-0.5">
              {trailing}
            </div>
          )}
        </header>
      )}
      <div
        className={cn(
          "safe-x min-h-0 flex-1",
          scroll && "overflow-y-auto no-scrollbar",
        )}
      >
        {children}
        <div className="h-24" />
      </div>
    </div>
  );
}
