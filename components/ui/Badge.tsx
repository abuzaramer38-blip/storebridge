import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type Tone = "neutral" | "shopify" | "woo" | "success" | "warning" | "danger";

const toneClasses: Record<Tone, string> = {
  neutral: "bg-surface-raised text-text-muted border-border-strong",
  shopify: "bg-shopify-soft text-shopify border-shopify/30",
  woo: "bg-woo-soft text-woo border-woo/30",
  success: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
  warning: "bg-amber-500/10 text-amber-400 border-amber-500/20",
  danger: "bg-red-500/10 text-red-400 border-red-500/20",
};

export function Badge({
  children,
  tone = "neutral",
  className,
}: {
  children: ReactNode;
  tone?: Tone;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center whitespace-nowrap rounded-md border px-2 py-0.5 text-xs font-medium",
        toneClasses[tone],
        className
      )}
    >
      {children}
    </span>
  );
}
