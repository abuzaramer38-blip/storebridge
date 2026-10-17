"use client";

import { useCallback, useState } from "react";
import { Download, ImageOff, Star, TrendingUp } from "lucide-react";
import type { BestsellerRow, BestsellersResult } from "@/lib/bestsellers";
import { cn } from "@/lib/utils";
import { Badge, PlatformMark } from "@/components/ui/Badge";
import { EmptyState, Notice } from "@/components/ui/Feedback";
import type { DetectedPlatform } from "@/components/Dashboard";
import { useAutoRun } from "@/components/useAutoRun";

type State =
  | { kind: "idle" }
  | { kind: "loading"; url: string }
  | { kind: "error"; url: string; message: string }
  | { kind: "done"; url: string; result: BestsellersResult };

const LIMITS = [50, 100, 200, 300];
const host = (url: string) => url.replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/$/, "");

function money(v: number | null, currency: string | null) {
  if (v === null) return "—";
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency: currency || "USD" }).format(v);
  } catch {
    return v.toFixed(2);
  }
}

export function BestsellersPanel({
  url,
  runId,
  active,
  onDetected,
}: {
  url: string | null;
  runId: number;
  active: boolean;
  onDetected: (p: DetectedPlatform) => void;
}) {
  const [limit, setLimit] = useState(100);
  const [state, setState] = useState<State>({ kind: "idle" });

  const load = useCallback(
    async (target: string, count = limit) => {
      setState({ kind: "loading", url: target });
      try {
        const res = await fetch(`/api/bestsellers?url=${encodeURIComponent(target)}&limit=${count}`);
        const data = await res.json().catch(() => null);
        if (!data?.success) throw new Error(data?.error || `The lookup failed (HTTP ${res.status}).`);
        const result = data.result as BestsellersResult;
        setState({ kind: "done", url: target, result });
        onDetected(result.platform);
      } catch (err) {
        setState({ kind: "error", url: target, message: err instanceof Error ? err.message : "The lookup failed." });
      }
    },
    [limit, onDetected]
  );

  useAutoRun(active, url, runId, load);

  if (state.kind === "idle") {
    return (
      <EmptyState
        icon={<TrendingUp className="h-7 w-7 text-text-faint" strokeWidth={1.5} />}
        title="See what a store sells most"
        description="Works with WooCommerce and Shopify stores. You get the store's own best-seller order, with prices, stock and review counts."
      />
    );
  }

  if (state.kind === "loading") {
    return (
      <div className="label-sheet p-6 sm:p-8" aria-busy="true">
        <p className="text-text-muted">Reading the best-seller order of {host(state.url)}… this can take up to a minute on big Shopify stores.</p>
        <div className="mt-5 space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-14 animate-pulse rounded-md bg-surface-raised" />
          ))}
        </div>
      </div>
    );
  }

  if (state.kind === "error") {
    return (
      <Notice tone="error">
        Couldn&apos;t get best sellers for {host(state.url)}. {state.message}
      </Notice>
    );
  }

  const { result } = state;
  const { rows, rankedUntil } = result;
  const csvHref = `/api/bestsellers?url=${encodeURIComponent(state.url)}&limit=${limit}&format=csv`;
  const rankedCount = rankedUntil === null ? rows.length : rankedUntil;

  return (
    <section className="animate-stamp">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="font-display text-[1.9rem] text-ink sm:text-[2.4rem]">
            Top {rows.length.toLocaleString()}
            {result.totalProducts ? (
              <span className="text-text-faint"> of {result.totalProducts.toLocaleString()}</span>
            ) : null}
          </h2>
          <p className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-text-muted">
            <PlatformMark id={result.platform} name={host(state.url)} />
            <span>Ordered by {result.method}</span>
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-2 text-sm text-text-muted">
            Show
            <select
              value={limit}
              onChange={(e) => {
                const next = Number(e.target.value);
                setLimit(next);
                load(state.url, next);
              }}
              className="rounded-lg border-2 border-border-strong bg-surface px-2.5 py-2 text-sm font-semibold text-ink focus:border-ink"
            >
              {LIMITS.map((n) => (
                <option key={n} value={n}>
                  Top {n}
                </option>
              ))}
            </select>
          </label>
          <a
            href={csvHref}
            download
            className="inline-flex items-center gap-2 rounded-lg border-2 border-ink bg-surface px-4 py-2 text-sm font-semibold text-ink hover:bg-marker-soft"
          >
            <Download className="h-4 w-4" aria-hidden="true" />
            Download CSV
          </a>
        </div>
      </div>

      <Notice className="mt-5">
        Stores don&apos;t publish how many units each product sold. What you see is the store&apos;s own best-seller order
        {result.platform === "woocommerce" ? ", plus review counts — the closest public sign of real orders" : ""}.
        {rankedUntil !== null && rankedUntil > 0 && (
          <>
            {" "}
            <strong className="text-ink">The first {rankedCount} are truly ranked by sales.</strong>
          </>
        )}
      </Notice>

      {rankedUntil === 0 && (
        <Notice tone="wait" className="mt-3">
          This list follows plain ID or name order from the very first product, so the store shows no sales
          difference between them. It may have few or no orders yet.
        </Notice>
      )}

      <ol className="mt-6 overflow-hidden rounded-xl border-2 border-ink bg-surface">
        {rows.map((row) => (
          <RowItem
            key={`${row.rank}-${row.id}`}
            row={row}
            currency={result.currency}
            ranked={rankedUntil === null || row.rank <= rankedUntil}
            showDivider={rankedUntil !== null && rankedUntil > 0 && row.rank === rankedUntil + 1}
          />
        ))}
      </ol>
    </section>
  );
}

