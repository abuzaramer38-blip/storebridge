"use client";

import { useEffect, useRef } from "react";

function useLatest<T>(value: T) {
  const ref = useRef(value);
  useEffect(() => {
    ref.current = value;
  });
  return ref;
}

/**
 * Run `fn` when this tool is showing and hasn't yet run for the current link + submission.
 * Switching back to a tab that already ran doesn't refetch; a new submission does.
 */
export function useAutoRun(active: boolean, url: string | null, runId: number, fn: (url: string) => void) {
  const lastKey = useRef<string | null>(null);
  const fnRef = useLatest(fn);

  useEffect(() => {
    if (!active || !url) return;
    const key = `${url}#${runId}`;
    if (key === lastKey.current) return;
    lastKey.current = key;
    fnRef.current(url);
  }, [active, url, runId, fnRef]);
}

/** Run `fn` only for submissions made while this tool is showing — not when switching to it. */
export function useRunOnSubmit(active: boolean, url: string | null, runId: number, fn: (url: string) => void) {
  const seen = useRef(runId);
  const fnRef = useLatest(fn);

  useEffect(() => {
    if (runId === seen.current) return;
    seen.current = runId;
    if (active && url) fnRef.current(url);
  }, [active, url, runId, fnRef]);
}
