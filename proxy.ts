import { NextResponse, type NextRequest } from "next/server";

/**
 * Optional HTTP Basic Auth gate for the entire app.
 *
 * This tool handles live Shopify/WooCommerce credentials, so if you deploy
 * it to a public Vercel URL you should put something in front of it.
 * Set BASIC_AUTH_USER and BASIC_AUTH_PASSWORD as environment variables in
 * your Vercel project to turn this on. Leave them unset (e.g. locally) and
 * this proxy is a no-op.
 *
 * (Using atob() rather than Buffer here because Proxy — Next.js 16's
 * renamed successor to Middleware — runs on the Edge runtime, which
 * doesn't have Node's Buffer available by default.)
 */
export function proxy(request: NextRequest) {
  const user = process.env.BASIC_AUTH_USER;
  const pass = process.env.BASIC_AUTH_PASSWORD;

  if (!user || !pass) {
    return NextResponse.next();
  }

  const authHeader = request.headers.get("authorization");
  if (authHeader?.startsWith("Basic ")) {
    const encoded = authHeader.slice(6);
    try {
      const decoded = atob(encoded);
      const separatorIndex = decoded.indexOf(":");
      const suppliedUser = decoded.slice(0, separatorIndex);
      const suppliedPass = decoded.slice(separatorIndex + 1);
      if (suppliedUser === user && suppliedPass === pass) {
        return NextResponse.next();
      }
    } catch {
      // fall through to 401 below
    }
  }

  return new NextResponse("Authentication required.", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="StoreBridge"' },
  });
}

export const config = {
  matcher: "/((?!_next/static|_next/image|favicon.ico).*)",
};
