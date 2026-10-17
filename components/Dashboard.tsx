"use client";

import { useCallback, useRef, useState, useSyncExternalStore } from "react";
import { ArrowRight, X } from "lucide-react";
import { cn, normalizeUrl } from "@/lib/utils";
import { Button } from "@/components/ui/Button";
import { InspectPanel } from "@/components/InspectPanel";
import { BestsellersPanel } from "@/components/BestsellersPanel";
import { ProductsPanel } from "@/components/ProductsPanel";

export type Tool = "inspect" | "bestsellers" | "products";
export type DetectedPlatform = "shopify" | "woocommerce" | null;

const TOOLS: { id: Tool; name: string; blurb: string; action: string }[] = [
  { id: "inspect", name: "Inspect", blurb: "Platform, theme, plugins, hosting", action: "Inspect store" },
  { id: "bestsellers", name: "Best sellers", blurb: "What sells most, in the store's own order", action: "Find best sellers" },
  { id: "products", name: "Products", blurb: "Pull the full catalog, export a CSV", action: "Fetch products" },
];

const RECENT_KEY = "storebridge:recent";

function readRecent(): string[] {
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list.filter((x) => typeof x === "string").slice(0, 6) : [];
  } catch {
    return [];
  }
}

function writeRecent(list: string[]) {
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(list));
  } catch {
    // storage unavailable (private window) — recent list just won't persist
  }
}

// Tiny external store so the recent list reads localStorage only in the browser.
let recentCache: string[] | null = null;
const recentListeners = new Set<() => void>();
const NO_RECENT: string[] = [];
const recentStore = {
  get: () => (recentCache ??= readRecent()),
  set: (next: string[]) => {
    recentCache = next;
    writeRecent(next);
    recentListeners.forEach((l) => l());
  },
  subscribe: (l: () => void) => {
    recentListeners.add(l);
    return () => {
      recentListeners.delete(l);
    };
  },
};

const host = (url: string) => url.replace(/^https?:\/\//, "").replace(/^www\./, "");

export function Dashboard() {
  const [input, setInput] = useState("");
  const [url, setUrl] = useState<string | null>(null);
  const [tool, setTool] = useState<Tool>("inspect");
  const [runId, setRunId] = useState(0);
  const [detected, setDetected] = useState<DetectedPlatform>(null);
  const recent = useSyncExternalStore(recentStore.subscribe, recentStore.get, () => NO_RECENT);
  const inputRef = useRef<HTMLInputElement>(null);

  const run = useCallback(
    (raw: string, nextTool: Tool = tool) => {
      const trimmed = raw.trim();
      if (!trimmed) {
        inputRef.current?.focus();
        return;
      }
      const normalized = normalizeUrl(trimmed);
      if (normalized !== url) setDetected(null);
      setInput(host(normalized));
      setUrl(normalized);
      setTool(nextTool);
      setRunId((n) => n + 1);
      const h = host(normalized);
      recentStore.set([h, ...recentStore.get().filter((r) => r !== h)].slice(0, 6));
    },
    [tool, url]
  );

  const removeRecent = (r: string) => recentStore.set(recentStore.get().filter((x) => x !== r));

  const active = TOOLS.find((t) => t.id === tool)!;

  return (
    <div className="mx-auto max-w-[1120px] px-4 pb-24 sm:px-8">
      <header className="flex items-baseline justify-between gap-4 py-6">
        <div className="font-display text-xl text-ink">StoreBridge</div>
        <p className="hidden text-sm text-text-muted sm:block">Store research and catalog copying</p>
      </header>

      <section aria-labelledby="hero-title" className="pt-6 pb-8 sm:pt-12">
        <h1 id="hero-title" className="font-display text-[2.6rem] text-ink sm:text-[4.25rem]">
          Which store?
        </h1>
        <p className="mt-3 max-w-[60ch] text-base text-text-muted sm:text-lg">
          Paste a link. See what it runs on, what sells best, or pull its whole catalog.
        </p>

        <form
          className="mt-7 flex flex-col gap-3 sm:flex-row"
          onSubmit={(e) => {
            e.preventDefault();
            run(input);
          }}
        >
          <label htmlFor="store-url" className="sr-only">
            Store link
          </label>
          <div className="flex min-w-0 flex-1 items-center rounded-xl border-2 border-ink bg-surface px-4 focus-within:shadow-[0_0_0_4px_var(--color-marker)]">
            <span className="hidden shrink-0 select-none text-lg text-text-faint sm:inline" aria-hidden="true">
              https://
            </span>
            <input
              id="store-url"
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="pateora.com"
              inputMode="url"
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
              className="font-wide min-w-0 flex-1 bg-transparent py-3.5 text-xl font-semibold text-ink outline-none placeholder:font-normal placeholder:text-text-faint sm:py-4 sm:text-2xl"
            />
            {input && (
              <button
                type="button"
                onClick={() => {
                  setInput("");
                  inputRef.current?.focus();
                }}
                className="rounded-md p-1.5 text-text-faint hover:bg-surface-raised hover:text-ink"
                aria-label="Clear link"
              >
                <X className="h-5 w-5" />
              </button>
            )}
          </div>
          <Button type="submit" variant="primary" size="lg" className="sm:min-w-[210px]" icon={<ArrowRight className="h-5 w-5" />}>
            {active.action}
          </Button>
        </form>

        {recent.length > 0 && (
          <div className="mt-4 flex flex-wrap items-center gap-2 text-sm">
            <span className="text-text-muted">Recent</span>
            {recent.map((r) => (
              <span key={r} className="group inline-flex items-center rounded-full border border-border-strong bg-surface">
                <button
                  type="button"
                  onClick={() => run(r)}
                  className="rounded-l-full py-1 pl-3 pr-1.5 text-ink hover:bg-marker-soft"
                >
                  {r}
                </button>
                <button
                  type="button"
                  onClick={() => removeRecent(r)}
                  className="rounded-r-full py-1 pl-1 pr-2 text-text-faint hover:text-bad"
                  aria-label={`Remove ${r} from recent`}
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </span>
            ))}
          </div>
        )}
      </section>

      <nav aria-label="Tools" className="grid grid-cols-3 border-b-2 border-ink">
        {TOOLS.map((t) => {
          const isActive = t.id === tool;
          return (
            <button
              key={t.id}
              type="button"
              aria-current={isActive ? "page" : undefined}
              onClick={() => setTool(t.id)}
              className={cn(
                "relative -mb-[2px] border-b-[5px] px-1 pb-3 pt-2 text-left transition-colors sm:px-2",
                isActive ? "border-marker" : "border-transparent hover:border-border-strong"
              )}
            >
              <span className={cn("block text-base sm:text-lg", isActive ? "font-bold text-ink" : "font-medium text-text-muted")}>
                {t.name}
              </span>
              <span className="hidden text-sm text-text-faint md:block">{t.blurb}</span>
            </button>
          );
        })}
      </nav>

      <div className="pt-8">
        <div hidden={tool !== "inspect"}>
          <InspectPanel url={url} runId={runId} active={tool === "inspect"} onDetected={setDetected} />
        </div>
        <div hidden={tool !== "bestsellers"}>
          <BestsellersPanel url={url} runId={runId} active={tool === "bestsellers"} onDetected={setDetected} />
        </div>
        <div hidden={tool !== "products"}>
          <ProductsPanel url={url} runId={runId} active={tool === "products"} detected={detected} />
        </div>
      </div>
    </div>
  );
}
