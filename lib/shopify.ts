/* eslint-disable @typescript-eslint/no-explicit-any --
   This file parses Shopify's raw public-JSON response, which isn't
   runtime-validated against a schema. `any` here at the boundary is
   deliberate — everything downstream of normalizeShopifyProduct() is
   fully typed via NormalizedProduct. */
import type { CategoryPath, FetchProductsResult, NormalizedImage, NormalizedProduct, NormalizedVariant } from "./types";

/**
 * Every Shopify storefront (custom domain or *.myshopify.com) serves its
 * catalog at this public, unauthenticated endpoint — the same JSON that
 * powers the storefront's own product pages. No app, token, or scope
 * needed. Pagination is plain page numbers (this is a different, older
 * endpoint from the authenticated Admin API, which deprecated `page`
 * in favor of cursors — that limitation doesn't apply here).
 *
 * Trade-off: this endpoint does not expose Collections (Shopify's
 * closest thing to categories) or exact inventory counts — those are
 * only available through the authenticated Admin API. What it does
 * give us: `product_type` (used here as a single-level pseudo-category)
 * and `available` (in-stock/out-of-stock, no quantity).
 */
const PAGE_SIZE = 250;

class ShopifyPublicApiError extends Error {}

export interface ShopifyPublicCredentials {
  storeUrl: string; // normalized, e.g. "https://my-store.com" or "https://my-store.myshopify.com"
}

function parseTags(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw.filter(Boolean).map(String);
  if (typeof raw === "string" && raw.trim()) {
    return raw
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
  }
  return [];
}

function normalizeShopifyProduct(p: any, storeUrl: string): NormalizedProduct {
  const images: NormalizedImage[] = (p.images ?? []).map((img: any, index: number) => ({
    src: img.src,
    alt: img.alt ?? null,
    position: typeof img.position === "number" ? img.position : index + 1,
  }));

  const optionNames: (string | null)[] = Array.isArray(p.options)
    ? p.options.map((o: any) => o?.name ?? null)
    : [null, null, null];

  const variants: NormalizedVariant[] = (p.variants ?? []).map((v: any) => ({
    id: String(v.id),
    title: v.title || [v.option1, v.option2, v.option3].filter(Boolean).join(" / ") || "Default",
    sku: v.sku || null,
    price: v.price !== undefined && v.price !== null && v.price !== "" ? Number(v.price) : null,
    compareAtPrice: v.compare_at_price ? Number(v.compare_at_price) : null,
    // The public endpoint doesn't expose a quantity, only availability.
    inventoryQuantity: null,
    inStock: v.available !== false,
    option1Name: v.option1 ? optionNames[0] ?? "Option1" : null,
    option1Value: v.option1 ?? null,
    option2Name: v.option2 ? optionNames[1] ?? "Option2" : null,
    option2Value: v.option2 ?? null,
    option3Name: v.option3 ? optionNames[2] ?? "Option3" : null,
    option3Value: v.option3 ?? null,
  }));

  // No Collections here — product_type is the closest single-level
  // stand-in for a category that this public endpoint provides.
  const categories: CategoryPath[] = p.product_type
    ? [{ levels: [String(p.product_type).trim()] }]
    : [];

  return {
    id: String(p.id),
    platform: "shopify",
    sourceStore: storeUrl,
    handle: p.handle ?? null,
    title: p.title,
    descriptionHtml: p.body_html || "",
    shortDescription: null,
    vendor: p.vendor || null,
    productType: p.product_type || null,
    status: p.published_at ? "active" : "draft",
    tags: parseTags(p.tags),
    categories,
    images,
    variants,
    totalInventory: null,
    createdAt: p.created_at ?? null,
    updatedAt: p.updated_at ?? null,
  };
}

export async function fetchShopifyProductsPage(
  creds: ShopifyPublicCredentials,
  page: number
): Promise<FetchProductsResult> {
  const url = `${creds.storeUrl}/products.json?limit=${PAGE_SIZE}&page=${page}`;

  let response: Response;
  try {
    response = await fetch(url, { headers: { Accept: "application/json" } });
  } catch {
    throw new ShopifyPublicApiError(`Couldn't reach ${creds.storeUrl}. Check the store URL and that the site is online.`);
  }

  if (response.status === 401 || response.status === 403) {
    throw new ShopifyPublicApiError(
      "This store's catalog isn't publicly reachable (it may be password-protected or still in dev mode)."
    );
  }
  if (response.status === 404) {
    throw new ShopifyPublicApiError("Got a 404 — check the store URL is correct and it's a Shopify store.");
  }

  const raw = await response.text();
  let json: any;
  try {
    json = JSON.parse(raw);
  } catch {
    throw new ShopifyPublicApiError(`${creds.storeUrl} didn't return JSON — check this is a Shopify storefront URL.`);
  }

  if (!response.ok || !Array.isArray(json.products)) {
    throw new ShopifyPublicApiError(
      json?.message || `Unexpected response (HTTP ${response.status}) from ${creds.storeUrl}.`
    );
  }

  const products = json.products.map((p: any) => normalizeShopifyProduct(p, creds.storeUrl));

  return {
    products,
    pageInfo: {
      hasNextPage: products.length === PAGE_SIZE,
      nextPage: products.length === PAGE_SIZE ? page + 1 : null,
      totalCount: null,
    },
  };
}
