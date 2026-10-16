"use client";

import { useCallback, useState } from "react";
import { Info, Link2, PlugZap } from "lucide-react";
import type { NormalizedProduct } from "@/lib/types";
import { normalizeUrl, sleep } from "@/lib/utils";
import { Button } from "@/components/ui/Button";
import { Field, Input } from "@/components/ui/Input";
import { ProgressBar, StatCard } from "@/components/ui/Feedback";
import { ProductTable } from "@/components/ProductTable";
import { ExportPanel } from "@/components/ExportPanel";

type Status = "idle" | "loading" | "success" | "error";

export function WooCommercePanel() {
  const [siteUrl, setSiteUrl] = useState("");

  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);
  const [products, setProducts] = useState<NormalizedProduct[]>([]);
  const [fetchedCount, setFetchedCount] = useState(0);
  const [totalCount, setTotalCount] = useState<number | null>(null);

  const canSubmit = siteUrl.trim().length > 0;

  // Where to pick up again if a long run stops part-way (products so far are kept).
  const [resumeFrom, setResumeFrom] = useState<{ page: number; products: NormalizedProduct[] } | null>(null);

  const runFetch = useCallback(
    async (startPage: number, startProducts: NormalizedProduct[]) => {
      setStatus("loading");
      setError(null);
      setResumeFrom(null);
      setProducts(startProducts);
      setFetchedCount(startProducts.length);
      if (startProducts.length === 0) setTotalCount(null);

      const normalizedUrl = normalizeUrl(siteUrl);
      let page: number | null = startPage;
      let collected: NormalizedProduct[] = startProducts;
      let rateLimitRetries = 0;
      const MAX_RATE_LIMIT_RETRIES = 20;
      // Starts fast; slows down automatically if the store pushes back, speeds up again after.
      let pageDelayMs = 300;

      try {
        while (true) {
          let response: Response | null = null;
          try {
            response = await fetch("/api/woocommerce/products", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ siteUrl: normalizedUrl, page }),
            });
          } catch {
            response = null; // our own connection dropped — retry below
          }

          let data: {
            success: boolean;
            rateLimited?: boolean;
            retryAfterMs?: number;
            error?: string;
            products?: NormalizedProduct[];
            pageInfo?: { hasNextPage: boolean; nextPage: number | null; totalCount: number | null };
          };
          if (!response) {
            data = { success: false, rateLimited: true, error: "Network error" };
          } else {
            try {
              data = await response.json();
            } catch {
              // Non-JSON reply (e.g. Vercel 504 timeout page) — treat gateway/limit errors as retryable.
              data = {
                success: false,
                rateLimited: [429, 502, 503, 504].includes(response.status),
                error: `HTTP ${response.status}`,
              };
            }
          }

          // On the very first page with nothing fetched yet, fail fast (likely a wrong URL).
          const retryCap = collected.length === 0 ? 2 : MAX_RATE_LIMIT_RETRIES;
          if (!data.success && data.rateLimited && rateLimitRetries < retryCap) {
            rateLimitRetries += 1;
            pageDelayMs = Math.min(pageDelayMs * 2 + 1000, 8000);
            const wait = Math.min(Math.max(Number(data.retryAfterMs) || 0, 4000 * rateLimitRetries), 60_000);
            setError(
              `Store is slowing us down — waiting ${Math.round(wait / 1000)}s, then retrying page ${page} (try ${rateLimitRetries}/${retryCap})…`
            );
            await sleep(wait);
            continue; // same page again
          }
          if (!data.success) {
            throw new Error(data.error || "Something went wrong while fetching from WooCommerce.");
          }

          collected = collected.concat(data.products ?? []);
          setProducts([...collected]);
          setFetchedCount(collected.length);
          if (typeof data.pageInfo?.totalCount === "number") setTotalCount(data.pageInfo.totalCount);

          rateLimitRetries = 0;
          pageDelayMs = Math.max(300, Math.floor(pageDelayMs * 0.7));
          setError(null);
          page = data.pageInfo?.hasNextPage ? data.pageInfo.nextPage : null;
          if (!page) break;
          await sleep(pageDelayMs);
        }

        setStatus("success");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unknown error.");
        setStatus("error");
        if (page && collected.length > 0) setResumeFrom({ page, products: collected });
      }
    },
    [siteUrl]
  );

  const handleFetch = useCallback(() => runFetch(1, []), [runFetch]);
  const handleResume = useCallback(() => {
    if (resumeFrom) runFetch(resumeFrom.page, resumeFrom.products);
  }, [resumeFrom, runFetch]);

  const progress =
    totalCount && totalCount > 0 ? Math.min(100, (fetchedCount / totalCount) * 100) : status === "loading" ? 15 : 0;

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-border bg-surface p-5">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-woo-soft text-woo">
            <PlugZap className="h-4 w-4" />
          </div>
          <div>
            <h2 className="text-sm font-medium text-text">Paste your WordPress store link</h2>
            <p className="text-xs text-text-muted">Reads WooCommerce&apos;s public Store API — no keys needed.</p>
          </div>
        </div>

        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="flex-1">
            <Field label="Site URL" hint="e.g. my-store.com">
              <Input
                value={siteUrl}
                onChange={(e) => setSiteUrl(e.target.value)}
                placeholder="my-store.com"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && canSubmit && status !== "loading") handleFetch();
                }}
              />
            </Field>
          </div>
          <Button
            variant="primary"
            accent="woo"
            icon={<Link2 className="h-4 w-4" />}
            loading={status === "loading"}
            disabled={!canSubmit || status === "loading"}
            onClick={handleFetch}
          >
            {status === "loading" ? "Fetching…" : "Fetch products"}
          </Button>
        </div>

        <div className="mt-3 flex gap-2 rounded-lg border border-border bg-bg/40 p-3 text-xs text-text-muted">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-text-faint" />
          <p>
            Public catalog data: title, description, images, price, full category/subcategory hierarchy, and
            in‑stock/out‑of‑stock all come through accurately. Exact stock quantities aren&apos;t exposed publicly,
            so that column will mostly be blank unless a product is near its low‑stock threshold.
          </p>
        </div>

        {status === "error" && error && (
          <div className="mt-3 rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-xs text-red-400">
            {error}
            {resumeFrom && (
              <div className="mt-2 flex flex-wrap items-center gap-2 text-text-muted">
                <span>
                  {resumeFrom.products.length} products are kept. You can export them now, or continue from page{" "}
                  {resumeFrom.page}.
                </span>
                <Button variant="primary" accent="woo" onClick={handleResume}>
                  Resume from page {resumeFrom.page}
                </Button>
              </div>
            )}
          </div>
        )}
      </div>

      {status === "loading" && (
        <div className="space-y-2">
          <ProgressBar value={progress} accent="woo" />
          <p className="text-xs text-text-muted">
            Fetched {fetchedCount}
            {totalCount ? ` of ${totalCount}` : ""} products…
          </p>
          {error && <p className="text-xs text-amber-400">{error}</p>}
        </div>
      )}

      {products.length > 0 && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard label="Products" value={products.length} accent="woo" />
          <StatCard label="Variants" value={products.reduce((sum, p) => sum + p.variants.length, 0)} accent="woo" />
          <StatCard
            label="Categories"
            value={new Set(products.flatMap((p) => p.categories.map((c) => c.levels.join(">")))).size}
            accent="woo"
          />
          <StatCard label="Images" value={products.reduce((sum, p) => sum + p.images.length, 0)} accent="woo" />
        </div>
      )}

      <ProductTable products={products} accent="woo" />

      <ExportPanel products={products} defaultFormat="woocommerce" sourcePlatform="woocommerce" />
    </div>
  );
}
