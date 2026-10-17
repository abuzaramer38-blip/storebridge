import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { normalizeUrl } from "./utils";

/** A browser-like UA: many stores serve a stripped or blocked page to unknown bots. */
export const BROWSER_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9",
};

export class PublicUrlError extends Error {}

function isPrivateIp(ip: string): boolean {
  if (isIP(ip) === 6) {
    const v = ip.toLowerCase();
    if (v === "::1" || v === "::") return true;
    if (v.startsWith("fc") || v.startsWith("fd") || v.startsWith("fe80")) return true;
    const mapped = v.match(/::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    return mapped ? isPrivateIp(mapped[1]) : false;
  }
  const [a, b] = ip.split(".").map(Number);
  return (
    a === 10 ||
    a === 127 ||
    a === 0 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 100 && b >= 64 && b <= 127)
  );
}

/**
 * Normalize what the person typed into an origin and make sure it points at a
 * public website — the server fetches it, so internal addresses must be refused.
 */
export async function toPublicOrigin(input: string): Promise<string> {
  let url: URL;
  try {
    url = new URL(normalizeUrl(input));
  } catch {
    throw new PublicUrlError("That doesn't look like a website address.");
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new PublicUrlError("Only http and https links are supported.");
  }
  const host = url.hostname;
  if (host === "localhost" || host.endsWith(".local") || host.endsWith(".internal") || !host.includes(".")) {
    throw new PublicUrlError("Enter a public store address, like my-store.com.");
  }
  const addresses = isIP(host) ? [{ address: host }] : await lookup(host, { all: true }).catch(() => []);
  if (addresses.length === 0) {
    throw new PublicUrlError(`Couldn't find ${host}. Check the spelling.`);
  }
  if (addresses.some((a) => isPrivateIp(a.address))) {
    throw new PublicUrlError("That address points to a private network.");
  }
  return url.origin;
}

export async function fetchText(
  url: string,
  timeoutMs = 15_000
): Promise<{ status: number; headers: Headers; text: string; finalUrl: string }> {
  const res = await fetch(url, {
    headers: BROWSER_HEADERS,
    redirect: "follow",
    signal: AbortSignal.timeout(timeoutMs),
  });
  const text = await res.text();
  return { status: res.status, headers: res.headers, text, finalUrl: res.url || url };
}

export async function fetchJson<T = unknown>(
  url: string,
  timeoutMs = 15_000
): Promise<{ status: number; headers: Headers; json: T | null }> {
  const res = await fetch(url, {
    headers: { ...BROWSER_HEADERS, Accept: "application/json" },
    signal: AbortSignal.timeout(timeoutMs),
  });
  const text = await res.text();
  try {
    return { status: res.status, headers: res.headers, json: JSON.parse(text) as T };
  } catch {
    return { status: res.status, headers: res.headers, json: null };
  }
}
