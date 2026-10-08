import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { getReviewQueue } from "../lib/api";
import type { SneakersMeta } from "../lib/api";
import type { ReviewQueueRow } from "../lib/types";

const PAGE_SIZE = 25;

const FIELD_LABELS: Record<string, string> = {
  brand: "Brand",
  model: "Model",
  sku: "SKU",
  size: "Size",
  colorway: "Colorway",
  condition: "Condition",
};

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? ""
    : new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(date);
}

/**
 * Pairs whose latest AI analysis has a key field below 0.8 confidence
 * and that aren't verified yet, oldest first. Each opens the workspace
 * with previous/next through this queue.
 */
export default function ReviewQueuePage() {
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState<ReviewQueueRow[]>([]);
  const [meta, setMeta] = useState<SneakersMeta | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let current = true;
    getReviewQueue(page, PAGE_SIZE)
      .then((response) => {
        if (!current) return;
        setRows(response.results);
        setMeta(response.meta);
        setError(false);
      })
      .catch(() => {
        if (current) setError(true);
      })
      .finally(() => {
        if (current) setLoading(false);
      });
    return () => {
      current = false;
    };
  }, [page, attempt]);

  function go(next: number) {
    setLoading(true);
    setPage(next);
  }

  const total = meta?.count ?? 0;

  return (
    <div className="min-h-screen bg-gray-50">
      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <h1 className="text-2xl font-semibold tracking-tight text-gray-900">
          Review queue
        </h1>
        <p className="mt-1 text-sm text-gray-500">
          Pairs where the AI is unsure of at least one field (below 80%
          confidence), oldest first.
        </p>

        <section className="mt-6 overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
          {error ? (
            <div className="px-6 py-16 text-center">
              <h2 className="text-sm font-semibold text-gray-900">
                Couldn't load the review queue
              </h2>
              <p className="mt-1 text-sm text-gray-500">
                Check your connection and try again.
              </p>
              <button
                type="button"
                onClick={() => {
                  setLoading(true);
                  setError(false);
                  setAttempt((n) => n + 1);
                }}
                className="mt-4 rounded-xl bg-gray-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-gray-800"
              >
                Try again
              </button>
            </div>
          ) : loading && rows.length === 0 ? (
            <ul className="divide-y divide-gray-100" aria-label="Loading review queue">
              {Array.from({ length: 6 }).map((_, i) => (
                <li key={i} className="animate-pulse px-5 py-4">
                  <div className="h-3.5 w-40 rounded bg-gray-200" />
                  <div className="mt-2 h-3 w-64 rounded bg-gray-200" />
                </li>
              ))}
            </ul>
          ) : rows.length === 0 ? (
            <p className="px-6 py-16 text-center text-sm text-gray-500">
              Nothing to review: every analysed pair is confident or verified.
            </p>
          ) : (
            <ul className={`divide-y divide-gray-100 ${loading ? "opacity-60" : ""}`}>
              {rows.map((row) => (
                <li key={row.run_id}>
                  <Link
                    to={`/sneakers/${row.sneaker_pair}?from=queue`}
                    className="flex items-center gap-4 px-5 py-4 transition hover:bg-gray-50/70"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-mono text-sm font-semibold text-gray-900">
                        {row.sneaker_pair_id}
                      </p>
                      <p className="mt-0.5 truncate text-xs text-gray-500">
                        {[row.brand, row.model].filter(Boolean).join(" ") ||
                          "Not identified"}
                        {" · analysed "}
                        {formatDate(row.created_at)}
                      </p>
                    </div>
                    <ul className="hidden flex-wrap justify-end gap-1 sm:flex">
                      {row.low_fields.map((field) => (
                        <li
                          key={field}
                          className="rounded-md bg-amber-50 px-1.5 py-0.5 text-[11px] font-medium text-amber-700"
                        >
                          {FIELD_LABELS[field] ?? field}
                        </li>
                      ))}
                    </ul>
                    <span aria-hidden="true" className="material-symbols-outlined text-[20px] text-gray-300">
                      chevron_right
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}

          {!error && total > 0 && (
            <div className="flex items-center justify-between border-t border-gray-100 px-5 py-3 text-sm text-gray-500">
              <span>{total} to review</span>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => go(page - 1)}
                  disabled={!meta?.previous || loading}
                  className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-40"
                >
                  Previous
                </button>
                <button
                  type="button"
                  onClick={() => go(page + 1)}
                  disabled={!meta?.next || loading}
                  className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-40"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
