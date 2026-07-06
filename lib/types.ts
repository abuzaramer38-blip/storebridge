/**
 * Shared data model
 * ------------------
 * Both Shopify and WooCommerce products get converted into this single
 * "normalized" shape as soon as they're fetched. Every other part of the
 * app (the table, the CSV exporters, the JSON backup) only ever has to
 * know about this one shape, regardless of which platform the data came
 * from. This is also what makes cross-platform migration possible: you
 * can fetch from WooCommerce and export a Shopify-ready CSV, or the
 * reverse, because the export step doesn't care where the data started.
 */

export type Platform = "shopify" | "woocommerce";

export type ProductStatus = "active" | "draft" | "archived" | string;

export interface NormalizedImage {
  src: string;
  alt: string | null;
  position: number;
}

export interface NormalizedVariant {
  id: string;
  title: string;
  sku: string | null;
  price: number | null;
  compareAtPrice: number | null;
  inventoryQuantity: number | null;
  inStock: boolean;
  option1Name: string | null;
  option1Value: string | null;
  option2Name: string | null;
  option2Value: string | null;
  option3Name: string | null;
  option3Value: string | null;
}

/**
 * One category assignment, fully resolved from root to leaf.
 * e.g. a product filed under Shopify Home & Garden > Furniture > Chairs
 * becomes { levels: ["Home & Garden", "Furniture", "Chairs"] }.
 * Shopify has no native subcategory concept, so for Shopify-sourced data
 * this is derived from Collections (flat, so levels will usually have
 * length 1 unless the collection title itself encodes a path).
 */
export interface CategoryPath {
  levels: string[];
}

export interface NormalizedProduct {
  id: string;
  platform: Platform;
  sourceStore: string;
  handle: string | null;
  title: string;
  descriptionHtml: string;
  shortDescription: string | null;
  vendor: string | null;
  productType: string | null;
  status: ProductStatus;
  tags: string[];
  categories: CategoryPath[];
  images: NormalizedImage[];
  variants: NormalizedVariant[];
  totalInventory: number | null;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface FetchPageInfo {
  hasNextPage: boolean;
  nextPage: number | null;
  /** Best-effort total product count, if the source API exposes one. */
  totalCount: number | null;
}

export interface FetchProductsResult {
  products: NormalizedProduct[];
  pageInfo: FetchPageInfo;
}

export type ExportFormat = "shopify" | "woocommerce";
