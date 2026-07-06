"use client";

import { useMemo, useState } from "react";
import { Download, FileJson, Info } from "lucide-react";
import type { ExportFormat, NormalizedProduct } from "@/lib/types";
import { buildJsonBackup, buildShopifyCsv, buildWooCommerceCsv, estimateRowCount } from "@/lib/csv-export";
import { cn, downloadTextFile } from "@/lib/utils";
import { Button } from "@/components/ui/Button";

const today = () => new Date().toISOString().slice(0, 10);

const FORMAT_NOTES: Record<ExportFormat, string> = {
  shopify:
    "Shopify has no native subcategory field. Each category level becomes a Tag, and the most specific category becomes the product Type — create Automated Collections in Shopify with a “Tag is equal to” condition to get browsable category pages back.",
  woocommerce:
    "Categories are written as “Parent > Child” in a single Categories column, exactly as WooCommerce's importer expects — missing parent categories are created automatically on import.",
};

export function ExportPanel({
  products,
  defaultFormat,
  sourcePlatform,
}: {
  products: NormalizedProduct[];
  defaultFormat: ExportFormat;
  sourcePlatform: "shopify" | "woocommerce";
}) {
  const [format, setFormat] = useState<ExportFormat>(defaultFormat);
  const disabled = products.length === 0;
  const rowCount = useMemo(() => estimateRowCount(products, format), [products, format]);
  const isMigration = format !== (sourcePlatform === "shopify" ? "shopify" : "woocommerce");

  function handleDownloadCsv() {
    const csv = format === "shopify" ? buildShopifyCsv(products) : buildWooCommerceCsv(products);
    downloadTextFile(`storebridge-${format}-export-${today()}.csv`, csv, "text/csv;charset=utf-8;");
  }

  function handleDownloadJson() {
    const json = buildJsonBackup(products);
    downloadTextFile(`storebridge-backup-${today()}.json`, json, "application/json;charset=utf-8;");
  }

  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-medium text-text">Export</h3>
          <p className="mt-0.5 text-xs text-text-muted">
            {products.length > 0
              ? `${products.length} product${products.length === 1 ? "" : "s"} ready · ${rowCount} CSV row${rowCount === 1 ? "" : "s"} in this format`
              : "Fetch products above to enable export."}
          </p>
        </div>

        <div className="inline-flex rounded-lg border border-border-strong bg-surface-raised p-1">
          <FormatToggleButton active={format === "shopify"} onClick={() => setFormat("shopify")}>
            Shopify CSV
          </FormatToggleButton>
          <FormatToggleButton active={format === "woocommerce"} onClick={() => setFormat("woocommerce")}>
            WooCommerce CSV
          </FormatToggleButton>
        </div>
      </div>

      <div className="mt-3 flex gap-2 rounded-lg border border-border bg-bg/40 p-3 text-xs text-text-muted">
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-text-faint" />
        <p>
          {isMigration && <span className="font-medium text-text">Migrating platforms — </span>}
          {FORMAT_NOTES[format]}
        </p>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <Button
          variant="primary"
          accent={sourcePlatform === "shopify" ? "shopify" : "woo"}
          icon={<Download className="h-4 w-4" />}
          disabled={disabled}
          onClick={handleDownloadCsv}
        >
          Download {format === "shopify" ? "Shopify" : "WooCommerce"} CSV
        </Button>
        <Button variant="secondary" icon={<FileJson className="h-4 w-4" />} disabled={disabled} onClick={handleDownloadJson}>
          Download raw JSON backup
        </Button>
      </div>
    </div>
  );
}

function FormatToggleButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
        active ? "bg-surface text-text shadow-sm" : "text-text-muted hover:text-text"
      )}
    >
      {children}
    </button>
  );
}
