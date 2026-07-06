"use client";

import { useCallback, useState } from "react";
import { Info, Link2, PlugZap } from "lucide-react";
import type { NormalizedProduct } from "@/lib/types";
import { normalizeUrl } from "@/lib/utils";
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

  const handleFetch = useCallback(async () => {
    setStatus("loading");
    setError(null);
    setProducts([]);
    setFetchedCount(0);
    setTotalCount(null);

    const normalizedUrl = normalizeUrl(siteUrl);
    let page: number | null = 1;
    let collected: NormalizedProduct[] = [];

    try {
      while (true) {
        const response: Response = await fetch("/api/woocommerce/products", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ siteUrl: normalizedUrl, page }),
        });

        const data = await response.json();
        if (!data.success) {
          throw new Error(data.error || "Something went wrong while fetching from WooCommerce.");
        }

        collected = collected.concat(data.products);
        setProducts([...collected]);
        setFetchedCount(collected.length);
        if (typeof data.pageInfo.totalCount === "number") setTotalCount(data.pageInfo.totalCount);

        page = data.pageInfo.hasNextPage ? data.pageInfo.nextPage : null;
        if (!page) break;
      }

      setStatus("success");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error.");
      setStatus("error");
    }
  }, [siteUrl]);

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
