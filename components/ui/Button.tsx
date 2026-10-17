"use client";

import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/utils";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Accent = "neutral" | "shopify" | "woo";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  /** Kept for older call sites; actions are always ink so platform colour stays an identity mark. */
  accent?: Accent;
  icon?: ReactNode;
  loading?: boolean;
  size?: "md" | "lg";
}

export function Button({
  variant = "secondary",
  icon,
  loading = false,
  size = "md",
  className,
  children,
  disabled,
  accent: _accent,
  ...props
}: ButtonProps) {
  void _accent;
  const base =
    "inline-flex shrink-0 items-center justify-center gap-2 rounded-lg font-semibold transition-[background-color,color,transform] duration-150 active:translate-y-px disabled:cursor-not-allowed disabled:opacity-45";
  const sizes = { md: "px-4 py-2.5 text-sm", lg: "px-6 py-3.5 text-base" };

  const variantClass: Record<Variant, string> = {
    primary: "bg-ink text-white hover:bg-[#2b3650]",
    secondary: "border-2 border-ink bg-surface text-ink hover:bg-marker-soft",
    ghost: "text-text-muted hover:bg-surface-raised hover:text-ink",
    danger: "border-2 border-bad bg-surface text-bad hover:bg-[#fbeceb]",
  };

  return (
    <button className={cn(base, sizes[size], variantClass[variant], className)} disabled={disabled || loading} {...props}>
      {loading ? <Spinner /> : icon}
      {children}
    </button>
  );
}

function Spinner() {
  return (
    <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-90" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  );
}
