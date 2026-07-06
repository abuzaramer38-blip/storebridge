import Papa from "papaparse";
import type { NormalizedProduct } from "./types";
import { slugify } from "./utils";

/**
 * Core Shopify product CSV columns. This is a working subset of Shopify's
 * full ~65-column template (https://help.shopify.com/en/manual/products/import-export/using-csv) —
 * everything needed to recreate title, description, images, price,
 * inventory, and variants. Optional columns Shopify also supports
 * (SEO title/description, Google Shopping fields, regional pricing) can be
 * appended to this array if you need them.
 */
export const SHOPIFY_COLUMNS = [
  "Handle",
  "Title",
  "Body (HTML)",
  "Vendor",
  "Type",
  "Tags",
  "Published",
  "Option1 Name",
  "Option1 Value",
  "Option2 Name",
  "Option2 Value",
  "Option3 Name",
  "Option3 Value",
  "Variant SKU",
  "Variant Inventory Tracker",
  "Variant Inventory Qty",
  "Variant Inventory Policy",
  "Variant Fulfillment Service",
  "Variant Price",
  "Variant Compare At Price",
  "Variant Requires Shipping",
  "Variant Taxable",
  "Image Src",
  "Image Position",
  "Image Alt Text",
  "Status",
] as const;

/**
 * Core WooCommerce product CSV columns, matching the official schema at
 * https://github.com/woocommerce/woocommerce/wiki/Product-CSV-Import-Schema
 */
export const WOOCOMMERCE_COLUMNS = [
  "Type",
  "SKU",
  "Name",
  "Published",
  "Short description",
  "Description",
  "In stock?",
  "Stock",
  "Regular price",
  "Categories",
  "Tags",
  "Images",
] as const;

type Row = Record<string, string>;

function emptyRow(columns: readonly string[]): Row {
  const row: Row = {};
  for (const c of columns) row[c] = "";
  return row;
}

function primaryCategoryLeaf(product: NormalizedProduct): string | null {
  const first = product.categories.find((c) => c.levels.length > 0);
  return first ? first.levels[first.levels.length - 1] : null;
}

function allCategoryLevels(product: NormalizedProduct): string[] {
  const set = new Set<string>();
  for (const cat of product.categories) {
    for (const level of cat.levels) set.add(level);
  }
  return Array.from(set);
}

/**
 * Shopify has no native subcategory concept — a product belongs to flat
 * Collections, and "Type" is a single free-text field. So a hierarchy like
 * WooCommerce's "Furniture > Chairs" is mapped two ways: the leaf name
 * ("Chairs") becomes Type, and every level ("Furniture" and "Chairs") is
 * added as a Tag. After import you can create Shopify Automated
 * Collections with a "Tag is equal to" condition to get browsable
 * category pages back — Shopify just can't nest them the way WooCommerce does.
 */
function buildShopifyTags(product: NormalizedProduct): string {
  const combined = new Set<string>([...product.tags, ...allCategoryLevels(product)]);
  return Array.from(combined).join(", ");
}

