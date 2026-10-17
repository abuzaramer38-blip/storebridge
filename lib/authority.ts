/* eslint-disable @typescript-eslint/no-explicit-any -- third-party API responses */

/**
 * Domain authority scores come from the companies that invent them:
 *  - Domain Rating (DR) — Ahrefs, via its free public endpoint (needs a free API v3 key).
 *  - Domain Authority (DA), Page Authority and Spam Score — Moz, via its JSON-RPC API
 *    (free plan: 50 rows a month, one request every 10 seconds).
 *  - Open PageRank (0–10) — a free authority score from DomCop's Open PageRank (free key).
 *  - Domain age — from the public RDAP registry lookup, no key needed.
 * Keys live in env vars: AHREFS_API_KEY, MOZ_API_TOKEN, OPENPAGERANK_API_KEY.
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
  openPageRank: { configured: boolean; score: number | null; globalRank: number | null; error: string | null };
  age: { registered: string | null; years: number | null; error: string | null };
}

const TWO_PART_SUFFIXES = new Set([
  "co.uk", "org.uk", "me.uk", "ltd.uk", "plc.uk", "com.au", "net.au", "org.au", "co.nz", "com.pk", "net.pk", "org.pk",
  "co.in", "com.br", "com.mx", "co.za", "com.tr", "com.sg", "com.my", "co.jp", "com.cn", "com.hk", "co.kr", "com.ar",
]);

/** The registrable domain (shop.example.co.uk → example.co.uk), which is what registries know about. */
export function registrableDomain(host: string): string {
  const parts = host.toLowerCase().replace(/^www\./, "").split(".");
  if (parts.length <= 2) return parts.join(".");
  const lastTwo = parts.slice(-2).join(".");
  return TWO_PART_SUFFIXES.has(lastTwo) ? parts.slice(-3).join(".") : lastTwo;
}

async function openPageRank(domain: string, key: string) {
  const res = await fetch(`https://openpagerank.com/api/v1.0/getPageRank?domains%5B%5D=${encodeURIComponent(domain)}`, {
    headers: { "API-OPR": key, Accept: "application/json" },
    signal: AbortSignal.timeout(15_000),
  });
  const text = await res.text();
  let json: any = null;
  try {
    json = JSON.parse(text);
  } catch {
    // not JSON (e.g. a firewall page)
  }
  if (res.status === 401 || res.status === 403) {
    const why = json?.error || json?.message || (json ? "" : text.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 120));
    throw new Error(`Open PageRank refused the request (HTTP ${res.status})${why ? `: ${why}` : ""}.`);
  }
  if (res.status === 429) throw new Error("Open PageRank daily limit reached.");
  if (!res.ok) throw new Error(json?.error || `Open PageRank returned HTTP ${res.status}.`);
  const row = Array.isArray(json?.response) ? json.response[0] : null;
  if (!row || (row.status_code && row.status_code !== 200)) {
    return { score: null, globalRank: null, error: row?.error ? String(row.error) : "Not in Open PageRank's index yet." };
  }
  const score = Number(row.page_rank_decimal);
  const rank = Number(row.rank);
  return {
    score: Number.isFinite(score) ? Math.round(score * 100) / 100 : null,
    globalRank: Number.isFinite(rank) && rank > 0 ? rank : null,
    error: null,
  };
}

// IANA's official list of which registry answers RDAP lookups for each domain ending.
let rdapBootstrap: { at: number; map: Map<string, string> } | null = null;

async function rdapBaseFor(tld: string): Promise<string | null> {
  if (!rdapBootstrap || Date.now() - rdapBootstrap.at > 24 * 3600 * 1000) {
    const res = await fetch("https://data.iana.org/rdap/dns.json", { signal: AbortSignal.timeout(10_000) });
    const json: any = await res.json();
    const map = new Map<string, string>();
    for (const [tlds, urls] of json?.services ?? []) {
      const base = (urls as string[]).find((u) => u.startsWith("https://")) ?? (urls as string[])[0];
      for (const t of tlds as string[]) map.set(t.toLowerCase(), base.endsWith("/") ? base : `${base}/`);
    }
    rdapBootstrap = { at: Date.now(), map };
  }
  return rdapBootstrap.map.get(tld) ?? null;
}

async function domainAge(domain: string) {
  const tld = domain.split(".").pop() ?? "";
  const base = await rdapBaseFor(tld).catch(() => null);
  const url = base ? `${base}domain/${encodeURIComponent(domain)}` : `https://rdap.org/domain/${encodeURIComponent(domain)}`;
  const res = await fetch(url, {
    headers: { Accept: "application/rdap+json, application/json" },
    redirect: "follow",
    signal: AbortSignal.timeout(12_000),
  });
  if (!base && res.status === 404) {
    return { registered: null, years: null, error: "This domain ending has no public registry lookup." };
  }
  const json: any = await res.json().catch(() => null);
  const ev = Array.isArray(json?.events) ? json.events.find((e: any) => e?.eventAction === "registration") : null;
  if (!ev?.eventDate) return { registered: null, years: null, error: "The registry didn't share a registration date." };
  const date = new Date(ev.eventDate);
  const years = Math.max(0, (Date.now() - date.getTime()) / (365.25 * 24 * 3600 * 1000));
  return { registered: date.toISOString().slice(0, 10), years: Math.round(years * 10) / 10, error: null };
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
  const oprKey = process.env.OPENPAGERANK_API_KEY?.trim();
  const root = registrableDomain(domain);

  const [ahrefs, moz, opr, age] = await Promise.all([
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
    oprKey
      ? openPageRank(root, oprKey).then(
          (r) => ({ configured: true, ...r }),
          (e: Error) => ({ configured: true, score: null, globalRank: null, error: e.message })
        )
      : Promise.resolve({ configured: false, score: null, globalRank: null, error: null }),
    domainAge(root).catch(() => ({ registered: null, years: null, error: "The registry lookup didn't respond." })),
  ]);

  return { domain, ahrefs, moz, openPageRank: opr, age };
}
