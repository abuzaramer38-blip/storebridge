import { NextResponse } from "next/server";
import { normalizeUrl } from "@/lib/utils";

export const maxDuration = 60;

/**
 * GET /api/woocommerce/bestsellers?siteUrl=example.com&limit=200[&format=csv]
 *
 * Returns a store's products in WooCommerce "popularity" order (total sales, highest first),
 * via the public Store API. Only a compact list — rank, id, name, price, sku, link.
 * The Store API exposes the ranking, not the actual order counts.
 */
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const rawSite = params.get("siteUrl");
  if (!rawSite) {
    return NextResponse.json({ success: false, error: "siteUrl is required." }, { status: 400 });
  }
  const siteUrl = normalizeUrl(rawSite);
  const limit = Math.min(Math.max(Number(params.get("limit")) || 100, 1), 500);
  const perPage = Math.min(limit, 100);

  type Row = { rank: number; id: number; name: string; price: number | null; sku: string; link: string };
  const rows: Row[] = [];

  try {
    for (let page = 1; rows.length < limit; page += 1) {
      const res = await fetch(
        `${siteUrl}/wp-json/wc/store/v1/products?orderby=popularity&order=desc&per_page=${perPage}&page=${page}`,
        { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(25_000) }
      );
      if (!res.ok) throw new Error(`Store API returned HTTP ${res.status}`);
      const json = await res.json();
      if (!Array.isArray(json) || json.length === 0) break;
      for (const p of json) {
        if (rows.length >= limit) break;
        const minor = p.prices?.currency_minor_unit ?? 2;
        const raw = p.prices?.price;
        rows.push({
          rank: rows.length + 1,
          id: p.id,
          name: String(p.name ?? "")
            .replace(/&#0?38;/g, "&")
            .replace(/&amp;/g, "&"),
          price: raw === undefined || raw === "" ? null : Number(raw) / Math.pow(10, minor),
          sku: p.sku || "",
          link: p.permalink || "",
        });
      }
      if (json.length < perPage) break;
    }
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Unknown error." },
      { status: 502 }
    );
  }

  if (params.get("format") === "csv") {
    const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const csv = ["Rank,ID,Name,Price,SKU,Link"]
      .concat(rows.map((r) => [r.rank, r.id, esc(r.name), r.price ?? "", esc(r.sku), esc(r.link)].join(",")))
      .join("\n");
    return new NextResponse(csv, { headers: { "Content-Type": "text/csv; charset=utf-8" } });
  }

  return NextResponse.json({ success: true, siteUrl, count: rows.length, products: rows });
}
