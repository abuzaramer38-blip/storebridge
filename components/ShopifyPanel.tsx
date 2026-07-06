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

export function ShopifyPanel() {
  const [storeUrl, setStoreUrl] = useState("");

  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);
  const [products, setProducts] = useState<NormalizedProduct[]>([]);
  const [fetchedCount, setFetchedCount] = useState(0);

  const canSubmit = storeUrl.trim().length > 0;

  const handleFetch = useCallback(async () => {
    setStatus("loading");
    setError(null);
    setProducts([]);
    setFetchedCount(0);

    const normalizedUrl = normalizeUrl(storeUrl);
    let page: number | null = 1;
    let collected: NormalizedProduct[] = [];

    try {
      while (true) {
        const response: Response = await fetch("/api/shopify/products", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ storeUrl: normalizedUrl, page }),
        });

        const data = await response.json();
        if (!data.success) {
          throw new Error(data.error || "Something went wrong while fetching from Shopify.");
        }

        collected = collected.concat(data.products);
        setProducts([...collected]);
        setFetchedCount(collected.length);

        page = data.pageInfo.hasNextPage ? data.pageInfo.nextPage : null;
        if (!page) break;
      }

      setStatus("success");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error.");
      setStatus("error");
    }
  }, [storeUrl]);

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-border bg-surface p-5">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-shopify-soft text-shopify">
            <PlugZap className="h-4 w-4" />
          </div>
          <div>
            <h2 className="text-sm font-medium text-text">Paste your Shopify store link</h2>
            <p className="text-xs text-text-muted">Reads the store&apos;s public catalog — no login or keys needed.</p>
          </div>
        </div>

        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="flex-1">
            <Field label="Store URL" hint="e.g. my-store.com or my-store.myshopify.com">
              <Input
                value={storeUrl}
                onChange={(e) => setStoreUrl(e.target.value)}
                placeholder="my-store.myshopify.com"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && canSubmit && status !== "loading") handleFetch();
                }}
              />
            </Field>
          </div>
          <Button
            variant="primary"
            accent="shopify"
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
            Public catalog data only: title, description, images, price, and in‑stock/out‑of‑stock all come through
            accurately. Shopify doesn&apos;t expose real Collections or exact stock counts on this public endpoint —
            each product&apos;s Type is used as a single category instead. Exact quantities and true subcategories
            need the authenticated Admin API.
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
          <ProgressBar value={15} accent="shopify" />
          <p className="text-xs text-text-muted">Fetched {fetchedCount} products…</p>
        </div>
      )}

      {products.length > 0 && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard label="Products" value={products.length} accent="shopify" />
          <StatCard label="Variants" value={products.reduce((sum, p) => sum + p.variants.length, 0)} accent="shopify" />
          <StatCard
            label="Product types"
            value={new Set(products.flatMap((p) => p.categories.map((c) => c.levels.join(">")))).size}
            accent="shopify"
          />
          <StatCard label="Images" value={products.reduce((sum, p) => sum + p.images.length, 0)} accent="shopify" />
        </div>
      )}

      <ProductTable products={products} accent="shopify" />

      <ExportPanel products={products} defaultFormat="shopify" sourcePlatform="shopify" />
    </div>
  );
}
