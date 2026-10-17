import { NextResponse } from "next/server";
import { inspectStore } from "@/lib/inspect";
import { PublicUrlError, toPublicOrigin } from "@/lib/net";

export const maxDuration = 60;

/** GET /api/inspect?url=store.com — which platform, theme, plugins and host a store runs on. */
export async function GET(request: Request) {
  const raw = new URL(request.url).searchParams.get("url");
  if (!raw) {
    return NextResponse.json({ success: false, error: "Add a store link, like my-store.com." }, { status: 400 });
  }
  try {
    const origin = await toPublicOrigin(raw);
    const result = await inspectStore(origin);
    return NextResponse.json({ success: true, result });
  } catch (error) {
    const status = error instanceof PublicUrlError ? 400 : 502;
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Couldn't inspect that store." },
      { status }
    );
  }
}
