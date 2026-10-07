import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { getSneakers, type SneakersMeta } from "../lib/api";
import { angleSlots, CAPTURE_ANGLES } from "../lib/verification";
import type { SneakerPair } from "../lib/types";

const PAGE_SIZE = 25;

/* SneakerPair.Status values on the backend, in workflow order. */
const TABS = [
  { status: "verification", label: "Awaiting verification" },
  { status: "identification", label: "Identification" },
  { status: "received", label: "Received" },
  { status: "verified", label: "Verified" },
] as const;

type TabStatus = (typeof TABS)[number]["status"];

const EMPTY_TEXT: Record<TabStatus, string> = {
  verification: "No pairs are waiting for verification.",
  identification: "No pairs are in identification.",
  received: "No pairs are waiting to be identified.",
  verified: "No pairs have been verified yet.",
};

function capturedAngles(pair: SneakerPair) {
  return angleSlots(pair)
    .slice(0, CAPTURE_ANGLES.length)
    .filter((slot) => slot.image).length;
}

function RowSkeleton() {
  return (
    <li className="flex animate-pulse items-center gap-4 px-5 py-4">
      <div className="h-10 w-10 rounded-xl bg-gray-200" />
      <div className="flex-1 space-y-2">
        <div className="h-3.5 w-40 rounded bg-gray-200" />
        <div className="h-3 w-24 rounded bg-gray-200" />
      </div>
      <div className="hidden h-3 w-16 rounded bg-gray-200 sm:block" />
    </li>
  );
}

/** The verification queue: pairs by workflow stage, each opening its workspace. */
export default function VerificationPage() {
  const [status, setStatus] = useState<TabStatus>("verification");
  const [page, setPage] = useState(1);
  const [pairs, setPairs] = useState<SneakerPair[]>([]);
  const [meta, setMeta] = useState<SneakersMeta | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  // Bumped by "Try again" to re-run the effect for the same page.
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let current = true;

    getSneakers({
      status,
      page,
      page_size: PAGE_SIZE,
      // Oldest first, so the queue is worked in intake order.
      ordering: "created_at",
    })
      .then((response) => {
        if (!current) return;
        setPairs(response.results);
        setMeta(response.meta);
        setError(false);
      })
      .catch(() => {
        if (current) setError(true);
      })
      .finally(() => {
        if (current) setLoading(false);
      });

    // A slower response for an earlier tab or page must not win.
    return () => {
      current = false;
    };
  }, [status, page, attempt]);

  function show(next: { status?: TabStatus; page?: number }) {
    setLoading(true);
    if (next.status !== undefined) {
      setStatus(next.status);
      setPage(1);
      setPairs([]);
    }
    if (next.page !== undefined) setPage(next.page);
  }

  const total = meta?.count ?? 0;
  const first = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const last = Math.min(page * PAGE_SIZE, total);

  return (
    <div className="min-h-screen bg-gray-50">
      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <h1 className="text-2xl font-semibold tracking-tight text-gray-900">
          Verification
        </h1>
        <p className="mt-1 text-sm text-gray-500">
          Review each pair's photos and data, correct anything that's wrong,
          and mark it verified.
        </p>

        <div
          role="tablist"
          aria-label="Workflow stage"
          className="mt-6 flex gap-1 overflow-x-auto rounded-xl bg-gray-100 p-1"
        >
          {TABS.map((tab) => (
            <button
              key={tab.status}
              type="button"
              role="tab"
              aria-selected={status === tab.status}
              onClick={() => {
                if (tab.status !== status) show({ status: tab.status });
              }}
              className={`shrink-0 rounded-lg px-3.5 py-2 text-sm font-medium transition ${
                status === tab.status
                  ? "bg-white text-gray-900 shadow-sm"
                  : "text-gray-500 hover:text-gray-900"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <section className="mt-4 overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
          {error ? (
            <div className="px-6 py-16 text-center">
              <span aria-hidden="true" className="material-symbols-outlined text-[28px] text-red-500">
                error
              </span>
              <h2 className="mt-3 text-sm font-semibold text-gray-900">
                Couldn't load pairs
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
                className="mt-4 inline-flex items-center gap-2 rounded-xl bg-gray-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-gray-800"
              >
                <span aria-hidden="true" className="material-symbols-outlined text-[18px]">
                  refresh
                </span>
                Try again
              </button>
            </div>
          ) : loading && pairs.length === 0 ? (
            <ul className="divide-y divide-gray-100">
              {Array.from({ length: 6 }).map((_, index) => (
                <RowSkeleton key={index} />
              ))}
            </ul>
          ) : pairs.length === 0 ? (
            <div className="px-6 py-16 text-center">
              <span aria-hidden="true" className="material-symbols-outlined text-[28px] text-gray-400">
                task_alt
              </span>
              <p className="mt-3 text-sm text-gray-500">
                {EMPTY_TEXT[status]}
              </p>
            </div>
          ) : (
            <ul
              className={`divide-y divide-gray-100 ${
                loading ? "opacity-60" : ""
              }`}
            >
              {pairs.map((pair) => {
                const angles = capturedAngles(pair);
                const summary = [pair.brand, pair.model]
                  .filter(Boolean)
                  .join(" ");

                return (
                  <li key={pair.id}>
                    <Link
                      to={`/sneakers/${pair.id}`}
                      className="group flex items-center gap-4 px-5 py-4 transition hover:bg-gray-50/70"
                    >
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gray-100 text-gray-500 transition group-hover:bg-gray-900 group-hover:text-white">
                        <span aria-hidden="true" className="material-symbols-outlined text-[20px]">
                          footprint
                        </span>
                      </div>

                      <div className="min-w-0 flex-1">
                        <p className="truncate font-mono text-sm font-semibold text-gray-900">
                          {pair.pair_id ?? pair.id}
                        </p>
                        <p className="mt-0.5 truncate text-xs text-gray-500">
                          {summary || "Brand and model not recorded"}
                          {pair.size ? ` · Size ${pair.size}` : ""}
                        </p>
                      </div>

                      <span
                        className={`hidden shrink-0 text-xs sm:inline ${
                          angles < CAPTURE_ANGLES.length
                            ? "text-amber-700"
                            : "text-gray-500"
                        }`}
                      >
                        {angles}/{CAPTURE_ANGLES.length} photos
                      </span>

                      <span aria-hidden="true" className="material-symbols-outlined shrink-0 text-[20px] text-gray-300 transition group-hover:text-gray-600">
                        chevron_right
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}

          {!error && total > 0 && (
            <div className="flex items-center justify-between gap-3 border-t border-gray-100 px-5 py-3 text-sm text-gray-500">
              <span>
                {first}–{last} of {total}
              </span>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => show({ page: page - 1 })}
                  disabled={!meta?.previous || loading}
                  className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 font-medium text-gray-700 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Previous
                </button>
                <button
                  type="button"
                  onClick={() => show({ page: page + 1 })}
                  disabled={!meta?.next || loading}
                  className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 font-medium text-gray-700 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
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
