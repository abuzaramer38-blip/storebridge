"use client";

import { useEffect, useState, type ReactNode } from "react";
import type { AuthorityResult } from "@/lib/authority";
import { cn } from "@/lib/utils";

type State = { kind: "loading" } | { kind: "error"; message: string } | { kind: "done"; result: AuthorityResult };

/** Moz's own bands: 1–30% low, 31–60% medium, 61–100% high. */
function spamBand(score: number) {
  if (score <= 30) return { label: "Low risk", className: "text-ok" };
  if (score <= 60) return { label: "Medium risk", className: "text-warn" };
  return { label: "High risk", className: "text-bad" };
}

function ageNote(years: number) {
  if (years < 1) return { label: "New domain", className: "text-warn" };
  if (years < 3) return { label: "Young domain", className: "text-ink" };
  return { label: "Established", className: "text-ok" };
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
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3" aria-busy="true">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-[74px] animate-pulse rounded-md bg-surface-raised" />
        ))}
      </div>
    );
  }
  if (state.kind === "error") {
    return <p className="text-sm text-text-muted">Authority scores: {state.message}</p>;
  }

  const { ahrefs, moz, openPageRank: opr, age } = state.result;
  const spam = moz.spamScore;
  const band = spam !== null ? spamBand(spam) : null;
  const ageInfo = age.years !== null ? ageNote(age.years) : null;

  const tiles: ReactNode[] = [
    <Score
      key="dr"
      label="Domain Rating"
      source="Ahrefs, 0–100"
      value={ahrefs.domainRating}
      missing={!ahrefs.configured ? "Add Ahrefs key" : ahrefs.error}
    />,
  ];
  if (moz.configured) {
    tiles.push(
      <Score key="da" label="Domain Authority" source="Moz, 0–100" value={moz.domainAuthority} missing={moz.error} />,
      <Score
        key="spam"
        label="Spam Score"
        source={band ? band.label : "Moz, 0–100%"}
        value={spam}
        suffix="%"
        valueClass={band?.className}
        missing={moz.error ?? "Too little data"}
      />
    );
  }
  tiles.push(
    <Score
      key="opr"
      label="Open PageRank"
      source={opr.globalRank ? `0–10, global rank #${opr.globalRank.toLocaleString()}` : "0–10"}
      value={opr.score}
      missing={!opr.configured ? "Add free key" : opr.error}
    />,
    <Score
      key="age"
      label="Domain age"
      source={age.registered ? `${ageInfo?.label}, since ${age.registered}` : "From the domain registry"}
      value={age.years}
      suffix={age.years !== null ? (age.years === 1 ? " yr" : " yrs") : ""}
      valueClass={ageInfo?.className}
      missing={age.error}
    />
  );

  const missingKeys = [!ahrefs.configured && "ahrefs", !opr.configured && "opr"].filter(Boolean) as ("ahrefs" | "opr")[];

  return (
    <div>
      <dl className={cn("grid grid-cols-2 gap-x-4 gap-y-5 sm:gap-x-8", tiles.length >= 4 ? "sm:grid-cols-4" : "sm:grid-cols-3")}>
        {tiles}
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
        {moz.configured && <>Domain Authority and Spam Score by Moz. </>}
        {opr.configured && <>PageRank from DomCop&apos;s Open PageRank. </>}
        Domain age comes from the public domain registry. Scores are kept for a day.
      </p>
      {missingKeys.length > 0 && (
        <div className="mt-3">
          <SetupNote missing={missingKeys} />
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
          <span className={cn("font-display block text-[1.9rem] leading-tight sm:text-[2.3rem]", valueClass ?? "text-ink")}>
            {value}
            <span className="text-[0.55em]">{suffix}</span>
          </span>
        ) : (
          <span className="block py-2 text-sm text-text-muted">{missing ?? "Not available"}</span>
        )}
        <span className="text-xs text-text-faint">{source}</span>
      </dd>
    </div>
  );
}

function SetupNote({ missing }: { missing: ("ahrefs" | "opr")[] }) {
  return (
    <div className="rounded-lg border border-[#e8c950] bg-marker-soft px-4 py-3 text-sm text-text-muted">
      <p className="font-semibold text-ink">Turn on more scores</p>
      <ul className="mt-1.5 list-disc space-y-1 pl-5">
        {missing.includes("ahrefs") && (
          <li>
            <strong className="text-ink">Domain Rating:</strong> create a free API v3 key in Ahrefs (Account settings → API
            keys) and save it in Vercel as <code className="rounded bg-surface-raised px-1">AHREFS_API_KEY</code>.
          </li>
        )}
        {missing.includes("opr") && (
          <li>
            <strong className="text-ink">Open PageRank:</strong> sign up free at openpagerank.com, copy your API key, and
            save it in Vercel as <code className="rounded bg-surface-raised px-1">OPENPAGERANK_API_KEY</code>.
          </li>
        )}
      </ul>
      <p className="mt-1.5">Vercel → your project → Settings → Environment Variables, then redeploy.</p>
    </div>
  );
}
