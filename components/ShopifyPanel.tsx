"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { NormalizedProduct } from "@/lib/types";
import { normalizeUrl } from "@/lib/utils";
import { Notice, ProgressBar, StatCard } from "@/components/ui/Feedback";
import { ProductTable } from "@/components/ProductTable";
import { ExportPanel } from "@/components/ExportPanel";

type Status = "idle" | "loading" | "success" | "error";

export function ShopifyPanel({ storeUrl, trigger }: { storeUrl: string; trigger: number }) {
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);
  const [products, setProducts] = useState<NormalizedProduct[]>([]);
  const [fetchedCount, setFetchedCount] = useState(0);

  const handleFetch = useCallback(async () => {
    setStatus("loading");
    setError(null);
    setProducts([]);
    setFetchedCount(0);

    const normalizedUrl = normalizeUrl(storeUrl);
    let page: number | null = 1;
    let collected: NormalizedProduct[] = [];

    try {
      while (page) {
        const response: Response = await fetch("/api/shopify/products", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ storeUrl: normalizedUrl, page }),
        });
        const data = await response.json().catch(() => null);
        if (!data?.success) {
          throw new Error(data?.error || `The store stopped responding (HTTP ${response.status}).`);
        }
        collected = collected.concat(data.products);
        setProducts([...collected]);
        setFetchedCount(collected.length);
        page = data.pageInfo.hasNextPage ? data.pageInfo.nextPage : null;
      }
      setStatus("success");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error.");
      setStatus("error");
    }
  }, [storeUrl]);

  const lastTrigger = useRef(0);
  useEffect(() => {
    if (trigger === 0 || trigger === lastTrigger.current) return;
    lastTrigger.current = trigger;
    handleFetch();
  }, [trigger, handleFetch]);

  return (
    <div className="space-y-6">

      {status === "loading" && (
        <div className="space-y-2">
          <ProgressBar value={8} />
          <p className="text-sm text-text-muted">{fetchedCount.toLocaleString()} products fetched</p>
        </div>
      )}

      {status === "error" && error && <Notice tone="error">{error}</Notice>}

      {products.length > 0 && (
        <div className="grid grid-cols-2 gap-5 sm:grid-cols-4">
          <StatCard label="Products" value={products.length} />
          <StatCard label="Variants" value={products.reduce((sum, p) => sum + p.variants.length, 0)} />
          <StatCard
            label="Product types"
            value={new Set(products.flatMap((p) => p.categories.map((c) => c.levels.join(">")))).size}
          />
          <StatCard label="Images" value={products.reduce((sum, p) => sum + p.images.length, 0)} />
        </div>
      )}

      {products.length > 0 && <ProductTable products={products} accent="shopify" />}

      {products.length > 0 && <ExportPanel products={products} defaultFormat="shopify" sourcePlatform="shopify" />}
    </div>
  );
}
