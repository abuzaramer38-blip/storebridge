/* eslint-disable @typescript-eslint/no-explicit-any --
   This file parses raw WooCommerce Store API JSON responses, which
   aren't runtime-validated against a schema. `any` here at the
   boundary is deliberate — everything downstream of
   normalizeStoreProduct() is fully typed via NormalizedProduct. */
import type { CategoryPath, FetchProductsResult, NormalizedImage, NormalizedProduct, NormalizedVariant } from "./types";
import { withConcurrency } from "./utils";

/**
 * WooCommerce's Store API (wp-json/wc/store/v1) is the public, cookie-based
 * endpoint that powers the storefront's own cart/checkout blocks — it's
 * unauthenticated by design (https://developer.woocommerce.com/docs/apis/store-api/),
 * unlike the admin wc/v3 REST API, which requires Consumer Key/Secret.
 * That's what makes a link-only WooCommerce flow possible at all.
 *
 * It still exposes full category hierarchy (via /products/categories,
 * same parent/child structure as the authenticated API), so — unlike
 * Shopify's public endpoint — category/subcategory fidelity isn't lost
 * here. What IS lost: exact stock counts. The Store API only exposes
 * `is_in_stock` (boolean) and `low_stock_remaining` (only populated
 * when a product is near the store's configured low-stock threshold).
 *
 * Prices come back as integer strings in the currency's smallest unit
 * (e.g. "1999" cents + currency_minor_unit: 2 = $19.99) — priceFromMinorUnits()
 * below converts that to a normal decimal.
 */
const PAGE_SIZE = 20;
const CATEGORY_PAGE_SIZE = 100;
const VARIATION_CONCURRENCY = 4;

export interface WooCommercePublicCredentials {
  siteUrl: string; // normalized, e.g. "https://example.com"
}

class WooCommerceApiError extends Error {}

async function storeApiFetch(siteUrl: string, path: string): Promise<{ json: any; headers: Headers }> {
  const url = `${siteUrl}/wp-json/wc/store/v1${path}`;
  let response: Response;
  try {
    response = await fetch(url, { headers: { Accept: "application/json" } });
  } catch {
    throw new WooCommerceApiError(`Couldn't reach ${siteUrl}. Check the site URL and that it's online.`);
  }

  const raw = await response.text();
  let json: any;
  try {
    json = JSON.parse(raw);
  } catch {
    throw new WooCommerceApiError(
      `${siteUrl} didn't return JSON (HTTP ${response.status}). Check this is a WooCommerce site and nothing is blocking API requests.`
    );
  }

  if (response.status === 404) {
    throw new WooCommerceApiError(
      "Got a 404 from the WooCommerce Store API. Check the site URL and that WooCommerce (a recent version) is active."
    );
  }
  if (!response.ok) {
    throw new WooCommerceApiError(json?.message || `WooCommerce Store API error (HTTP ${response.status}).`);
  }

  return { json, headers: response.headers };
}

interface CategoryEntry {
  name: string;
  parent: number;
}

async function fetchAllCategories(siteUrl: string): Promise<Map<number, CategoryEntry>> {
  const map = new Map<number, CategoryEntry>();
  let page = 1;
  for (let safety = 0; safety < 200; safety += 1) {
    const { json, headers } = await storeApiFetch(
      siteUrl,
      `/products/categories?per_page=${CATEGORY_PAGE_SIZE}&page=${page}`
    );
    if (!Array.isArray(json) || json.length === 0) break;
    for (const cat of json) {
      map.set(cat.id, { name: cat.name, parent: cat.parent || 0 });
    }
    const totalPages = Number(headers.get("x-wp-totalpages") || "1");
    if (page >= totalPages) break;
    page += 1;
  }
  return map;
}

function resolveCategoryPath(id: number, map: Map<number, CategoryEntry>): string[] {
  const levels: string[] = [];
  const seen = new Set<number>();
  let current = id;
  while (current && !seen.has(current)) {
    seen.add(current);
    const entry = map.get(current);
    if (!entry) break;
    levels.unshift(entry.name);
    current = entry.parent;
  }
  return levels;
}

function priceFromMinorUnits(raw: unknown, minorUnit: number): number | null {
  if (raw === undefined || raw === null || raw === "") return null;
  const n = Number(raw);
  if (Number.isNaN(n)) return null;
  return n / Math.pow(10, minorUnit);
}

