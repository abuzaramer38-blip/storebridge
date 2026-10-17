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
    <div className="label-sheet p-5 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="font-wide text-lg font-bold text-ink">Export</h3>
          <p className="mt-0.5 text-sm text-text-muted">
            {products.length > 0
              ? `${products.length.toLocaleString()} product${products.length === 1 ? "" : "s"} ready, ${rowCount.toLocaleString()} CSV row${rowCount === 1 ? "" : "s"} in this format`
              : "Fetch products above to enable export."}
          </p>
        </div>

        <div className="inline-flex rounded-lg border-2 border-ink bg-surface p-1">
          <FormatToggleButton active={format === "shopify"} onClick={() => setFormat("shopify")}>
            Shopify CSV
          </FormatToggleButton>
          <FormatToggleButton active={format === "woocommerce"} onClick={() => setFormat("woocommerce")}>
            WooCommerce CSV
          </FormatToggleButton>
        </div>
      </div>

      <div className="mt-4 flex gap-2 rounded-lg border border-border bg-surface-hover p-3 text-sm text-text-muted">
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-text-faint" />
        <p>
          {isMigration && <span className="font-semibold text-ink">Switching platforms. </span>}
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
        "rounded-md px-3 py-1.5 text-sm font-semibold transition-colors",
        active ? "bg-ink text-white" : "text-text-muted hover:text-ink"
      )}
    >
      {children}
    </button>
  );
}
