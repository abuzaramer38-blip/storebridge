"use client";

import { Fragment, useEffect, useState, type ReactNode } from "react";
import type { AuthorityResult } from "@/lib/authority";
import { cn } from "@/lib/utils";

type State = { kind: "loading" } | { kind: "error"; message: string } | { kind: "done"; result: AuthorityResult };

/** Moz's own bands: 1–30% low, 31–60% medium, 61–100% high. */
function spamBand(score: number) {
  if (score <= 30) return { label: "Low risk", className: "text-ok" };
  if (score <= 60) return { label: "Medium risk", className: "text-warn" };
  return { label: "High risk", className: "text-bad" };
}

/** Authority scores for the inspected domain. Mount with a `key` per domain so each lookup starts fresh. */
export function AuthorityBand({ url }: { url: string }) {
  const [state, setState] = useState<State>({ kind: "loading" });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/authority?url=${encodeURIComponent(url)}`);
        const data = await res.json().catch(() => null);
        if (cancelled) return;
        if (!data?.success) setState({ kind: "error", message: data?.error || "Couldn't load scores." });
        else setState({ kind: "done", result: data.result });
      } catch {
        if (!cancelled) setState({ kind: "error", message: "Couldn't load scores." });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [url]);

  if (state.kind === "loading") {
    return (
      <div className="grid grid-cols-3 gap-4" aria-busy="true">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-[74px] animate-pulse rounded-md bg-surface-raised" />
        ))}
      </div>
    );
  }
  if (state.kind === "error") {
    return <p className="text-sm text-text-muted">Authority scores: {state.message}</p>;
  }

  const { ahrefs, moz } = state.result;
  const nothingSetUp = !ahrefs.configured && !moz.configured;

  if (nothingSetUp) {
    return <SetupNote missing={["ahrefs", "moz"]} />;
  }

  const spam = moz.spamScore;
  const band = spam !== null ? spamBand(spam) : null;

  return (
    <div>
      <dl className="grid grid-cols-3 gap-x-4 gap-y-4 sm:gap-x-8">
        <Score
          label="Domain Rating"
          source="Ahrefs, 0–100"
          value={ahrefs.domainRating}
          missing={!ahrefs.configured ? "Add Ahrefs key" : ahrefs.error}
        />
        <Score
          label="Domain Authority"
          source="Moz, 0–100"
          value={moz.domainAuthority}
          missing={!moz.configured ? "Add Moz token" : moz.error}
        />
        <Score
          label="Spam Score"
          source={band ? band.label : "Moz, 0–100%"}
          value={spam}
          suffix="%"
          valueClass={band?.className}
          missing={!moz.configured ? "Add Moz token" : moz.error ?? (spam === null ? "Too little data" : null)}
        />
      </dl>
      <p className="mt-3 text-xs text-text-faint">
        {ahrefs.configured && (
          <>
            <a href="https://ahrefs.com/" target="_blank" rel="noreferrer" className="underline underline-offset-2">
              Domain Rating by Ahrefs
            </a>
            .{" "}
          </>
        )}
        {moz.configured && <>Domain Authority and Spam Score by Moz{moz.pageAuthority !== null ? `; homepage Page Authority ${moz.pageAuthority}` : ""}{moz.linkingDomains !== null ? `; ${moz.linkingDomains.toLocaleString()} linking domains` : ""}. </>}
        Scores are kept for a day to save lookups.
      </p>
      {(!ahrefs.configured || !moz.configured) && (
        <div className="mt-3">
          <SetupNote missing={[!ahrefs.configured && "ahrefs", !moz.configured && "moz"].filter(Boolean) as ("ahrefs" | "moz")[]} />
        </div>
      )}
    </div>
  );
}

function Score({
  label,
  source,
  value,
  suffix = "",
  valueClass,
  missing,
}: {
  label: string;
  source: string;
  value: number | null;
  suffix?: string;
  valueClass?: string;
  missing: string | null;
}) {
  return (
    <div className="border-l-2 border-ink pl-3">
      <dt className="text-sm font-semibold text-ink">{label}</dt>
      <dd>
        {value !== null ? (
          <span className={cn("font-display block text-[2rem] leading-tight sm:text-[2.4rem]", valueClass ?? "text-ink")}>
            {value}
            {suffix}
          </span>
        ) : (
          <span className="block py-2 text-sm text-text-muted">{missing ?? "Not available"}</span>
        )}
        <span className="text-xs text-text-faint">{source}</span>
      </dd>
    </div>
  );
}

function SetupNote({ missing }: { missing: ("ahrefs" | "moz")[] }) {
  const steps: Record<"ahrefs" | "moz", ReactNode> = {
    ahrefs: (
      <li>
        <strong className="text-ink">DR:</strong> make a free API v3 key in your Ahrefs account (Account settings → API
        keys) and save it in Vercel as <code className="rounded bg-surface-raised px-1">AHREFS_API_KEY</code>.
      </li>
    ),
    moz: (
      <li>
        <strong className="text-ink">DA and Spam Score:</strong> create a free Moz API token at moz.com/api (50 lookups a
        month) and save it in Vercel as <code className="rounded bg-surface-raised px-1">MOZ_API_TOKEN</code>.
      </li>
    ),
  };
  return (
    <div className="rounded-lg border border-[#e8c950] bg-marker-soft px-4 py-3 text-sm text-text-muted">
      <p className="font-semibold text-ink">Turn on authority scores</p>
      <ul className="mt-1.5 list-disc space-y-1 pl-5">{missing.map((m) => <Fragment key={m}>{steps[m]}</Fragment>)}</ul>
      <p className="mt-1.5">Vercel → your project → Settings → Environment Variables, then redeploy.</p>
    </div>
  );
}
