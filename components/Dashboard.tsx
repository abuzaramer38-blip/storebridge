"use client";

import { useState, type ReactNode } from "react";
import { GitCompareArrows, ShoppingBag, ShoppingCart } from "lucide-react";
import { cn } from "@/lib/utils";
import { ShopifyPanel } from "@/components/ShopifyPanel";
import { WooCommercePanel } from "@/components/WooCommercePanel";

type Tab = "shopify" | "woocommerce";

export function Dashboard() {
  const [tab, setTab] = useState<Tab>("shopify");

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
      <header className="mb-8 flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-border-strong bg-surface">
          <GitCompareArrows className="h-5 w-5 text-text" strokeWidth={1.75} />
        </div>
        <div>
          <h1 className="text-lg font-semibold tracking-tight text-text">StoreBridge</h1>
          <p className="text-xs text-text-muted">Personal backup &amp; migration utility for your own stores</p>
        </div>
      </header>

      <div className="mb-6 flex gap-2 border-b border-border" role="tablist">
        <TabButton
          active={tab === "shopify"}
          onClick={() => setTab("shopify")}
          accent="shopify"
          icon={<ShoppingBag className="h-4 w-4" />}
        >
          Shopify Backup
        </TabButton>
        <TabButton
          active={tab === "woocommerce"}
          onClick={() => setTab("woocommerce")}
          accent="woo"
          icon={<ShoppingCart className="h-4 w-4" />}
        >
          WordPress Backup
        </TabButton>
      </div>

      {tab === "shopify" ? <ShopifyPanel /> : <WooCommercePanel />}
    </div>
  );
}

function TabButton({
  active,
  onClick,
  icon,
  accent,
  children,
}: {
  active: boolean;
  onClick: () => void;
  icon: ReactNode;
  accent: "shopify" | "woo";
  children: ReactNode;
}) {
  const accentClass = accent === "shopify" ? "text-shopify border-shopify" : "text-woo border-woo";

  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={cn(
        "-mb-px flex items-center gap-2 border-b-2 px-4 py-3 text-sm font-medium transition-colors",
        active ? accentClass : "border-transparent text-text-muted hover:text-text"
      )}
    >
      {icon}
      {children}
    </button>
  );
}
