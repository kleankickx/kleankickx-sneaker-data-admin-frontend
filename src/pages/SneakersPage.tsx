import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import type { SneakerPair } from "../lib/types";
import {
  getSneakers,
  getPairsWithoutImages,
  deletePairsWithoutImages,
  type SneakersMeta,
  type PairsWithoutImagesPreview,
} from "../lib/api";
import { CONDITION_OPTIONS, conditionLabel } from "../lib/conditions";

const PAGE_SIZE = 25;

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

function getPairId(pair: SneakerPair) {
  return pair.pair_id ?? pair.id;
}

function formatDate(value: string | null | undefined) {
  if (!value) return "—";

  return new Intl.DateTimeFormat("en-GH", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}

function formatStatus(value: string | null | undefined) {
  if (!value) return "Unknown";

  return value
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function statusTone(status: string | null | undefined) {
  switch (status?.toLowerCase()) {
    case "received":
      return {
        badge: "bg-sky-50 text-sky-700 ring-sky-600/20",
        dot: "bg-sky-500",
      };

    case "identification":
      return {
        badge: "bg-violet-50 text-violet-700 ring-violet-600/20",
        dot: "bg-violet-500",
      };

    case "verification":
      return {
        badge: "bg-amber-50 text-amber-700 ring-amber-600/20",
        dot: "bg-amber-500",
      };

    case "verified":
      return {
        badge: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
        dot: "bg-emerald-500",
      };

    case "rejected":
      return {
        badge: "bg-rose-50 text-rose-700 ring-rose-600/20",
        dot: "bg-rose-500",
      };

    default:
      return {
        badge: "bg-gray-100 text-gray-700 ring-gray-500/20",
        dot: "bg-gray-400",
      };
  }
}

function conditionTone(condition: string | null | undefined) {
  switch (condition?.toLowerCase()) {
    case "new":
    case "like_new":
      return "bg-emerald-50 text-emerald-700 ring-emerald-600/20";

    case "good":
      return "bg-sky-50 text-sky-700 ring-sky-600/20";

    case "fair":
      return "bg-amber-50 text-amber-700 ring-amber-600/20";

    case "poor":
      return "bg-rose-50 text-rose-700 ring-rose-600/20";

    default:
      return "bg-gray-100 text-gray-700 ring-gray-500/20";
  }
}

function countCapturedImages(pair: SneakerPair) {
  const sessions = pair.capture_sessions ?? [];

  let uploaded = 0;
  let total = 0;

  for (const session of sessions) {
    const images = session.images ?? [];

    total += images.length;

    for (const image of images) {
      const isUploaded =
        image.status?.toLowerCase() === "uploaded" &&
        Boolean(image.image_url);

      if (isUploaded) {
        uploaded += 1;
      }
    }
  }

  return { uploaded, total };
}

function getErrorMessage(error: any) {
  return (
    error?.response?.data?.error?.message ||
    error?.response?.data?.message ||
    error?.message ||
    "Something went wrong while loading the sneakers."
  );
}

function getPaginationItems(
  currentPage: number,
  totalPages: number,
): Array<number | "..."> {
  if (totalPages <= 7) {
    return Array.from(
      { length: totalPages },
      (_, index) => index + 1,
    );
  }

  const pages: Array<number | "..."> = [];

  pages.push(1);

  if (currentPage > 4) {
    pages.push("...");
  }

  const start = Math.max(2, currentPage - 1);
  const end = Math.min(
    totalPages - 1,
    currentPage + 1,
  );

  for (let page = start; page <= end; page += 1) {
    pages.push(page);
  }

  if (currentPage < totalPages - 3) {
    pages.push("...");
  }

  pages.push(totalPages);

  return pages;
}

/* -------------------------------------------------------------------------- */
/* Skeleton                                                                   */
/* -------------------------------------------------------------------------- */

function SkeletonRow() {
  return (
    <tr>
      <td className="px-6 py-4">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 animate-pulse rounded-lg bg-gray-200" />

          <div className="space-y-2">
            <div className="h-3.5 w-28 animate-pulse rounded bg-gray-200" />
            <div className="h-3 w-20 animate-pulse rounded bg-gray-200" />
          </div>
        </div>
      </td>

      <td className="px-6 py-4">
        <div className="h-4 w-24 animate-pulse rounded bg-gray-200" />
      </td>

      <td className="px-6 py-4">
        <div className="h-4 w-28 animate-pulse rounded bg-gray-200" />
      </td>

      <td className="px-6 py-4">
        <div className="h-4 w-24 animate-pulse rounded bg-gray-200" />
      </td>

      <td className="px-6 py-4">
        <div className="h-4 w-12 animate-pulse rounded bg-gray-200" />
      </td>

      <td className="px-6 py-4">
        <div className="h-6 w-16 animate-pulse rounded-full bg-gray-200" />
      </td>

      <td className="px-6 py-4">
        <div className="h-6 w-20 animate-pulse rounded-full bg-gray-200" />
      </td>

      <td className="px-6 py-4">
        <div className="h-4 w-16 animate-pulse rounded bg-gray-200" />
      </td>

      <td className="px-6 py-4">
        <div className="h-4 w-20 animate-pulse rounded bg-gray-200" />
      </td>
    </tr>
  );
}

/* -------------------------------------------------------------------------- */
/* Images cell                                                                */
/* -------------------------------------------------------------------------- */

function ImagesCell({
  uploaded,
  total,
}: {
  uploaded: number;
  total: number;
}) {
  if (total === 0) {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-gray-400">
        <span className="material-symbols-outlined text-[16px]">
          image_not_supported
        </span>
        None
      </span>
    );
  }

  if (uploaded === total) {
    return (
      <span
        className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-medium text-emerald-700 ring-1 ring-inset ring-emerald-600/20"
        title={`${uploaded} of ${total} images uploaded`}
      >
        <span className="material-symbols-outlined text-[14px]">
          check_circle
        </span>

        {uploaded}
      </span>
    );
  }

  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-2.5 py-1 text-[11px] font-medium text-amber-700 ring-1 ring-inset ring-amber-600/20"
      title={`${uploaded} of ${total} images uploaded`}
    >
      <span className="material-symbols-outlined text-[14px]">
        photo_library
      </span>

      {uploaded}
      <span className="text-amber-500">/ {total}</span>
    </span>
  );
}

