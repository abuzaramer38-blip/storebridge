import { type ClassValue, clsx } from "clsx";

/** Merge conditional class names. Thin wrapper so call sites stay tidy. */
export function cn(...inputs: ClassValue[]) {
  return clsx(inputs);
}

/** Turn a title into a Shopify-safe handle (lowercase, hyphenated). */
export function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 255) || "product";
}

export function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function formatMoney(value: number | null): string {
  if (value === null || Number.isNaN(value)) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(value);
}

/** Normalize whatever the person typed (with/without protocol, trailing slash, etc.) into a clean origin. */
export function normalizeUrl(input: string): string {
  let value = input.trim();
  if (!/^https?:\/\//i.test(value)) {
    value = `https://${value}`;
  }
  return value.replace(/\/+$/, "");
}

/** Trigger a browser download of in-memory text content — no server round trip needed. */
export function downloadTextFile(filename: string, content: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/** Run a batch of promise-returning tasks with a concurrency cap. */
export async function withConcurrency<T, R>(
  items: T[],
  limit: number,
  worker: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;

  async function run() {
    while (cursor < items.length) {
      const current = cursor;
      cursor += 1;
      results[current] = await worker(items[current], current);
    }
  }

  const runners = Array.from({ length: Math.min(limit, items.length) }, run);
  await Promise.all(runners);
  return results;
}
