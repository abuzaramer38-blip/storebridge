"use client";

import { useCallback, useState } from "react";
import { PackageOpen } from "lucide-react";
import { cn } from "@/lib/utils";
import { EmptyState, Notice } from "@/components/ui/Feedback";
import { Button } from "@/components/ui/Button";
import { ShopifyPanel } from "@/components/ShopifyPanel";
import { WooCommercePanel } from "@/components/WooCommercePanel";
import type { DetectedPlatform } from "@/components/Dashboard";
import { useRunOnSubmit } from "@/components/useAutoRun";

type Platform = "woocommerce" | "shopify";
type Trigger = { n: number; platform: Platform; url: string };

const host = (url: string) => url.replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/$/, "");

export function ProductsPanel({
  url,
  runId,
  active,
  detected,
}: {
  url: string | null;
  runId: number;
  active: boolean;
  detected: DetectedPlatform;
}) {
  const [choice, setChoice] = useState<{ url: string; platform: Platform } | null>(null);
  const [trigger, setTrigger] = useState<Trigger | null>(null);
  const [checking, setChecking] = useState(false);

  const platform: Platform = (url && choice?.url === url ? choice.platform : null) ?? detected ?? "woocommerce";

  const fire = useCallback((target: string, p: Platform) => {
    setChoice({ url: target, platform: p });
    setTrigger((prev) => ({ n: (prev?.n ?? 0) + 1, platform: p, url: target }));
  }, []);

  // A submission made while this tab is open starts the fetch; work out the platform first if needed.
  const start = useCallback(
    async (target: string) => {
      let p: Platform = (choice?.url === target ? choice.platform : null) ?? detected ?? "woocommerce";
      if (!detected && choice?.url !== target) {
        setChecking(true);
        try {
          const res = await fetch(`/api/inspect?url=${encodeURIComponent(target)}`);
          const data = await res.json();
          const id = data?.result?.platform?.id;
          if (id === "shopify" || id === "woocommerce") p = id;
        } catch {
          // keep the default; the person can switch platforms by hand
        } finally {
          setChecking(false);
        }
      }
      fire(target, p);
    },
    [choice, detected, fire]
  );

  useRunOnSubmit(active, url, runId, start);

  if (!url) {
    return (
      <EmptyState
        icon={<PackageOpen className="h-7 w-7 text-text-faint" strokeWidth={1.5} />}
        title="Copy a full catalog"
        description="Paste a store link above and press Fetch products. You'll get every product with images, prices and categories, ready to export as a Shopify or WooCommerce CSV."
      />
    );
  }

  const live = trigger && trigger.url === url ? trigger : null;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <h2 className="font-display break-words text-[1.9rem] text-ink sm:text-[2.4rem]">{host(url)}</h2>
          <p className="mt-1.5 text-text-muted">
            {checking ? "Checking which platform this store uses…" : "Reads the store's public catalog. No login or API keys needed."}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div role="radiogroup" aria-label="Store platform" className="inline-flex rounded-lg border-2 border-ink bg-surface p-1">
            {(["woocommerce", "shopify"] as const).map((p) => (
              <button
                key={p}
                type="button"
                role="radio"
                aria-checked={platform === p}
                onClick={() => setChoice({ url, platform: p })}
                className={cn(
                  "rounded-md px-3.5 py-1.5 text-sm font-semibold transition-colors",
                  platform === p ? "bg-ink text-white" : "text-text-muted hover:text-ink"
                )}
              >
                {p === "woocommerce" ? "WooCommerce" : "Shopify"}
              </button>
            ))}
          </div>
          <Button variant="primary" onClick={() => fire(url, platform)} disabled={checking}>
            Fetch products
          </Button>
        </div>
      </div>

      {live ? (
        (["woocommerce", "shopify"] as const).map((p) => (
          <div key={`${p}-${url}`} hidden={p !== platform}>
            {p === "woocommerce" ? (
              <WooCommercePanel storeUrl={url} trigger={live.platform === p ? live.n : 0} />
            ) : (
              <ShopifyPanel storeUrl={url} trigger={live.platform === p ? live.n : 0} />
            )}
          </div>
        ))
      ) : (
        <Notice>
          {platform === "woocommerce"
            ? "Brings in titles, descriptions, images, prices, the full category tree and in-stock status. WooCommerce doesn't make exact stock counts public."
            : "Brings in titles, descriptions, images, prices and in-stock status. Shopify's public catalog has no collections or stock counts, so each product's type becomes its category."}
        </Notice>
      )}
    </div>
  );
}