function RowItem({
  row,
  currency,
  ranked,
  showDivider,
}: {
  row: BestsellerRow;
  currency: string | null;
  ranked: boolean;
  showDivider: boolean;
}) {
  return (
    <>
      {showDivider && (
        <li className="border-y-2 border-ink bg-marker-soft px-4 py-3 text-sm text-warn sm:px-6">
          <strong className="text-ink">From #{row.rank} down, these products all sold the same amount — usually nothing.</strong>{" "}
          The store simply lists them by ID or name, so their order here doesn&apos;t mean anything.
        </li>
      )}
      <li
        className={cn(
          "grid grid-cols-[2.75rem_3.25rem_1fr] items-center gap-x-3 border-b border-border px-3 py-3 last:border-b-0 sm:grid-cols-[3.5rem_3.5rem_1fr_7.5rem_9rem] sm:px-5",
          !ranked && "bg-surface-hover"
        )}
      >
        <span className={cn("font-display text-right text-xl sm:text-2xl", ranked ? "text-ink" : "text-text-faint")}>
          <span className={cn(ranked && row.rank <= 3 && "marker")}>{row.rank}</span>
        </span>

        <span className="flex h-12 w-12 items-center justify-center overflow-hidden rounded-md border border-border bg-surface-raised sm:h-14 sm:w-14">
          {row.image ? (
            // Images come from arbitrary store domains, so a plain <img> avoids allow-listing hosts.
            // eslint-disable-next-line @next/next/no-img-element
            <img src={row.image} alt="" loading="lazy" className="h-full w-full object-cover" />
          ) : (
            <ImageOff className="h-4 w-4 text-text-faint" strokeWidth={1.5} />
          )}
        </span>

        <div className="min-w-0">
          <a
            href={row.url}
            target="_blank"
            rel="noreferrer"
            className={cn("line-clamp-2 font-semibold underline-offset-4 hover:underline", ranked ? "text-ink" : "text-text-muted")}
          >
            {row.name}
          </a>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-sm text-text-muted">
            {row.category && <span>{row.category}</span>}
            <span className="sm:hidden">{money(row.price, currency)}</span>
          </div>
        </div>

        <div className="hidden text-right sm:block">
          <div className="font-semibold text-ink">{money(row.price, currency)}</div>
          {row.compareAtPrice !== null && (
            <div className="text-sm text-text-faint line-through">{money(row.compareAtPrice, currency)}</div>
          )}
        </div>

        <div className="hidden flex-col items-end gap-1 sm:flex">
          {row.reviews !== null && row.reviews > 0 ? (
            <span className="inline-flex items-center gap-1 text-sm text-ink">
              <Star className="h-3.5 w-3.5 fill-current" aria-hidden="true" />
              {row.rating ? row.rating.toFixed(1) : ""}{" "}
              <span className="text-text-muted">
                ({row.reviews} {row.reviews === 1 ? "review" : "reviews"})
              </span>
            </span>
          ) : row.reviews === 0 ? (
            <span className="text-sm text-text-faint">No reviews</span>
          ) : null}
          {row.inStock === false && <Badge tone="danger">Out of stock</Badge>}
        </div>
      </li>
    </>
  );
}