/* -------------------------------------------------------------------------- */
/* Cleanup modal                                                              */
/* -------------------------------------------------------------------------- */

function CleanupModal({
  open,
  loading,
  deleting,
  error,
  preview,
  confirming,
  onClose,
  onConfirmStage,
  onDelete,
}: {
  open: boolean;
  loading: boolean;
  deleting: boolean;
  error: string | null;
  preview: PairsWithoutImagesPreview | null;
  confirming: boolean;
  onClose: () => void;
  onConfirmStage: () => void;
  onDelete: () => void;
}) {
  useEffect(() => {
    if (!open) return;

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !deleting) {
        onClose();
      }
    }

    window.addEventListener("keydown", onKeyDown);

    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open, deleting, onClose]);

  if (!open) return null;

  const hasPairs = Boolean(preview && preview.count > 0);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={() => {
        if (!deleting) onClose();
      }}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="w-full max-w-lg overflow-hidden rounded-2xl bg-white shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        {/* Header */}
        <div className="border-b border-gray-200 px-6 py-5">
          <div className="flex items-start gap-4">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-amber-50">
              <span className="material-symbols-outlined text-[22px] text-amber-600">
                cleaning_services
              </span>
            </div>

            <div className="min-w-0 flex-1">
              <h2 className="text-base font-semibold text-gray-900">
                Clean up pairs without images
              </h2>

              <p className="mt-1 text-sm text-gray-500">
                Sneaker pairs with no uploaded capture
                images.
              </p>
            </div>

            <button
              type="button"
              disabled={deleting}
              onClick={onClose}
              className="text-gray-400 transition hover:text-gray-700 disabled:opacity-40"
              aria-label="Close"
            >
              <span className="material-symbols-outlined">
                close
              </span>
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="max-h-[60vh] overflow-y-auto px-6 py-6">
          {loading && (
            <div className="flex items-center justify-center gap-2 py-8 text-sm text-gray-500">
              <span className="material-symbols-outlined animate-spin text-[18px]">
                progress_activity
              </span>
              Scanning for pairs without images…
            </div>
          )}

          {!loading && error && (
            <div className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4">
              <span className="material-symbols-outlined text-[20px] text-red-600">
                error
              </span>

              <p className="flex-1 text-sm text-red-700">
                {error}
              </p>
            </div>
          )}

          {!loading && !error && preview && preview.count === 0 && (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-50">
                <span className="material-symbols-outlined text-[28px] text-emerald-600">
                  check_circle
                </span>
              </div>

              <h3 className="mt-4 text-sm font-semibold text-gray-900">
                Nothing to clean up
              </h3>

              <p className="mt-1 max-w-sm text-sm text-gray-500">
                Every sneaker pair has at least one
                uploaded image.
              </p>
            </div>
          )}

          {!loading && !error && hasPairs && preview && (
            <div className="space-y-4">
              <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4">
                <span className="material-symbols-outlined text-[20px] text-amber-600">
                  warning
                </span>

                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-amber-900">
                    {preview.count.toLocaleString()} pair
                    {preview.count === 1 ? "" : "s"} will be
                    deleted
                  </p>

                  <p className="mt-0.5 text-xs text-amber-700">
                    This action cannot be undone. Related
                    capture sessions and identification
                    records will be removed too.
                  </p>
                </div>
              </div>

              {preview.preview.length > 0 && (
                <div>
                  <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-gray-400">
                    Preview
                  </p>

                  <ul className="divide-y divide-gray-100 overflow-hidden rounded-xl border border-gray-200">
                    {preview.preview.map((pair) => (
                      <li
                        key={pair.id}
                        className="flex items-center justify-between gap-3 px-4 py-3"
                      >
                        <div className="min-w-0">
                          <p className="truncate font-mono text-xs font-medium text-gray-900">
                            {pair.pair_id ?? pair.id}
                          </p>

                          <p className="mt-0.5 truncate text-xs text-gray-500">
                            {[pair.brand, pair.model]
                              .filter(Boolean)
                              .join(" · ") ||
                              "No brand or model"}
                          </p>
                        </div>

                        <span className="shrink-0 text-[11px] capitalize text-gray-400">
                          {pair.status}
                        </span>
                      </li>
                    ))}
                  </ul>

                  {preview.count > preview.preview.length && (
                    <p className="mt-2 text-xs text-gray-500">
                      And{" "}
                      {preview.count - preview.preview.length}{" "}
                      more…
                    </p>
                  )}
                </div>
              )}

              {confirming && (
                <div className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4">
                  <span className="material-symbols-outlined text-[20px] text-red-600">
                    error
                  </span>

                  <p className="flex-1 text-sm font-medium text-red-800">
                    Are you absolutely sure? This will
                    permanently delete{" "}
                    {preview.count.toLocaleString()} pair
                    {preview.count === 1 ? "" : "s"}.
                  </p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 border-t border-gray-100 bg-gray-50/60 px-6 py-4">
          <button
            type="button"
            disabled={deleting}
            onClick={onClose}
            className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50 disabled:opacity-50"
          >
            Cancel
          </button>

          {hasPairs && (
            <button
              type="button"
              disabled={deleting}
              onClick={() => {
                if (!confirming) {
                  onConfirmStage();
                  return;
                }
                onDelete();
              }}
              className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-red-700 disabled:opacity-50"
            >
              {deleting && (
                <span className="material-symbols-outlined animate-spin text-[16px]">
                  progress_activity
                </span>
              )}

              {confirming
                ? "Yes, delete permanently"
                : "Delete pairs"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Page                                                                       */
/* -------------------------------------------------------------------------- */

export default function SneakersPage() {
  const [sneakers, setSneakers] = useState<SneakerPair[]>(
    [],
  );

  const [meta, setMeta] = useState<SneakersMeta>({
    count: 0,
    next: null,
    previous: null,
  });

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [page, setPage] = useState(1);

  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");

  const [statusFilter, setStatusFilter] = useState("");
  const [conditionFilter, setConditionFilter] = useState("");
  const [brandFilter, setBrandFilter] = useState("");

  const [ordering, setOrdering] =
    useState("-created_at");

  const [refreshing, setRefreshing] = useState(false);

  /* Cleanup state */
  const [showCleanup, setShowCleanup] = useState(false);
  const [cleanupPreview, setCleanupPreview] =
    useState<PairsWithoutImagesPreview | null>(null);
  const [cleanupLoading, setCleanupLoading] = useState(false);
  const [cleanupDeleting, setCleanupDeleting] = useState(false);
  const [cleanupError, setCleanupError] = useState<string | null>(
    null,
  );
  const [cleanupConfirming, setCleanupConfirming] = useState(false);

  /* ------------------------------------------------------------------------ */
  /* Load                                                                     */
  /* ------------------------------------------------------------------------ */

  async function loadSneakers(
    showRefreshState = false,
  ) {
    try {
      if (showRefreshState) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }

      setError(null);

      const response = await getSneakers({
        page,
        page_size: PAGE_SIZE,
        search: search || undefined,
        status: statusFilter || undefined,
        condition: conditionFilter || undefined,
        brand: brandFilter || undefined,
        ordering,
      });

      setSneakers(response.results);
      setMeta(response.meta);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => {
    loadSneakers();
  }, [
    page,
    search,
    statusFilter,
    conditionFilter,
    brandFilter,
    ordering,
  ]);

  /* ------------------------------------------------------------------------ */
  /* Search debounce                                                          */
  /* ------------------------------------------------------------------------ */

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setPage(1);
      setSearch(searchInput.trim());
    }, 350);

    return () => {
      window.clearTimeout(timeout);
    };
  }, [searchInput]);

  /* ------------------------------------------------------------------------ */
  /* Cleanup handlers                                                         */
  /* ------------------------------------------------------------------------ */

  async function openCleanup() {
    setShowCleanup(true);
    setCleanupConfirming(false);
    setCleanupError(null);
    setCleanupPreview(null);
    setCleanupLoading(true);

    try {
      const preview = await getPairsWithoutImages();
      setCleanupPreview(preview);
    } catch (err) {
      setCleanupError(getErrorMessage(err));
    } finally {
      setCleanupLoading(false);
    }
  }

  function closeCleanup() {
    if (cleanupDeleting) return;

    setShowCleanup(false);
    setCleanupPreview(null);
    setCleanupConfirming(false);
    setCleanupError(null);
  }

  async function handleCleanupDelete() {
    setCleanupDeleting(true);
    setCleanupError(null);

    try {
      await deletePairsWithoutImages();

      closeCleanup();

      // Reload the list so deleted pairs disappear.
      // Also jump to page 1 to avoid landing on an
      // empty page after mass deletion.
      setPage(1);

      await loadSneakers(true);
    } catch (err) {
      setCleanupError(getErrorMessage(err));
    } finally {
      setCleanupDeleting(false);
    }
  }

  /* ------------------------------------------------------------------------ */
  /* Derived                                                                  */
  /* ------------------------------------------------------------------------ */

  const totalPages = Math.max(
    1,
    Math.ceil(meta.count / PAGE_SIZE),
  );

  const paginationItems = useMemo(
    () => getPaginationItems(page, totalPages),
    [page, totalPages],
  );

  const brandOptions = useMemo(() => {
    const brands = sneakers
      .map((sneaker) => sneaker.brand?.trim())
      .filter(Boolean) as string[];

    return Array.from(new Set(brands)).sort((a, b) =>
      a.localeCompare(b),
    );
  }, [sneakers]);

  const firstResult =
    meta.count === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;

  const lastResult = Math.min(
    page * PAGE_SIZE,
    meta.count,
  );

  const hasFilters =
    Boolean(searchInput) ||
    Boolean(statusFilter) ||
    Boolean(conditionFilter) ||
    Boolean(brandFilter);

  function clearFilters() {
    setSearchInput("");
    setSearch("");
    setStatusFilter("");
    setConditionFilter("");
    setBrandFilter("");
    setPage(1);
  }

  /* ------------------------------------------------------------------------ */
  /* Initial loading                                                          */
  /* ------------------------------------------------------------------------ */

  if (loading && sneakers.length === 0) {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
          <div className="mb-6">
            <div className="h-7 w-32 animate-pulse rounded bg-gray-200" />

            <div className="mt-2 h-4 w-64 animate-pulse rounded bg-gray-200" />
          </div>

          <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white">
            <div className="h-32 animate-pulse bg-gray-100" />

            <div className="overflow-x-auto">
              <table className="w-full min-w-[1100px]">
                <tbody>
                  {Array.from({ length: 8 }).map(
                    (_, index) => (
                      <SkeletonRow key={index} />
                    ),
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    );
  }

  /* ------------------------------------------------------------------------ */
  /* Initial error                                                            */
  /* ------------------------------------------------------------------------ */

  if (error && sneakers.length === 0) {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
          <div className="mb-6">
            <h1 className="text-2xl font-semibold tracking-tight text-gray-900">
              Footwear
            </h1>

            <p className="mt-1 text-sm text-gray-500">
              Browse captured sneaker pairs.
            </p>
          </div>

          <div className="rounded-2xl border border-red-200 bg-white p-8 text-center shadow-sm">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-red-50">
              <span className="material-symbols-outlined text-red-600">
                error
              </span>
            </div>

            <h3 className="mt-4 text-lg font-semibold text-gray-900">
              Unable to load footwear
            </h3>

            <p className="mx-auto mt-2 max-w-md text-sm text-gray-500">
              {error}
            </p>

            <button
              type="button"
              onClick={() => loadSneakers()}
              className="mt-6 inline-flex items-center gap-2 rounded-xl bg-gray-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-gray-800"
            >
              <span className="material-symbols-outlined text-[18px]">
                refresh
              </span>

              Try again
            </button>
          </div>
        </div>
      </div>
    );
  }

  /* ------------------------------------------------------------------------ */
  /* Render                                                                   */
  /* ------------------------------------------------------------------------ */

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-gray-900">
              Footwear
            </h1>

            <p className="mt-1 text-sm text-gray-500">
              Browse captured sneaker pairs.
            </p>
          </div>

          <div className="flex shrink-0 gap-2">
            <button
              type="button"
              onClick={openCleanup}
              className="inline-flex h-10 items-center gap-2 rounded-xl border border-gray-300 bg-white px-4 text-sm font-medium text-gray-700 transition hover:bg-gray-50"
            >
              <span className="material-symbols-outlined text-[18px]">
                cleaning_services
              </span>

              Clean up
            </button>

            <button
              type="button"
              onClick={() => loadSneakers(true)}
              disabled={refreshing}
              className="inline-flex h-10 items-center gap-2 rounded-xl border border-gray-300 bg-white px-4 text-sm font-medium text-gray-700 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <span
                className={`material-symbols-outlined text-[18px] ${
                  refreshing ? "animate-spin" : ""
                }`}
              >
                refresh
              </span>

              {refreshing ? "Refreshing…" : "Refresh"}
            </button>
          </div>
        </div>

        {/* Table card */}
        <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
          {/* Toolbar */}
          <div className="border-b border-gray-200 p-5 sm:p-6">
            <div className="flex flex-col gap-4">
              <div className="relative w-full">
                <span className="material-symbols-outlined pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[20px] text-gray-400">
                  search
                </span>

                <input
                  type="text"
                  value={searchInput}
                  onChange={(event) =>
                    setSearchInput(event.target.value)
                  }
                  placeholder="Search pair ID, brand, model, SKU or size…"
                  className="h-11 w-full rounded-xl border border-gray-300 bg-white pl-10 pr-3 text-sm text-gray-900 outline-none transition placeholder:text-gray-400 focus:border-gray-500 focus:ring-2 focus:ring-gray-200"
                />
              </div>

              <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
                <select
                  value={statusFilter}
                  onChange={(event) => {
                    setPage(1);
                    setStatusFilter(event.target.value);
                  }}
                  className="h-11 w-full rounded-xl border border-gray-300 bg-white px-3 text-sm text-gray-700 outline-none transition focus:border-gray-500 focus:ring-2 focus:ring-gray-200 sm:w-44"
                >
                  <option value="">All statuses</option>
                  <option value="received">Received</option>
                  <option value="identification">
                    Identification
                  </option>
                  <option value="verification">
                    Verification
                  </option>
                  <option value="verified">Verified</option>
                  <option value="rejected">Rejected</option>
                </select>

                <select
                  value={conditionFilter}
                  onChange={(event) => {
                    setPage(1);
                    setConditionFilter(event.target.value);
                  }}
                  className="h-11 w-full rounded-xl border border-gray-300 bg-white px-3 text-sm text-gray-700 outline-none transition focus:border-gray-500 focus:ring-2 focus:ring-gray-200 sm:w-44"
                >
                  <option value="">All conditions</option>
                  {CONDITION_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>

                <select
                  value={brandFilter}
                  onChange={(event) => {
                    setPage(1);
                    setBrandFilter(event.target.value);
                  }}
                  className="h-11 w-full rounded-xl border border-gray-300 bg-white px-3 text-sm text-gray-700 outline-none transition focus:border-gray-500 focus:ring-2 focus:ring-gray-200 sm:w-52"
                >
                  <option value="">All brands</option>

                  {brandOptions.map((brand) => (
                    <option key={brand} value={brand}>
                      {brand}
                    </option>
                  ))}
                </select>

                <select
                  value={ordering}
                  onChange={(event) => {
                    setPage(1);
                    setOrdering(event.target.value);
                  }}
                  className="h-11 w-full rounded-xl border border-gray-300 bg-white px-3 text-sm text-gray-700 outline-none transition focus:border-gray-500 focus:ring-2 focus:ring-gray-200 sm:w-52"
                >
                  <option value="-created_at">
                    Newest first
                  </option>
                  <option value="created_at">
                    Oldest first
                  </option>
                  <option value="brand">Brand A–Z</option>
                  <option value="-brand">Brand Z–A</option>
                  <option value="model">Model A–Z</option>
                  <option value="-model">Model Z–A</option>
                </select>

                {hasFilters && (
                  <button
                    type="button"
                    onClick={clearFilters}
                    className="inline-flex h-11 items-center gap-2 rounded-xl border border-transparent px-3 text-sm font-medium text-gray-600 transition hover:bg-gray-100 hover:text-gray-900"
                  >
                    <span className="material-symbols-outlined text-[18px]">
                      close
                    </span>

                    Clear filters
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Results info */}
          <div className="flex flex-col gap-2 border-b border-gray-200 bg-gray-50/60 px-5 py-3.5 sm:flex-row sm:items-center sm:justify-between sm:px-6">
            <p className="text-sm text-gray-500">
              {meta.count === 0 ? (
                "No footwear found"
              ) : (
                <>
                  Showing{" "}
                  <span className="font-medium text-gray-700">
                    {firstResult}–{lastResult}
                  </span>{" "}
                  of{" "}
                  <span className="font-medium text-gray-700">
                    {meta.count.toLocaleString()}
                  </span>{" "}
                  pairs
                </>
              )}
            </p>

            {search && (
              <p className="text-xs text-gray-400">
                Search results for “{search}”
              </p>
            )}
          </div>

          {/* Inline error */}
          {error && sneakers.length > 0 && (
            <div className="border-b border-red-200 bg-red-50 px-5 py-3 sm:px-6">
              <div className="flex items-center justify-between gap-4">
                <p className="text-sm text-red-700">
                  {error}
                </p>

                <button
                  type="button"
                  onClick={() => loadSneakers(true)}
                  className="shrink-0 text-sm font-medium text-red-700 underline underline-offset-2"
                >
                  Retry
                </button>
              </div>
            </div>
          )}

          {/* Table */}
          <div className="relative overflow-x-auto">
            {loading && sneakers.length > 0 && (
              <div className="absolute inset-0 z-10 bg-white/60 backdrop-blur-[1px]">
                <div className="flex h-full items-start justify-center pt-24">
                  <div className="flex items-center gap-2 rounded-full border border-gray-200 bg-white px-4 py-2 text-sm text-gray-600 shadow-sm">
                    <span className="material-symbols-outlined animate-spin text-[18px]">
                      progress_activity
                    </span>

                    Loading footwear…
                  </div>
                </div>
              </div>
            )}

            <table className="w-full min-w-[1100px] text-left">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50/80 text-[11px] font-semibold uppercase tracking-wider text-gray-400">
                  <th className="px-6 py-3.5 font-medium">
                    Pair
                  </th>
                  <th className="px-6 py-3.5 font-medium">
                    Brand
                  </th>
                  <th className="px-6 py-3.5 font-medium">
                    Model
                  </th>
                  <th className="px-6 py-3.5 font-medium">
                    SKU
                  </th>
                  <th className="px-6 py-3.5 font-medium">
                    Size
                  </th>
                  <th className="px-6 py-3.5 font-medium">
                    Condition
                  </th>
                  <th className="px-6 py-3.5 font-medium">
                    Status
                  </th>
                  <th className="px-6 py-3.5 font-medium">
                    Images
                  </th>
                  <th className="px-6 py-3.5 font-medium">
                    Added
                  </th>
                </tr>
              </thead>

              <tbody className="divide-y divide-gray-100">
                {loading && sneakers.length === 0 ? (
                  Array.from({ length: 8 }).map(
                    (_, index) => (
                      <SkeletonRow key={index} />
                    ),
                  )
                ) : sneakers.length === 0 ? (
                  <tr>
                    <td
                      colSpan={9}
                      className="px-6 py-20 text-center"
                    >
                      <div className="mx-auto flex max-w-sm flex-col items-center">
                        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gray-100">
                          <span className="material-symbols-outlined text-[26px] text-gray-400">
                            footprint
                          </span>
                        </div>

                        <h3 className="mt-4 text-sm font-semibold text-gray-900">
                          No footwear found
                        </h3>

                        <p className="mt-1 text-sm text-gray-500">
                          Try adjusting your search or
                          filters.
                        </p>

                        {hasFilters && (
                          <button
                            type="button"
                            onClick={clearFilters}
                            className="mt-4 text-sm font-medium text-gray-700 underline underline-offset-4"
                          >
                            Clear filters
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ) : (
                  sneakers.map((sneaker) => {
                    const pairId = getPairId(sneaker);
                    const tone = statusTone(sneaker.status);
                    const images = countCapturedImages(sneaker);

                    return (
                      <tr
                        key={sneaker.id}
                        className="group transition-colors hover:bg-gray-50/70"
                      >
                        {/* Pair */}
                        <td className="px-6 py-4">
                          <Link
                            to={`/sneakers/${sneaker.id}`}
                            className="flex items-center gap-3"
                          >
                            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gray-100 text-gray-500 transition group-hover:bg-gray-900 group-hover:text-white">
                              <span className="material-symbols-outlined text-[20px]">
                                footprint
                              </span>
                            </div>

                            <div className="min-w-0">
                              <p className="truncate font-mono text-sm font-semibold text-gray-900 group-hover:underline">
                                {pairId}
                              </p>

                              <p className="mt-0.5 truncate text-xs text-gray-500">
                                {sneaker.pair_number
                                  ? `Pair #${sneaker.pair_number}`
                                  : "Sneaker pair"}
                              </p>
                            </div>
                          </Link>
                        </td>

                        {/* Brand */}
                        <td className="px-6 py-4">
                          <span className="truncate text-sm font-medium text-gray-800">
                            {sneaker.brand || (
                              <span className="text-gray-400">
                                —
                              </span>
                            )}
                          </span>
                        </td>

                        {/* Model */}
                        <td className="px-6 py-4">
                          <span
                            className="block max-w-[220px] truncate text-sm text-gray-600"
                            title={sneaker.model || undefined}
                          >
                            {sneaker.model || (
                              <span className="text-gray-400">
                                —
                              </span>
                            )}
                          </span>
                        </td>

                        {/* SKU */}
                        <td className="px-6 py-4">
                          <span className="font-mono text-xs text-gray-500">
                            {sneaker.sku || (
                              <span className="text-gray-400">
                                —
                              </span>
                            )}
                          </span>
                        </td>

                        {/* Size */}
                        <td className="px-6 py-4">
                          <span className="text-sm text-gray-700">
                            {sneaker.size || (
                              <span className="text-gray-400">
                                —
                              </span>
                            )}
                          </span>
                        </td>

                        {/* Condition */}
                        <td className="px-6 py-4">
                          {sneaker.condition ? (
                            <span
                              className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-medium ring-1 ring-inset ${conditionTone(
                                sneaker.condition,
                              )}`}
                            >
                              {conditionLabel(sneaker.condition)}
                            </span>
                          ) : (
                            <span className="text-sm text-gray-400">
                              —
                            </span>
                          )}
                        </td>

                        {/* Status */}
                        <td className="px-6 py-4">
                          <span
                            className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium capitalize ring-1 ring-inset ${tone.badge}`}
                          >
                            <span
                              className={`h-1.5 w-1.5 rounded-full ${tone.dot}`}
                            />

                            {formatStatus(sneaker.status)}
                          </span>
                        </td>

                        {/* Images */}
                        <td className="px-6 py-4">
                          <ImagesCell
                            uploaded={images.uploaded}
                            total={images.total}
                          />
                        </td>

                        {/* Added */}
                        <td className="whitespace-nowrap px-6 py-4">
                          <span className="text-xs text-gray-500">
                            {formatDate(sneaker.created_at)}
                          </span>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {meta.count > PAGE_SIZE && (
            <div className="flex flex-col gap-4 border-t border-gray-200 bg-gray-50/50 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
              <p className="text-xs text-gray-500">
                Page{" "}
                <span className="font-medium text-gray-700">
                  {page}
                </span>{" "}
                of{" "}
                <span className="font-medium text-gray-700">
                  {totalPages}
                </span>
              </p>

              <nav
                className="flex items-center justify-between gap-2 sm:justify-end"
                aria-label="Pagination"
              >
                <button
                  type="button"
                  onClick={() =>
                    setPage((current) =>
                      Math.max(1, current - 1),
                    )
                  }
                  disabled={page === 1 || loading}
                  className="inline-flex h-9 items-center gap-1 rounded-lg border border-gray-300 bg-white px-3 text-sm font-medium text-gray-700 transition hover:border-gray-400 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
                  aria-label="Previous page"
                >
                  <span className="material-symbols-outlined text-[18px]">
                    chevron_left
                  </span>

                  <span className="hidden sm:inline">
                    Previous
                  </span>
                </button>

                <div className="flex items-center gap-1">
                  {paginationItems.map((item, index) => {
                    if (item === "...") {
                      return (
                        <span
                          key={`ellipsis-${index}`}
                          className="flex h-9 w-9 items-center justify-center text-sm text-gray-400"
                        >
                          …
                        </span>
                      );
                    }

                    const active = item === page;

                    return (
                      <button
                        key={item}
                        type="button"
                        onClick={() => setPage(item)}
                        disabled={loading}
                        className={`inline-flex h-9 min-w-9 items-center justify-center rounded-lg px-2.5 text-sm font-medium transition ${
                          active
                            ? "bg-gray-900 text-white shadow-sm"
                            : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
                        } ${
                          loading
                            ? "cursor-not-allowed opacity-60"
                            : ""
                        }`}
                        aria-current={
                          active ? "page" : undefined
                        }
                      >
                        {item}
                      </button>
                    );
                  })}
                </div>

                <button
                  type="button"
                  onClick={() =>
                    setPage((current) =>
                      Math.min(totalPages, current + 1),
                    )
                  }
                  disabled={page === totalPages || loading}
                  className="inline-flex h-9 items-center gap-1 rounded-lg border border-gray-300 bg-white px-3 text-sm font-medium text-gray-700 transition hover:border-gray-400 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
                  aria-label="Next page"
                >
                  <span className="hidden sm:inline">
                    Next
                  </span>

                  <span className="material-symbols-outlined text-[18px]">
                    chevron_right
                  </span>
                </button>
              </nav>
            </div>
          )}
        </div>
      </div>

      {/* Cleanup modal */}
      <CleanupModal
        open={showCleanup}
        loading={cleanupLoading}
        deleting={cleanupDeleting}
        error={cleanupError}
        preview={cleanupPreview}
        confirming={cleanupConfirming}
        onClose={closeCleanup}
        onConfirmStage={() => setCleanupConfirming(true)}
        onDelete={handleCleanupDelete}
      />
    </div>
  );
}