import { NextResponse } from "next/server";
import { BestsellersError, getBestsellers } from "@/lib/bestsellers";
import { PublicUrlError, toPublicOrigin } from "@/lib/net";

export const maxDuration = 60;

/** GET /api/bestsellers?url=store.com&limit=100[&format=csv] — WooCommerce or Shopify, best sellers first. */
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const raw = params.get("url") ?? params.get("siteUrl");
  if (!raw) {
    return NextResponse.json({ success: false, error: "Add a store link, like my-store.com." }, { status: 400 });
  }
  const limit = Math.min(Math.max(Number(params.get("limit")) || 100, 10), 300);

  try {
    const origin = await toPublicOrigin(raw);
    const result = await getBestsellers(origin, limit);

    if (params.get("format") === "csv") {
      const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
      const lines = ["Rank,Name,Price,Compare at,In stock,Reviews,Rating,Category,Ranked by sales,Link"];
      for (const r of result.rows) {
        const ranked = result.rankedUntil === null || r.rank <= result.rankedUntil ? "yes" : "no";
        lines.push(
          [r.rank, esc(r.name), r.price ?? "", r.compareAtPrice ?? "", r.inStock ?? "", r.reviews ?? "", r.rating ?? "", esc(r.category), ranked, esc(r.url)].join(",")
        );
      }
      return new NextResponse(lines.join("\n"), { headers: { "Content-Type": "text/csv; charset=utf-8" } });
    }

    return NextResponse.json({ success: true, result });
  } catch (error) {
    // A store that can't be ranked is an expected answer, not a server failure.
    const status = error instanceof PublicUrlError ? 400 : error instanceof BestsellersError ? 200 : 502;
    const message =
      error instanceof PublicUrlError || error instanceof BestsellersError
        ? error.message
        : `Couldn't reach the store (${error instanceof Error ? error.message : "unknown error"}). Check the link and try again.`;
    const details = error instanceof BestsellersError ? error.details : undefined;
    return NextResponse.json({ success: false, error: message, details }, { status });
  }
}
