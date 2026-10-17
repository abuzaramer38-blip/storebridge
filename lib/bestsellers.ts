/* eslint-disable @typescript-eslint/no-explicit-any --
   Parses raw public storefront JSON/HTML. Output rows are fully typed. */
import { fetchJson, fetchText } from "./net";
import { withConcurrency } from "./utils";

export interface BestsellerRow {
  rank: number;
  id: string;
  name: string;
  url: string;
  image: string | null;
  price: number | null;
  compareAtPrice: number | null;
  inStock: boolean | null;
  reviews: number | null;
  rating: number | null;
  category: string | null;
}

export interface BestsellersResult {
  platform: "woocommerce" | "shopify";
  method: string;
  currency: string | null;
  rows: BestsellerRow[];
  /**
   * Ranks after this number follow a plain ID/name order, which means those products sold the
   * same amount (usually nothing). 0 = no ranking signal at all; null = the whole list looks ranked.
   */
  rankedUntil: number | null;
  totalProducts: number | null;
}

export class BestsellersError extends Error {}

function decode(s: string): string {
  return s
    .replace(/&#0?38;|&amp;/g, "&")
    .replace(/&#8243;|&#8221;/g, "″")
    .replace(/&#8242;|&#8217;/g, "′")
    .replace(/&#8211;/g, "–")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'");
}

/**
 * Stores sort equal sellers by product ID or name. When the tail of the list is one long run
 * in such an order, the products in that run all have the same sales — the ranking ends there.
 */
export function findRankedUntil(rows: BestsellerRow[]): number | null {
  const n = rows.length;
  if (n < 10) return null;
  const idNum = (r: BestsellerRow) => (/^\d+$/.test(r.id) ? BigInt(r.id) : null);
  const byName = (a: BestsellerRow, b: BestsellerRow) =>
    a.name.localeCompare(b.name, undefined, { sensitivity: "base", numeric: true });
  const comparators: ((a: BestsellerRow, b: BestsellerRow) => boolean)[] = [
    (a, b) => {
      const x = idNum(a), y = idNum(b);
      return x !== null && y !== null && x > y;
    },
    (a, b) => {
      const x = idNum(a), y = idNum(b);
      return x !== null && y !== null && x < y;
    },
    (a, b) => byName(a, b) >= 0,
    (a, b) => byName(a, b) <= 0,
  ];
  let start = n - 1;
  for (const ordered of comparators) {
    let i = n - 1;
    while (i > 0 && ordered(rows[i - 1], rows[i])) i -= 1;
    start = Math.min(start, i);
  }
  const runLength = n - start;
  if (runLength < Math.max(12, Math.floor(n * 0.15))) return null;
  return start;
}

// ---------------- WooCommerce ----------------

async function wooBestsellers(origin: string, limit: number): Promise<BestsellersResult> {
  const perPage = Math.min(100, limit);
  const rows: BestsellerRow[] = [];
  let currency: string | null = null;
  let total: number | null = null;

  for (let page = 1; rows.length < limit; page += 1) {
    const r = await fetchJson<any[]>(
      `${origin}/wp-json/wc/store/v1/products?orderby=popularity&order=desc&per_page=${perPage}&page=${page}`,
      25_000
    );
    if (r.status === 404) throw new BestsellersError("This WordPress site doesn't have WooCommerce's Store API turned on.");
    if (r.status === 403 || r.status === 429) {
      throw new BestsellersError(`The store blocked the request (HTTP ${r.status}). Try again in a minute.`);
    }
    if (!Array.isArray(r.json)) throw new BestsellersError(`The store didn't return a product list (HTTP ${r.status}).`);
    if (page === 1) {
      const t = Number(r.headers.get("x-wp-total"));
      total = r.headers.get("x-wp-total") && Number.isFinite(t) ? t : null;
    }
    for (const p of r.json) {
      if (rows.length >= limit) break;
      const minor = p.prices?.currency_minor_unit ?? 2;
      const money = (v: unknown) => (v === undefined || v === null || v === "" ? null : Number(v) / 10 ** minor);
      currency ??= p.prices?.currency_code ?? null;
      const price = money(p.prices?.price);
      const regular = money(p.prices?.regular_price);
      rows.push({
        rank: rows.length + 1,
        id: String(p.id),
        name: decode(String(p.name ?? "")),
        url: p.permalink || origin,
        image: p.images?.[0]?.thumbnail || p.images?.[0]?.src || null,
        price,
        compareAtPrice: p.on_sale && regular && price !== null && regular > price ? regular : null,
        inStock: typeof p.is_in_stock === "boolean" ? p.is_in_stock : null,
        reviews: typeof p.review_count === "number" ? p.review_count : null,
        rating: p.average_rating ? Number(p.average_rating) || null : null,
        category: p.categories?.[0]?.name ? decode(p.categories[0].name) : null,
      });
    }
    if (r.json.length < perPage) break;
  }

  return {
    platform: "woocommerce",
    method: "WooCommerce's own “Sort by popularity” (total sales)",
    currency,
    rows,
    rankedUntil: findRankedUntil(rows),
    totalProducts: total,
  };
}

// ---------------- Shopify ----------------

function isSorted(titles: string[], dir: 1 | -1): boolean {
  for (let i = 1; i < titles.length; i += 1) {
    const c = titles[i - 1].localeCompare(titles[i], undefined, { sensitivity: "base", numeric: true });
    if (c * dir > 0) return false;
  }
  return true;
}

function shopifyRow(p: any, rank: number, origin: string): BestsellerRow {
  // products.json gives price strings in dollars; /products/x.js gives integer cents.
  const fromJs = typeof p.price === "number";
  const v0 = p.variants?.[0];
  const price = fromJs ? p.price / 100 : v0?.price != null ? Number(v0.price) : null;
  const cmp = fromJs
    ? p.compare_at_price
      ? p.compare_at_price / 100
      : null
    : v0?.compare_at_price
      ? Number(v0.compare_at_price)
      : null;
  const img = fromJs ? p.featured_image : p.images?.[0]?.src;
  return {
    rank,
    id: String(p.id),
    name: decode(String(p.title ?? "")),
    url: `${origin}/products/${p.handle}`,
    image: img ? (String(img).startsWith("//") ? `https:${img}` : String(img)) : null,
    price,
    compareAtPrice: cmp && price !== null && cmp > price ? cmp : null,
    inStock: typeof p.available === "boolean" ? p.available : Array.isArray(p.variants) ? p.variants.some((v: any) => v.available) : null,
    reviews: null,
    rating: null,
    category: p.product_type || p.type || null,
  };
}

async function shopifyJsonHonoursSort(origin: string): Promise<boolean> {
  const get = (sort: string) =>
    fetchJson<any>(`${origin}/collections/all/products.json?sort_by=${sort}&limit=30`, 15_000)
      .then((r) => (Array.isArray(r.json?.products) ? (r.json.products as any[]).map((p) => String(p.title)) : null))
      .catch(() => null);
  const [asc, desc] = await Promise.all([get("title-ascending"), get("title-descending")]);
  return !!asc && !!desc && asc.length > 2 && isSorted(asc, 1) && isSorted(desc, -1);
}

async function shopifyBestsellers(origin: string, limit: number): Promise<BestsellersResult> {
  const deadline = Date.now() + 45_000;
  let rows: BestsellerRow[] = [];
  let method = "";

  if (await shopifyJsonHonoursSort(origin)) {
    method = "Shopify's own “Best selling” collection sort";
    for (let page = 1; rows.length < limit && Date.now() < deadline; page += 1) {
      const r = await fetchJson<any>(
        `${origin}/collections/all/products.json?sort_by=best-selling&limit=${Math.min(250, limit)}&page=${page}`,
        20_000
      );
      const list = r.json?.products;
      if (!Array.isArray(list) || list.length === 0) break;
      for (const p of list) if (rows.length < limit) rows.push(shopifyRow(p, rows.length + 1, origin));
      if (list.length < Math.min(250, limit)) break;
    }
  } else {
    // Read the storefront's best-selling page and keep product links in the order they appear.
    method = "Shopify's “Best selling” page on the storefront";
    const handles: string[] = [];
    const seen = new Set<string>();
    for (let page = 1; handles.length < limit && page <= 15 && Date.now() < deadline; page += 1) {
      const r = await fetchText(`${origin}/collections/all?sort_by=best-selling&page=${page}`, 20_000).catch(() => null);
      if (!r || r.status >= 400) {
        if (page === 1) throw new BestsellersError(`The store's product listing page didn't load (HTTP ${r?.status ?? "error"}).`);
        break;
      }
      let added = 0;
      for (const m of r.text.matchAll(/href="(?:https?:\/\/[^"/]+)?(?:\/[a-z]{2}(?:-[a-z]{2})?)?(?:\/collections\/[^"/?]+)?\/products\/([A-Za-z0-9%._-]+)/g)) {
        const h = m[1];
        if (!seen.has(h)) {
          seen.add(h);
          handles.push(h);
          added += 1;
        }
      }
      if (added === 0) break;
    }
    const picked = handles.slice(0, limit);
    const details = await withConcurrency(picked, 6, async (h) => {
      if (Date.now() > deadline) return null;
      const r = await fetchJson<any>(`${origin}/products/${h}.js`, 10_000).catch(() => null);
      return r?.json && r.json.id ? r.json : null;
    });
    rows = details
      .filter((p): p is any => !!p)
      .map((p, i) => shopifyRow(p, i + 1, origin));
  }

  if (rows.length === 0) throw new BestsellersError("No products came back from this Shopify store.");

  const meta = await fetchJson<any>(`${origin}/meta.json`, 8_000).catch(() => null);
  return {
    platform: "shopify",
    method,
    currency: meta?.json?.currency ?? null,
    rows,
    rankedUntil: findRankedUntil(rows),
    totalProducts: typeof meta?.json?.published_products_count === "number" ? meta.json.published_products_count : null,
  };
}

/** Detect the platform from cheap probes, then fetch the store's best-selling order. */
export async function getBestsellers(origin: string, limit: number): Promise<BestsellersResult> {
  const [woo, shop] = await Promise.all([
    fetchJson<any>(`${origin}/wp-json/wc/store/v1/products?per_page=1`, 12_000).catch(() => null),
    fetchJson<any>(`${origin}/products.json?limit=1`, 12_000).catch(() => null),
  ]);
  if (Array.isArray(woo?.json)) return wooBestsellers(origin, limit);
  if (Array.isArray(shop?.json?.products)) return shopifyBestsellers(origin, limit);
  if (woo && (woo.status === 403 || woo.status === 429)) {
    throw new BestsellersError(`The store blocked the request (HTTP ${woo.status}). Try again in a minute.`);
  }
  throw new BestsellersError("Bestsellers work for WooCommerce and Shopify stores. This store doesn't look like either.");
}
