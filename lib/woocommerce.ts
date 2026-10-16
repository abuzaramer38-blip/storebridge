/* eslint-disable @typescript-eslint/no-explicit-any --
   This file parses raw WooCommerce Store API JSON responses, which
   aren't runtime-validated against a schema. `any` here at the
   boundary is deliberate — everything downstream of
   normalizeStoreProduct() is fully typed via NormalizedProduct. */
import type { CategoryPath, FetchProductsResult, NormalizedImage, NormalizedProduct, NormalizedVariant } from "./types";
import { sleep, withConcurrency } from "./utils";

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
const PAGE_SIZE = 50;
const VARIATION_BATCH_SIZE = 100;
const CATEGORY_PAGE_SIZE = 100;
const VARIATION_CONCURRENCY = 2;
const MAX_RETRIES = 2;
const MAX_WAIT_MS = 8_000;
const REQUEST_TIMEOUT_MS = 20_000;
/** Vercel kills the function at maxDuration (60s). Stop well before that and let the client retry. */
const REQUEST_BUDGET_MS = 40_000;
const RETRY_STATUSES = new Set([429, 502, 503, 504, 508]);
const CATEGORY_CACHE_TTL_MS = 10 * 60 * 1000;

export interface WooCommercePublicCredentials {
  siteUrl: string; // normalized, e.g. "https://example.com"
}

class WooCommerceApiError extends Error {}

/** Server asked us to slow down — tells the client to wait and retry this page. */
export class WooCommerceRateLimitError extends Error {
  retryAfterMs: number;
  constructor(message: string, retryAfterMs: number) {
    super(message);
    this.retryAfterMs = retryAfterMs;
  }
}

function retryDelayMs(response: Response, attempt: number): number {
  const header = response.headers.get("retry-after");
  if (header) {
    const seconds = Number(header);
    if (!Number.isNaN(seconds)) return Math.min(seconds * 1000, MAX_WAIT_MS);
    const date = Date.parse(header);
    if (!Number.isNaN(date)) return Math.min(Math.max(date - Date.now(), 1000), MAX_WAIT_MS);
  }
  // 2s, 4s, 8s, 15s + jitter
  return Math.min(2000 * 2 ** attempt, MAX_WAIT_MS) + Math.floor(Math.random() * 500);
}

interface Budget {
  deadline: number;
}

function newBudget(): Budget {
  return { deadline: Date.now() + REQUEST_BUDGET_MS };
}

