import type { InputHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        "w-full rounded-lg border border-border-strong bg-surface px-3 py-2 text-sm text-text",
        "placeholder:text-text-faint outline-none transition-colors focus:border-text-muted",
        className
      )}
      {...props}
    />
  );
}

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-medium text-text-muted">{label}</span>
      {children}
      {hint ? <span className="mt-1 block text-xs text-text-faint">{hint}</span> : null}
    </label>
  );
}
