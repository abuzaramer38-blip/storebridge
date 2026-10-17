"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { NormalizedProduct } from "@/lib/types";
import { normalizeUrl, sleep } from "@/lib/utils";
import { canFetchDirectly, fetchWooCommerceProductsPage, WooCommerceRateLimitError } from "@/lib/woocommerce";
import { Button } from "@/components/ui/Button";
import { Notice, ProgressBar, StatCard } from "@/components/ui/Feedback";
import { ProductTable } from "@/components/ProductTable";
import { ExportPanel } from "@/components/ExportPanel";

type PageResult = {
  success: boolean;
  rateLimited?: boolean;
  retryAfterMs?: number;
  error?: string;
  products?: NormalizedProduct[];
  pageInfo?: { hasNextPage: boolean; nextPage: number | null; totalCount: number | null };
};

type Route = "browser" | "server";
type Status = "idle" | "loading" | "success" | "error";

/** Fetch one page straight from the browser (the person's own IP). */
async function getPageInBrowser(siteUrl: string, page: number): Promise<PageResult> {
  try {
    const r = await fetchWooCommerceProductsPage({ siteUrl }, page);
    return { success: true, products: r.products, pageInfo: r.pageInfo };
  } catch (err) {
    if (err instanceof WooCommerceRateLimitError) {
      return { success: false, rateLimited: true, retryAfterMs: err.retryAfterMs, error: err.message };
    }
    return { success: false, error: err instanceof Error ? err.message : "Unknown error." };
  }
}

/** Fetch one page through our API route (the server's IP). */
async function getPageViaServer(siteUrl: string, page: number): Promise<PageResult> {
  let response: Response;
  try {
    response = await fetch("/api/woocommerce/products", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ siteUrl, page }),
    });
  } catch {
    return { success: false, rateLimited: true, error: "Network error" };
  }
  try {
    return (await response.json()) as PageResult;
  } catch {
    // Non-JSON reply (e.g. a gateway timeout page) — treat gateway/limit errors as retryable.
    return {
      success: false,
      rateLimited: [429, 502, 503, 504].includes(response.status),
      error: `HTTP ${response.status}`,
    };
  }
}

export function WooCommercePanel({ storeUrl, trigger }: { storeUrl: string; trigger: number }) {
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);
  const [waitNote, setWaitNote] = useState<string | null>(null);
  const [products, setProducts] = useState<NormalizedProduct[]>([]);
  const [fetchedCount, setFetchedCount] = useState(0);
  const [totalCount, setTotalCount] = useState<number | null>(null);
  // Where to pick up again if a long run stops part-way (products so far are kept).
  const [resumeFrom, setResumeFrom] = useState<{ page: number; products: NormalizedProduct[] } | null>(null);

  const runFetch = useCallback(
    async (startPage: number, startProducts: NormalizedProduct[]) => {
      setStatus("loading");
      setError(null);
      setWaitNote(null);
      setResumeFrom(null);
      setProducts(startProducts);
      setFetchedCount(startProducts.length);
      if (startProducts.length === 0) setTotalCount(null);

      const normalizedUrl = normalizeUrl(storeUrl);
      let page: number | null = startPage;
      let collected: NormalizedProduct[] = startProducts;
      let retries = 0;
      const MAX_RETRIES = 30;
      // Starts fast; slows down if the store pushes back, speeds up again after.
      let pageDelayMs = 300;

      // Prefer the browser route (own IP); fall back to / alternate with the server route.
      const browserOk = await canFetchDirectly(normalizedUrl);
      let route: Route = browserOk ? "browser" : "server";

      try {
        while (true) {
          const data: PageResult =
            route === "browser"
              ? await getPageInBrowser(normalizedUrl, page as number)
              : await getPageViaServer(normalizedUrl, page as number);

          // On the very first page with nothing fetched yet, fail fast (likely a wrong link).
          const retryCap = collected.length === 0 ? 2 : MAX_RETRIES;
          if (!data.success && data.rateLimited && retries < retryCap) {
            retries += 1;
            if (browserOk) route = route === "browser" ? "server" : "browser";
            pageDelayMs = Math.min(pageDelayMs * 2 + 1000, 8000);
            const wait = Math.min(Math.max(Number(data.retryAfterMs) || 0, 4000 * retries), 60_000);
            setWaitNote(
              `The store is slowing requests down. Waiting ${Math.round(wait / 1000)} seconds, then trying page ${page} again (attempt ${retries} of ${retryCap}).`
            );
            await sleep(wait);
            continue;
          }
          if (!data.success && route === "browser" && retries < retryCap) {
            retries += 1;
            route = "server";
            continue;
          }
          if (!data.success) {
            throw new Error(data.error || "The store stopped responding.");
          }

          collected = collected.concat(data.products ?? []);
          setProducts([...collected]);
          setFetchedCount(collected.length);
          if (typeof data.pageInfo?.totalCount === "number") setTotalCount(data.pageInfo.totalCount);

          retries = 0;
          pageDelayMs = Math.max(300, Math.floor(pageDelayMs * 0.7));
          setWaitNote(null);
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
    [storeUrl]
  );

  const lastTrigger = useRef(0);
  useEffect(() => {
    if (trigger === 0 || trigger === lastTrigger.current) return;
    lastTrigger.current = trigger;
    runFetch(1, []);
  }, [trigger, runFetch]);

  const progress =
    totalCount && totalCount > 0 ? Math.min(100, (fetchedCount / totalCount) * 100) : status === "loading" ? 8 : 0;

  return (
    <div className="space-y-6">

      {status === "loading" && (
        <div className="space-y-2">
          <ProgressBar value={progress} />
          <p className="text-sm text-text-muted">
            {fetchedCount.toLocaleString()}
            {totalCount ? ` of ${totalCount.toLocaleString()}` : ""} products fetched
          </p>
          {waitNote && <Notice tone="wait">{waitNote}</Notice>}
        </div>
      )}

      {status === "error" && error && (
        <Notice tone="error">
          {error}
          {resumeFrom && (
            <div className="mt-3 flex flex-wrap items-center gap-3 text-text-muted">
              <span>
                {resumeFrom.products.length.toLocaleString()} products are kept — export them now, or carry on from page{" "}
                {resumeFrom.page}.
              </span>
              <Button variant="primary" onClick={() => runFetch(resumeFrom.page, resumeFrom.products)}>
                Resume from page {resumeFrom.page}
              </Button>
            </div>
          )}
        </Notice>
      )}

      {products.length > 0 && (
        <div className="grid grid-cols-2 gap-5 sm:grid-cols-4">
          <StatCard label="Products" value={products.length} />
          <StatCard label="Variants" value={products.reduce((sum, p) => sum + p.variants.length, 0)} />
          <StatCard
            label="Categories"
            value={new Set(products.flatMap((p) => p.categories.map((c) => c.levels.join(">")))).size}
          />
          <StatCard label="Images" value={products.reduce((sum, p) => sum + p.images.length, 0)} />
        </div>
      )}

      {products.length > 0 && <ProductTable products={products} accent="woo" />}

      {products.length > 0 && <ExportPanel products={products} defaultFormat="woocommerce" sourcePlatform="woocommerce" />}
    </div>
  );
}
