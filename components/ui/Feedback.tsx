import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type Accent = "neutral" | "shopify" | "woo";

export function StatCard({ label, value }: { label: string; value: string | number; accent?: Accent }) {
  return (
    <div className="border-l-2 border-ink pl-3">
      <div className="font-wide text-2xl font-bold text-ink">
        {typeof value === "number" ? value.toLocaleString() : value}
      </div>
      <div className="text-sm text-text-muted">{label}</div>
    </div>
  );
}

export function EmptyState({ icon, title, description }: { icon?: ReactNode; title: string; description: string }) {
  return (
    <div className="flex flex-col items-start gap-2 rounded-xl border-2 border-dashed border-border-strong px-6 py-10">
      {icon}
      <div className="font-semibold text-ink">{title}</div>
      <div className="max-w-md text-sm text-text-muted">{description}</div>
    </div>
  );
}

export function ProgressBar({ value }: { value: number; accent?: Accent }) {
  return (
    <div
      className="h-2 w-full overflow-hidden rounded-full border border-ink bg-surface"
      role="progressbar"
      aria-valuenow={Math.round(value)}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div
        className="h-full bg-ink transition-[width] duration-300"
        style={{ width: `${Math.min(100, Math.max(2, value))}%` }}
      />
    </div>
  );
}

export function Notice({
  tone = "info",
  children,
  className,
}: {
  tone?: "info" | "error" | "wait";
  children: ReactNode;
  className?: string;
}) {
  const tones = {
    info: "border-border bg-surface-hover text-text-muted",
    error: "border-bad/40 bg-[#fbeceb] text-bad",
    wait: "border-[#e8c950] bg-marker-soft text-warn",
  };
  return (
    <div
      role={tone === "error" ? "alert" : undefined}
      className={cn("rounded-lg border px-3.5 py-2.5 text-sm leading-relaxed", tones[tone], className)}
    >
      {children}
    </div>
  );
}
