import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type Tone = "neutral" | "shopify" | "woo" | "success" | "warning" | "danger" | "marker";

const toneClasses: Record<Tone, string> = {
  neutral: "bg-surface-raised text-text-muted border-border",
  shopify: "bg-shopify-soft text-shopify-deep border-shopify/30",
  woo: "bg-woo-soft text-woo-deep border-woo/30",
  success: "bg-[#e6f3ec] text-ok border-ok/25",
  warning: "bg-marker-soft text-warn border-[#e8c950]",
  danger: "bg-[#fbeceb] text-bad border-bad/25",
  marker: "bg-marker text-ink border-[#e8c950]",
};

export function Badge({ children, tone = "neutral", className }: { children: ReactNode; tone?: Tone; className?: string }) {
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

/** Small identity mark for a platform: its real brand colour as a dot plus the name. */
export function PlatformMark({ id, name }: { id: string; name: string }) {
  const dot: Record<string, string> = {
    shopify: "bg-shopify",
    woocommerce: "bg-woo",
    wordpress: "bg-[#21759b]",
    wix: "bg-[#0c6efc]",
    squarespace: "bg-ink",
    bigcommerce: "bg-[#121118]",
    magento: "bg-[#ee672f]",
  };
  return (
    <span className="inline-flex items-center gap-[0.3em]">
      <span
        className={cn("h-[0.42em] min-h-2.5 w-[0.42em] min-w-2.5 shrink-0 rounded-full", dot[id] ?? "bg-text-faint")}
        aria-hidden="true"
      />
      {name}
    </span>
  );
}