function buildVariantFromSimpleProduct(p: any): NormalizedVariant {
  const minorUnit = p.prices?.currency_minor_unit ?? 2;
  return {
    id: String(p.id),
    title: "Default",
    sku: p.sku || null,
    price: priceFromMinorUnits(p.prices?.price ?? p.prices?.regular_price, minorUnit),
    compareAtPrice: p.on_sale ? priceFromMinorUnits(p.prices?.regular_price, minorUnit) : null,
    inventoryQuantity: typeof p.low_stock_remaining === "number" ? p.low_stock_remaining : null,
    inStock: p.is_in_stock !== false,
    option1Name: null,
    option1Value: null,
    option2Name: null,
    option2Value: null,
    option3Name: null,
    option3Value: null,
  };
}

function buildVariantFromVariation(v: any): NormalizedVariant {
  const minorUnit = v.prices?.currency_minor_unit ?? 2;
  const attrs = Array.isArray(v.attributes) ? v.attributes : [];
  return {
    id: String(v.id),
    title: attrs.map((a: any) => a.value).filter(Boolean).join(" / ") || v.name || "Variation",
    sku: v.sku || null,
    price: priceFromMinorUnits(v.prices?.price ?? v.prices?.regular_price, minorUnit),
    compareAtPrice: v.on_sale ? priceFromMinorUnits(v.prices?.regular_price, minorUnit) : null,
    inventoryQuantity: typeof v.low_stock_remaining === "number" ? v.low_stock_remaining : null,
    inStock: v.is_in_stock !== false,
    option1Name: attrs[0]?.name ?? null,
    option1Value: attrs[0]?.value ?? null,
    option2Name: attrs[1]?.name ?? null,
    option2Value: attrs[1]?.value ?? null,
    option3Name: attrs[2]?.name ?? null,
    option3Value: attrs[2]?.value ?? null,
  };
}

async function fetchVariations(siteUrl: string, productId: number): Promise<NormalizedVariant[]> {
  const { json } = await storeApiFetch(siteUrl, `/products?type=variation&parent=${productId}&per_page=100`);
  if (!Array.isArray(json) || json.length === 0) return [];
  return json.map(buildVariantFromVariation);
}

async function normalizeStoreProduct(
  p: any,
  categoryMap: Map<number, CategoryEntry>,
  siteUrl: string
): Promise<NormalizedProduct> {
  const categories: CategoryPath[] = Array.isArray(p.categories)
    ? p.categories.map((c: any) => {
        const path = resolveCategoryPath(c.id, categoryMap);
        return { levels: path.length > 0 ? path : [c.name] };
      })
    : [];

  const images: NormalizedImage[] = (p.images ?? []).map((img: any, index: number) => ({
    src: img.src,
    alt: img.alt || null,
    position: index + 1,
  }));

  const variants = p.has_options ? await fetchVariations(siteUrl, p.id) : [];
  const finalVariants = variants.length > 0 ? variants : [buildVariantFromSimpleProduct(p)];

  const totalInventory = finalVariants.reduce<number | null>((sum, v) => {
    if (v.inventoryQuantity === null) return sum;
    return (sum ?? 0) + v.inventoryQuantity;
  }, null);

  return {
    id: String(p.id),
    platform: "woocommerce",
    sourceStore: siteUrl,
    handle: p.slug || null,
    title: p.name,
    descriptionHtml: p.description || "",
    shortDescription: p.short_description || null,
    vendor: null,
    productType: null,
    status: "publish", // the Store API only ever returns published products
    tags: Array.isArray(p.tags) ? p.tags.map((t: any) => t.name) : [],
    categories,
    images,
    variants: finalVariants,
    totalInventory,
    createdAt: null,
    updatedAt: null,
  };
}

export async function fetchWooCommerceProductsPage(
  creds: WooCommercePublicCredentials,
  page: number
): Promise<FetchProductsResult> {
  const categoryMap = await fetchAllCategories(creds.siteUrl);

  const { json, headers } = await storeApiFetch(creds.siteUrl, `/products?per_page=${PAGE_SIZE}&page=${page}`);

  if (!Array.isArray(json)) {
    throw new WooCommerceApiError("Unexpected response shape from the WooCommerce Store API.");
  }

  const products = await withConcurrency(json, VARIATION_CONCURRENCY, (product) =>
    normalizeStoreProduct(product, categoryMap, creds.siteUrl)
  );

  const totalPages = Number(headers.get("x-wp-totalpages") || "1");
  const total = Number(headers.get("x-wp-total") || String(products.length));

  return {
    products,
    pageInfo: {
      hasNextPage: page < totalPages,
      nextPage: page < totalPages ? page + 1 : null,
      totalCount: Number.isNaN(total) ? null : total,
    },
  };
}
