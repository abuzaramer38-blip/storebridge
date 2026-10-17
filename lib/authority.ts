/* eslint-disable @typescript-eslint/no-explicit-any -- third-party API responses */

/**
 * Domain authority scores come from the companies that invent them:
 *  - Domain Rating (DR) — Ahrefs, via its free public endpoint (needs a free API v3 key).
 *  - Domain Authority (DA), Page Authority and Spam Score — Moz, via its JSON-RPC API
 *    (free plan: 50 rows a month, one request every 10 seconds).
 * Keys live in env vars: AHREFS_API_KEY and MOZ_API_TOKEN.
 */

export interface AuthorityResult {
  domain: string;
  ahrefs: { configured: boolean; domainRating: number | null; error: string | null };
  moz: {
    configured: boolean;
    domainAuthority: number | null;
    pageAuthority: number | null;
    spamScore: number | null;
    linkingDomains: number | null;
    error: string | null;
  };
}

export function bareDomain(origin: string): string {
  return new URL(origin).hostname.replace(/^www\./, "");
}

async function ahrefsDomainRating(domain: string, key: string) {
  const res = await fetch("https://api.ahrefs.com/v3/public/domain-rating-free?output=json", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ targets: [domain] }),
    signal: AbortSignal.timeout(15_000),
  });
  const json: any = await res.json().catch(() => null);
  if (res.status === 401 || res.status === 403) throw new Error("Ahrefs rejected the API key.");
  if (res.status === 429) throw new Error("Ahrefs rate limit reached — try again later.");
  if (!res.ok) throw new Error(json?.error || `Ahrefs returned HTTP ${res.status}.`);
  const t = json?.domain_rating?.targets?.[0];
  if (t?.error) throw new Error(String(t.error));
  return typeof t?.domain_rating === "number" ? Math.round(t.domain_rating * 10) / 10 : null;
}

async function mozSiteMetrics(domain: string, token: string) {
  const res = await fetch("https://api.moz.com/jsonrpc", {
    method: "POST",
    headers: { "x-moz-token": token, "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: crypto.randomUUID(),
      method: "data.site.metrics.fetch",
      params: { data: { site_query: { query: domain, scope: "domain" } } },
    }),
    signal: AbortSignal.timeout(15_000),
  });
  const json: any = await res.json().catch(() => null);
  if (res.status === 401 || res.status === 403) throw new Error("Moz rejected the API token.");
  if (json?.error) {
    const msg = String(json.error.message || json.error.data || "Moz returned an error.");
    if (/quota|limit|rows/i.test(msg)) throw new Error("Your Moz plan's monthly lookups are used up.");
    throw new Error(msg);
  }
  const m = json?.result?.site_metrics;
  if (!m) throw new Error(`Moz returned no metrics (HTTP ${res.status}).`);
  const num = (v: unknown) => (typeof v === "number" && v >= 0 ? v : null);
  return {
    domainAuthority: num(m.domain_authority),
    pageAuthority: num(m.page_authority),
    // Moz reports -1 when it has too little data to score spam.
    spamScore: num(m.spam_score),
    linkingDomains: num(m.root_domains_to_root_domain),
  };
}

export async function getAuthority(origin: string): Promise<AuthorityResult> {
  const domain = bareDomain(origin);
  const ahrefsKey = process.env.AHREFS_API_KEY?.trim();
  const mozToken = process.env.MOZ_API_TOKEN?.trim();

  const [ahrefs, moz] = await Promise.all([
    ahrefsKey
      ? ahrefsDomainRating(domain, ahrefsKey).then(
          (dr) => ({ configured: true, domainRating: dr, error: null }),
          (e: Error) => ({ configured: true, domainRating: null, error: e.message })
        )
      : Promise.resolve({ configured: false, domainRating: null, error: null }),
    mozToken
      ? mozSiteMetrics(domain, mozToken).then(
          (m) => ({ configured: true, ...m, error: null }),
          (e: Error) => ({
            configured: true,
            domainAuthority: null,
            pageAuthority: null,
            spamScore: null,
            linkingDomains: null,
            error: e.message,
          })
        )
      : Promise.resolve({
          configured: false,
          domainAuthority: null,
          pageAuthority: null,
          spamScore: null,
          linkingDomains: null,
          error: null,
        }),
  ]);

  return { domain, ahrefs, moz };
}
