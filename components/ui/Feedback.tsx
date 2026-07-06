import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type Accent = "neutral" | "shopify" | "woo";

export function StatCard({
  label,
  value,
  accent = "neutral",
}: {
  label: string;
  value: string | number;
  accent?: Accent;
}) {
  const borderClass: Record<Accent, string> = {
    neutral: "border-l-border-strong",
    shopify: "border-l-shopify",
    woo: "border-l-woo",
  };

  return (
    <div className={cn("rounded-lg border border-border bg-surface px-4 py-3 border-l-2", borderClass[accent])}>
      <div className="text-xs uppercase tracking-wide text-text-faint">{label}</div>
      <div className="mt-1 font-mono text-xl text-text">{value}</div>
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  description,
}: {
  icon?: ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border-strong px-6 py-16 text-center">
      {icon}
      <div className="font-medium text-text">{title}</div>
      <div className="max-w-sm text-sm text-text-muted">{description}</div>
    </div>
  );
}

export function ProgressBar({ value, accent = "neutral" }: { value: number; accent?: Accent }) {
  const fillClass: Record<Accent, string> = {
    neutral: "bg-text",
    shopify: "bg-shopify",
    woo: "bg-woo",
  };

  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-raised">
      <div
        className={cn("h-full rounded-full transition-all duration-300", fillClass[accent])}
        style={{ width: `${Math.min(100, Math.max(2, value))}%` }}
      />
    </div>
  );
}
