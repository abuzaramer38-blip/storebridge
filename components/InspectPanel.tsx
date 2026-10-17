"use client";

import { useCallback, useState, type ReactNode } from "react";
import { ExternalLink, ScanSearch } from "lucide-react";
import type { InspectResult } from "@/lib/inspect";
import { Badge, PlatformMark } from "@/components/ui/Badge";
import { EmptyState, Notice } from "@/components/ui/Feedback";
import type { DetectedPlatform } from "@/components/Dashboard";
import { useAutoRun } from "@/components/useAutoRun";
import { AuthorityBand } from "@/components/AuthorityBand";

type State =
  | { kind: "idle" }
  | { kind: "loading"; url: string }
  | { kind: "error"; url: string; message: string }
  | { kind: "done"; result: InspectResult };

const host = (url: string) => url.replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/$/, "");

export function InspectPanel({
  url,
  runId,
  active,
  onDetected,
}: {
  url: string | null;
  runId: number;
  active: boolean;
  onDetected: (p: DetectedPlatform) => void;
}) {
  const [state, setState] = useState<State>({ kind: "idle" });

  const inspect = useCallback(
    async (target: string) => {
      setState({ kind: "loading", url: target });
      try {
        const res = await fetch(`/api/inspect?url=${encodeURIComponent(target)}`);
        const data = await res.json().catch(() => null);
        if (!data?.success) throw new Error(data?.error || `The lookup failed (HTTP ${res.status}).`);
        const result = data.result as InspectResult;
        setState({ kind: "done", result });
        const id = result.platform.id;
        onDetected(id === "shopify" ? "shopify" : id === "woocommerce" ? "woocommerce" : null);
      } catch (err) {
        setState({ kind: "error", url: target, message: err instanceof Error ? err.message : "The lookup failed." });
      }
    },
    [onDetected]
  );

  useAutoRun(active, url, runId, inspect);

  if (state.kind === "idle") {
    return (
      <EmptyState
        icon={<ScanSearch className="h-7 w-7 text-text-faint" strokeWidth={1.5} />}
        title="Find out what a store is built with"
        description="Paste any store link above. You'll see its platform, theme and parent theme, page builder, plugins, hosting and product count."
      />
    );
  }

  if (state.kind === "loading") {
    return (
      <div className="label-sheet p-6 sm:p-8" aria-busy="true">
        <p className="text-text-muted">Looking at {host(state.url)}…</p>
        <div className="mt-5 space-y-3">
          <div className="h-9 w-64 animate-pulse rounded-md bg-surface-raised" />
          <div className="h-5 w-80 max-w-full animate-pulse rounded-md bg-surface-raised" />
          <div className="h-5 w-56 animate-pulse rounded-md bg-surface-raised" />
        </div>
      </div>
    );
  }

  if (state.kind === "error") {
    return (
      <Notice tone="error">
        Couldn&apos;t inspect {host(state.url)}. {state.message}
      </Notice>
    );
  }

  const r = state.result;
  const stack =
    r.platform.id === "woocommerce"
      ? `Runs on WordPress${r.cms?.version ? ` ${r.cms.version}` : ""} with WooCommerce${r.shop?.version ? ` ${r.shop.version}` : ""}.`
      : r.platform.id === "wordpress"
        ? `A WordPress${r.cms?.version ? ` ${r.cms.version}` : ""} site without a WooCommerce shop.`
        : r.platform.id === "shopify"
          ? "A hosted Shopify store."
          : r.platform.id === "unknown"
            ? "We couldn't match this site to a known store platform."
            : `Built on ${r.platform.name}.`;

  const hostingParts = [
    r.hosting.host && `${r.hosting.host} hosting`,
    r.hosting.server && `${r.hosting.server} server`,
    r.hosting.cdn && `${r.hosting.cdn} in front`,
  ].filter(Boolean) as string[];

  return (
    <article className="label-sheet animate-stamp overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b-2 border-ink px-6 py-3 sm:px-8">
        <a
          href={r.finalUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1.5 font-semibold text-ink underline-offset-4 hover:underline"
        >
          {host(r.finalUrl)}
          <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
        </a>
        {r.title && <span className="max-w-full truncate text-sm text-text-muted sm:max-w-[50%]">{r.title}</span>}
      </div>

      <div className="px-6 pt-6 sm:px-8 sm:pt-8">
        <h2 className="font-display text-[2rem] text-ink sm:text-[2.75rem]">
          <PlatformMark id={r.platform.id} name={r.platform.name} />
        </h2>
        <p className="mt-2 text-lg text-text-muted">{stack}</p>
      </div>

      <div className="mt-6 border-t border-border px-6 pt-5 sm:px-8">
        <AuthorityBand key={r.url} url={r.url} />
      </div>

      <dl className="mt-6 grid gap-x-10 border-t border-border px-6 sm:grid-cols-2 sm:px-8">
        <Row label="Theme" wide>
          {r.theme ? (
            <div>
              <span className="marker font-wide text-2xl font-bold text-ink">{r.theme.name}</span>
              {r.theme.version && <span className="ml-2 text-text-muted">version {r.theme.version}</span>}
              <div className="mt-1.5 space-y-0.5 text-sm text-text-muted">
                {r.theme.parent && (
                  <div>
                    Child theme of <span className="font-semibold text-ink">{r.theme.parent.name}</span>
                  </div>
                )}
                {r.theme.renamedTo && (
                  <div>
                    The store renamed its copy to <span className="text-ink">“{r.theme.renamedTo}”</span>
                  </div>
                )}
                {r.theme.author && (
                  <div>
                    Made by{" "}
                    {r.theme.authorUrl ? (
                      <a href={r.theme.authorUrl} target="_blank" rel="noreferrer" className="text-ink underline underline-offset-2">
                        {r.theme.author}
                      </a>
                    ) : (
                      <span className="text-ink">{r.theme.author}</span>
                    )}
                  </div>
                )}
                {r.theme.slug && <div>Folder: /wp-content/themes/{r.theme.slug}</div>}
                {r.platform.id === "shopify" && (
                  <div>{r.theme.themeStoreId ? `Shopify Theme Store #${r.theme.themeStoreId}` : "Not from the Shopify Theme Store"}</div>
                )}
              </div>
            </div>
          ) : (
            <span className="text-text-muted">Not visible</span>
          )}
        </Row>

        {r.pageBuilders.length > 0 && <Row label="Page builder">{r.pageBuilders.join(", ")}</Row>}
        <Row label="Products">
          {r.productCount !== null ? (
            <>
              <span className="font-wide text-xl font-bold text-ink">{r.productCount.toLocaleString()}</span>
              {r.currency && <span className="ml-2 text-text-muted">priced in {r.currency}</span>}
            </>
          ) : (
            <span className="text-text-muted">Not public</span>
          )}
        </Row>
        <Row label="Hosting">{hostingParts.length ? hostingParts.join(", ") : <span className="text-text-muted">Not shown</span>}</Row>
      </dl>

      {r.plugins.length > 0 && (
        <div className="border-t border-border px-6 py-5 sm:px-8">
          <h3 className="text-sm font-semibold text-ink">
            Plugins we can see <span className="font-normal text-text-muted">({r.plugins.length})</span>
          </h3>
          <ul className="mt-3 flex flex-wrap gap-1.5">
            {r.plugins.map((p) => (
              <li key={p.slug}>
                <Badge tone={p.slug === "woocommerce" ? "woo" : "neutral"} className="text-sm">
                  {p.name}
                </Badge>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-text-faint">
            Only plugins that load files on the homepage or add an API show up here. Others may be installed too.
          </p>
        </div>
      )}

      {(r.platform.evidence.length > 0 || r.notes.length > 0) && (
        <div className="space-y-3 border-t border-border bg-surface-hover px-6 py-5 sm:px-8">
          {r.platform.evidence.length > 0 && (
            <p className="text-sm text-text-muted">
              <span className="font-semibold text-ink">How we can tell: </span>
              {r.platform.evidence.join("; ")}.
            </p>
          )}
          {r.notes.map((n) => (
            <Notice key={n} tone={r.blocked ? "wait" : "info"}>
              {n}
            </Notice>
          ))}
        </div>
      )}
    </article>
  );
}

function Row({ label, children, wide }: { label: string; children: ReactNode; wide?: boolean }) {
  return (
    <div className={`border-b border-border py-4 last:border-b-0 ${wide ? "sm:col-span-2" : ""}`}>
      <dt className="text-sm text-text-muted">{label}</dt>
      <dd className="mt-1 text-ink">{children}</dd>
    </div>
  );
}
