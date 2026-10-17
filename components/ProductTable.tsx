"use client";

import { useMemo, useState } from "react";
import { Search, ImageOff } from "lucide-react";
import type { NormalizedProduct } from "@/lib/types";
import { formatMoney } from "@/lib/utils";
import { Badge } from "@/components/ui/Badge";
import { Input } from "@/components/ui/Input";
import { EmptyState } from "@/components/ui/Feedback";

type Accent = "shopify" | "woo";

function priceLabel(product: NormalizedProduct): string {
  const prices = product.variants.map((v) => v.price).filter((p): p is number => p !== null);
  if (prices.length === 0) return "—";
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  return min === max ? formatMoney(min) : `${formatMoney(min)} – ${formatMoney(max)}`;
}

function stockSummary(product: NormalizedProduct): { label: string; tone: "success" | "warning" | "danger" } {
  if (product.totalInventory !== null) {
    if (product.totalInventory <= 0) return { label: "Out of stock", tone: "danger" };
    return { label: `${product.totalInventory} in stock`, tone: "success" };
  }
  const anyInStock = product.variants.some((v) => v.inStock);
  return anyInStock ? { label: "In stock", tone: "success" } : { label: "Out of stock", tone: "danger" };
}

export function ProductTable({ products, accent }: { products: NormalizedProduct[]; accent: Accent }) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    if (!query.trim()) return products;
    const q = query.toLowerCase();
    return products.filter(
      (p) => p.title.toLowerCase().includes(q) || p.variants.some((v) => v.sku?.toLowerCase().includes(q))
    );
  }, [products, query]);

  if (products.length === 0) {
    return (
      <EmptyState
        icon={<ImageOff className="h-8 w-8 text-text-faint" strokeWidth={1.5} />}
        title="No products yet"
        description="Connect a store above and fetch products to see them here."
      />
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border-2 border-ink bg-surface">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b-2 border-ink px-4 py-3">
        <div className="relative w-full sm:w-72">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-text-faint" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter by title or SKU"
            className="pl-8"
          />
        </div>
        <span className="text-sm text-text-muted">
          {filtered.length === products.length
            ? `${products.length} product${products.length === 1 ? "" : "s"}`
            : `${filtered.length} of ${products.length}`}
        </span>
      </div>

      <div className="max-h-[560px] overflow-auto">
        <table className="w-full min-w-[720px] border-collapse text-left text-sm">
          <thead className="sticky top-0 z-10 bg-surface">
            <tr className="border-b border-border text-sm text-text-muted">
              <th className="px-4 py-2.5 font-medium">Product</th>
              <th className="px-4 py-2.5 font-medium">Categories</th>
              <th className="px-4 py-2.5 font-medium">Price</th>
              <th className="px-4 py-2.5 font-medium">Stock</th>
              <th className="px-4 py-2.5 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((product) => {
              const stock = stockSummary(product);
              const visibleCategories = product.categories.slice(0, 2);
              const extraCategories = product.categories.length - visibleCategories.length;

              return (
                <tr
                  key={product.id}
                  className="border-b border-border last:border-0 hover:bg-surface-hover"
                >
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-md border border-border bg-surface-raised">
                        {product.images[0] ? (
                          // Product images come from arbitrary external store domains,
                          // so a plain <img> is used instead of next/image (which
                          // requires allow-listing every remote host up front).
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={product.images[0].src} alt="" className="h-full w-full object-cover" />
                        ) : (
                          <ImageOff className="h-4 w-4 text-text-faint" strokeWidth={1.5} />
                        )}
                      </div>
                      <div className="min-w-0">
                        <div className="max-w-[28rem] truncate font-semibold text-ink">{product.title}</div>
                        <div className="truncate text-xs text-text-faint">
                          {product.variants[0]?.sku || product.handle || "—"}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="flex max-w-[220px] flex-wrap gap-1">
                      {product.categories.length === 0 ? (
                        <span className="text-text-faint">—</span>
                      ) : (
                        <>
                          {visibleCategories.map((cat, i) => (
                            <Badge key={i} tone={accent}>
                              {cat.levels.join(" › ")}
                            </Badge>
                          ))}
                          {extraCategories > 0 && <Badge tone="neutral">+{extraCategories}</Badge>}
                        </>
                      )}
                    </div>
                  </td>
                  <td className="whitespace-nowrap px-4 py-2.5 font-semibold text-ink">{priceLabel(product)}</td>
                  <td className="px-4 py-2.5">
                    <Badge tone={stock.tone}>{stock.label}</Badge>
                  </td>
                  <td className="px-4 py-2.5 capitalize text-text-muted">{product.status}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