async function storeApiFetch(
  siteUrl: string,
  path: string,
  budget: Budget
): Promise<{ json: any; headers: Headers }> {
  const url = `${siteUrl}/wp-json/wc/store/v1${path}`;
  let response: Response;
  let attempt = 0;
  while (true) {
    const remaining = budget.deadline - Date.now();
    if (remaining < 3000) {
      throw new WooCommerceRateLimitError(`${siteUrl} is responding slowly. Waiting and retrying…`, 5000);
    }
    try {
      response = await fetch(url, {
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(Math.min(REQUEST_TIMEOUT_MS, remaining)),
      });
    } catch (err) {
      if (err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError")) {
        throw new WooCommerceRateLimitError(`${siteUrl} timed out. Waiting and retrying…`, 5000);
      }
      // Connection reset / refused mid-run is usually the host's firewall throttling us — retry.
      if (attempt < MAX_RETRIES && Date.now() + 3000 < budget.deadline - 3000) {
        await sleep(3000);
        attempt += 1;
        continue;
      }
      throw new WooCommerceRateLimitError(`Couldn't reach ${siteUrl} right now. Waiting and retrying…`, 10_000);
    }
    if (!RETRY_STATUSES.has(response.status)) break;
    const wait = retryDelayMs(response, attempt);
    if (attempt >= MAX_RETRIES || Date.now() + wait > budget.deadline - 3000) {
      throw new WooCommerceRateLimitError(
        `${siteUrl} is rate-limiting requests (HTTP ${response.status}). Waiting and retrying…`,
        wait
      );
    }
    await response.body?.cancel().catch(() => {});
    await sleep(wait);
    attempt += 1;
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

const categoryCache = new Map<string, { map: Map<number, CategoryEntry>; at: number }>();

async function getCategories(siteUrl: string, budget: Budget): Promise<Map<number, CategoryEntry>> {
  const cached = categoryCache.get(siteUrl);
  if (cached && Date.now() - cached.at < CATEGORY_CACHE_TTL_MS) return cached.map;
  const map = await fetchAllCategories(siteUrl, budget);
  categoryCache.set(siteUrl, { map, at: Date.now() });
  return map;
}

async function fetchAllCategories(siteUrl: string, budget: Budget): Promise<Map<number, CategoryEntry>> {
  const map = new Map<number, CategoryEntry>();
  let page = 1;
  for (let safety = 0; safety < 200; safety += 1) {
    const { json, headers } = await storeApiFetch(
      siteUrl,
      `/products/categories?per_page=${CATEGORY_PAGE_SIZE}&page=${page}`,
      budget
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

function buildVariantFromVariation(v: any, parentAttrs?: any[]): NormalizedVariant {
  const minorUnit = v.prices?.currency_minor_unit ?? 2;
  // Many stores return an empty `attributes` on the variation itself; the parent's
  // `variations[]` entry always carries the name/value pairs, so prefer that.
  const own = Array.isArray(v.attributes) ? v.attributes.filter((a: any) => a?.value) : [];
  const attrs = parentAttrs && parentAttrs.length > 0 ? parentAttrs : own;
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

/**
 * Fetch every variation for a whole page of products in a few requests
 * (`include=id1,id2,...`, 100 at a time) instead of one request per product.
 * This is what keeps big catalogs fast and under the store's rate limits.
 */
async function fetchVariationsForPage(siteUrl: string, products: any[], budget: Budget): Promise<Map<number, any>> {
  const ids: number[] = [];
  for (const p of products) {
    if (Array.isArray(p.variations)) {
      for (const v of p.variations) if (typeof v?.id === "number") ids.push(v.id);
    }
  }
  const byId = new Map<number, any>();
  for (let i = 0; i < ids.length; i += VARIATION_BATCH_SIZE) {
    const chunk = ids.slice(i, i + VARIATION_BATCH_SIZE);
    const { json } = await storeApiFetch(
      siteUrl,
      `/products?type=variation&include=${chunk.join(",")}&per_page=${VARIATION_BATCH_SIZE}`,
      budget
    );
    if (Array.isArray(json)) for (const v of json) byId.set(v.id, v);
  }
  return byId;
}

/** Old per-product path, only used when a product lists options but no variation ids. */
async function fetchVariationsForProduct(siteUrl: string, productId: number, budget: Budget): Promise<any[]> {
  const { json } = await storeApiFetch(siteUrl, `/products?type=variation&parent=${productId}&per_page=100`, budget);
  return Array.isArray(json) ? json : [];
}

async function normalizeStoreProduct(
  p: any,
  categoryMap: Map<number, CategoryEntry>,
  siteUrl: string,
  budget: Budget,
  variationsById: Map<number, any>
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

  let variants: NormalizedVariant[] = [];
  const listed: any[] = Array.isArray(p.variations) ? p.variations : [];
  if (listed.length > 0) {
    variants = listed
      .map((entry) => {
        const full = variationsById.get(entry.id);
        return full ? buildVariantFromVariation(full, entry.attributes) : null;
      })
      .filter((v): v is NormalizedVariant => v !== null);
  } else if (p.type === "variable") {
    variants = (await fetchVariationsForProduct(siteUrl, p.id, budget)).map((v) => buildVariantFromVariation(v));
  }
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
  const budget = newBudget();
  const categoryMap = await getCategories(creds.siteUrl, budget);

  const { json, headers } = await storeApiFetch(
    creds.siteUrl,
    `/products?per_page=${PAGE_SIZE}&page=${page}`,
    budget
  );

  if (!Array.isArray(json)) {
    throw new WooCommerceApiError("Unexpected response shape from the WooCommerce Store API.");
  }

  const variationsById = await fetchVariationsForPage(creds.siteUrl, json, budget);

  const products = await withConcurrency(json, VARIATION_CONCURRENCY, (product) =>
    normalizeStoreProduct(product, categoryMap, creds.siteUrl, budget, variationsById)
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
