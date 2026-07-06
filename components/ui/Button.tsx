"use client";

import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/utils";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Accent = "neutral" | "shopify" | "woo";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  accent?: Accent;
  icon?: ReactNode;
  loading?: boolean;
}

const primaryByAccent: Record<Accent, string> = {
  neutral: "bg-text text-bg hover:opacity-90",
  shopify: "bg-shopify text-white hover:bg-shopify-deep",
  woo: "bg-woo text-white hover:bg-woo-deep",
};

export function Button({
  variant = "secondary",
  accent = "neutral",
  icon,
  loading = false,
  className,
  children,
  disabled,
  ...props
}: ButtonProps) {
  const base =
    "inline-flex shrink-0 items-center justify-center gap-2 rounded-lg text-sm font-medium px-4 py-2.5 transition-colors duration-150 disabled:opacity-50 disabled:cursor-not-allowed";

  const variantClass: Record<Variant, string> = {
    primary: primaryByAccent[accent],
    secondary: "bg-surface-raised text-text border border-border-strong hover:bg-surface-hover",
    ghost: "text-text-muted hover:text-text hover:bg-surface-hover",
    danger: "bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500/20",
  };

  return (
    <button className={cn(base, variantClass[variant], className)} disabled={disabled || loading} {...props}>
      {loading ? <Spinner /> : icon}
      {children}
    </button>
  );
}

function Spinner() {
  return (
    <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  );
}