export function toShopifyRows(products: NormalizedProduct[]): Row[] {
  const rows: Row[] = [];

  for (const product of products) {
    const handle = slugify(product.handle || product.title);
    const variants = product.variants.length > 0 ? product.variants : [];
    const images = product.images;
    const rowCount = Math.max(variants.length, images.length, 1);
    const hasRealOptions = product.variants.some((v) => v.option1Name);

    for (let i = 0; i < rowCount; i += 1) {
      const row = emptyRow(SHOPIFY_COLUMNS);
      row["Handle"] = handle;

      if (i === 0) {
        row["Title"] = product.title;
        row["Body (HTML)"] = product.descriptionHtml;
        row["Vendor"] = product.vendor ?? "";
        row["Type"] = primaryCategoryLeaf(product) ?? product.productType ?? "";
        row["Tags"] = buildShopifyTags(product);
        row["Published"] = product.status === "archived" ? "FALSE" : "TRUE";
        row["Status"] = (["active", "draft", "archived"] as string[]).includes(product.status)
          ? product.status
          : "active";
      }

      const variant = variants[i];
      if (variant) {
        if (hasRealOptions) {
          if (variant.option1Name) {
            row["Option1 Name"] = variant.option1Name;
            row["Option1 Value"] = variant.option1Value ?? "";
          }
          if (variant.option2Name) {
            row["Option2 Name"] = variant.option2Name;
            row["Option2 Value"] = variant.option2Value ?? "";
          }
          if (variant.option3Name) {
            row["Option3 Name"] = variant.option3Name;
            row["Option3 Value"] = variant.option3Value ?? "";
          }
        } else {
          row["Option1 Name"] = "Title";
          row["Option1 Value"] = "Default Title";
        }
        row["Variant SKU"] = variant.sku ?? "";
        row["Variant Inventory Tracker"] = "shopify";
        row["Variant Inventory Qty"] = variant.inventoryQuantity !== null ? String(variant.inventoryQuantity) : "0";
        row["Variant Inventory Policy"] = "deny";
        row["Variant Fulfillment Service"] = "manual";
        row["Variant Price"] = variant.price !== null ? variant.price.toFixed(2) : "0.00";
        if (variant.compareAtPrice !== null) {
          row["Variant Compare At Price"] = variant.compareAtPrice.toFixed(2);
        }
        row["Variant Requires Shipping"] = "TRUE";
        row["Variant Taxable"] = "TRUE";
      }

      const image = images[i];
      if (image) {
        row["Image Src"] = image.src;
        row["Image Position"] = String(i + 1);
        if (image.alt) row["Image Alt Text"] = image.alt;
      }

      rows.push(row);
    }
  }

  return rows;
}

/**
 * WooCommerce's importer treats a comma inside the Categories/Tags cell as
 * a separator between multiple values, so a literal comma inside a
 * category name has to be backslash-escaped or it gets split in two.
 * See https://woocommerce.com/document/product-csv-importer-exporter/
 */
function buildWooCategoriesField(product: NormalizedProduct): string {
  return product.categories
    .filter((c) => c.levels.length > 0)
    .map((c) => c.levels.join(" > ").replace(/,/g, "\\,"))
    .join(", ");
}

export function toWooCommerceRows(products: NormalizedProduct[]): Row[] {
  return products.map((product) => {
    const row = emptyRow(WOOCOMMERCE_COLUMNS);
    const primary: NormalizedProduct["variants"][number] | undefined = product.variants[0];

    row["Type"] = "simple";
    row["SKU"] = primary?.sku ?? "";
    row["Name"] = product.title;
    row["Published"] = product.status === "draft" ? "0" : "1";
    row["Short description"] = product.shortDescription ?? "";
    row["Description"] = product.descriptionHtml;
    row["In stock?"] = primary?.inStock ? "1" : "0";
    row["Stock"] =
      primary?.inventoryQuantity !== null && primary?.inventoryQuantity !== undefined
        ? String(primary.inventoryQuantity)
        : "";
    row["Regular price"] = primary?.price !== null && primary?.price !== undefined ? String(primary.price) : "";
    row["Categories"] = buildWooCategoriesField(product);
    row["Tags"] = product.tags.join(", ");
    row["Images"] = product.images.map((img) => img.src).join(", ");

    return row;
  });
}

function generateCsv(rows: Row[], columns: readonly string[]): string {
  const data = rows.map((row) => columns.map((col) => row[col] ?? ""));
  return Papa.unparse({ fields: columns as unknown as string[], data });
}

export function buildShopifyCsv(products: NormalizedProduct[]): string {
  return generateCsv(toShopifyRows(products), SHOPIFY_COLUMNS);
}

export function buildWooCommerceCsv(products: NormalizedProduct[]): string {
  return generateCsv(toWooCommerceRows(products), WOOCOMMERCE_COLUMNS);
}

export function buildJsonBackup(products: NormalizedProduct[]): string {
  return JSON.stringify(
    { exportedAt: new Date().toISOString(), count: products.length, products },
    null,
    2
  );
}

/** Rough count of CSV data rows a given export will produce (Shopify expands variants/images into extra rows). */
export function estimateRowCount(products: NormalizedProduct[], format: "shopify" | "woocommerce"): number {
  return format === "shopify" ? toShopifyRows(products).length : products.length;
}
