import { NextResponse } from "next/server";
import { getAuthority, type AuthorityResult } from "@/lib/authority";
import { PublicUrlError, toPublicOrigin } from "@/lib/net";

export const maxDuration = 30;

// Moz's free plan allows 50 lookups a month, so each domain's answer is reused for a day:
// once in this server instance's memory, and again by Vercel's CDN via the cache header.
const memo = new Map<string, { at: number; result: AuthorityResult }>();
const DAY = 24 * 60 * 60 * 1000;

/** GET /api/authority?url=store.com — Ahrefs DR, Moz DA / PA / Spam Score. */
export async function GET(request: Request) {
  const raw = new URL(request.url).searchParams.get("url");
  if (!raw) {
    return NextResponse.json({ success: false, error: "Add a store link, like my-store.com." }, { status: 400 });
  }
  try {
    const origin = await toPublicOrigin(raw);
    const key = new URL(origin).hostname.replace(/^www\./, "");
    const hit = memo.get(key);
    let result: AuthorityResult;
    if (hit && Date.now() - hit.at < DAY) {
      result = hit.result;
    } else {
      result = await getAuthority(origin);
      const failed = result.ahrefs.error || result.moz.error;
      if (!failed) memo.set(key, { at: Date.now(), result });
    }
    const cacheable = !result.ahrefs.error && !result.moz.error && (result.ahrefs.configured || result.moz.configured);
    return NextResponse.json(
      { success: true, result },
      { headers: { "Cache-Control": cacheable ? "public, s-maxage=86400, stale-while-revalidate=3600" : "no-store" } }
    );
  } catch (error) {
    const status = error instanceof PublicUrlError ? 400 : 502;
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Couldn't look up that domain." },
      { status }
    );
  }
}
