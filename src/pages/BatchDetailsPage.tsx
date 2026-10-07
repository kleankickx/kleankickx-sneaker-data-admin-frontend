import {
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Link,
  useNavigate,
  useParams,
} from "react-router-dom";

import {
  closeBatch,
  deleteBatch,
  getBatchCleanupJob,
  getBatchDetails,
  getBatchPairsWithoutImages,
  deleteBatchPairsWithoutImages,
  openBatch,
  updateBatch,
  type BatchCleanupJob,
  type BatchDetailsResponse,
  type PairsWithoutImagesPreview,
} from "../lib/api";

import AddPairModal from "../components/AddPairModal";
import BulkUploadModal from "../components/bulk/BulkUploadModal";
import { useBulkUpload } from "../lib/bulk-upload-store";

import type { SneakerPair } from "../lib/types";

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

const PAGE_SIZE = 50;

function formatDate(value: string | null) {
  if (!value) return "Not received";

  return new Date(value).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function formatDateTime(value: string | null) {
  if (!value) return "—";

  return new Date(value).toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getPairId(pair: SneakerPair) {
  return pair.pair_id ?? pair.id;
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

function batchStatusClasses(status: string) {
  switch (status.toLowerCase()) {
    case "open":
      return "bg-emerald-50 text-emerald-700 ring-emerald-600/20";
    case "closed":
      return "bg-gray-100 text-gray-700 ring-gray-500/20";
    case "draft":
      return "bg-amber-50 text-amber-700 ring-amber-600/20";
    default:
      return "bg-gray-100 text-gray-700 ring-gray-500/20";
  }
}

function pairStatusClasses(status: string) {
  switch (status.toLowerCase()) {
    case "received":
      return "bg-blue-50 text-blue-700 ring-blue-600/20";
    case "verified":
      return "bg-emerald-50 text-emerald-700 ring-emerald-600/20";
    case "rejected":
      return "bg-red-50 text-red-700 ring-red-600/20";
    case "pending":
      return "bg-amber-50 text-amber-700 ring-amber-600/20";
    default:
      return "bg-gray-100 text-gray-700 ring-gray-500/20";
  }
}

function getErrorMessage(error: any) {
  return (
    error?.response?.data?.error?.message ||
    error?.response?.data?.message ||
    error?.message ||
    "Something went wrong."
  );
}

function isCleanupJobActive(job: BatchCleanupJob | null) {
  return (
    job?.status === "pending" || job?.status === "running"
  );
}

function cleanupProgressPct(job: BatchCleanupJob | null) {
  if (!job || job.total <= 0) return null;

  return Math.min(
    100,
    Math.round((job.deleted / job.total) * 100),
  );
}

/* -------------------------------------------------------------------------- */
/* Pagination                                                                 */
/* -------------------------------------------------------------------------- */

function getPaginationItems(
  currentPage: number,
  totalPages: number,
): Array<number | "ellipsis"> {
  if (totalPages <= 7) {
    return Array.from(
      { length: totalPages },
      (_, index) => index + 1,
    );
  }

  const pages: Array<number | "ellipsis"> = [];

  pages.push(1);

  if (currentPage <= 4) {
    pages.push(2, 3, 4, 5, "ellipsis", totalPages);
    return pages;
  }

  if (currentPage >= totalPages - 3) {
    pages.push(
      "ellipsis",
      totalPages - 4,
      totalPages - 3,
      totalPages - 2,
      totalPages - 1,
      totalPages,
    );

    return pages;
  }

  pages.push(
    "ellipsis",
    currentPage - 1,
    currentPage,
    currentPage + 1,
    "ellipsis",
    totalPages,
  );

  return pages;
}

/* -------------------------------------------------------------------------- */
/* Types                                                                      */
/* -------------------------------------------------------------------------- */

type Toast = {
  type: "success" | "error";
  message: string;
};

type ConfirmAction = "open" | "close" | "delete" | null;

/* -------------------------------------------------------------------------- */
/* Confirmation dialog                                                        */
/* -------------------------------------------------------------------------- */

function ConfirmDialog({
  open,
  tone,
  icon,
  title,
  description,
  confirmLabel,
  cancelLabel = "Cancel",
  loading,
  error,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  tone: "primary" | "danger";
  icon: string;
  title: string;
  description: string;
  confirmLabel: string;
  cancelLabel?: string;
  loading?: boolean;
  error?: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  useEffect(() => {
    if (!open) return;

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !loading) {
        onCancel();
      }
    }

    window.addEventListener("keydown", onKeyDown);

    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open, loading, onCancel]);

  if (!open) return null;

  const toneStyles =
    tone === "danger"
      ? {
          iconBg: "bg-red-100",
          iconColor: "text-red-600",
          confirm:
            "bg-red-600 text-white hover:bg-red-700 focus-visible:outline-red-600",
        }
      : {
          iconBg: "bg-gray-100",
          iconColor: "text-gray-700",
          confirm:
            "bg-gray-900 text-white hover:bg-gray-800 focus-visible:outline-gray-900",
        };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={() => {
        if (!loading) onCancel();
      }}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="px-6 pt-6">
          <div className="flex items-start gap-4">
            <div
              className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full ${toneStyles.iconBg}`}
            >
              <span
                className={`material-symbols-outlined text-[22px] ${toneStyles.iconColor}`}
              >
                {icon}
              </span>
            </div>

            <div className="min-w-0 flex-1">
              <h2 className="text-base font-semibold text-gray-900">
                {title}
              </h2>

              <p className="mt-1.5 text-sm leading-6 text-gray-500">
                {description}
              </p>
            </div>
          </div>

          {error && (
            <div className="mt-4 flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-3.5">
              <span className="material-symbols-outlined text-[20px] text-red-600">
                error
              </span>

              <p className="flex-1 text-sm leading-5 text-red-700">
                {error}
              </p>
            </div>
          )}
        </div>

        <div className="mt-6 flex justify-end gap-2 border-t border-gray-100 bg-gray-50/60 px-6 py-4">
          <button
            type="button"
            disabled={loading}
            onClick={onCancel}
            className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50 disabled:opacity-50"
          >
            {cancelLabel}
          </button>

          <button
            type="button"
            disabled={loading}
            onClick={onConfirm}
            className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-50 ${toneStyles.confirm}`}
          >
            {loading && (
              <span className="material-symbols-outlined animate-spin text-[16px]">
                progress_activity
              </span>
            )}

            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
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
/* Cleanup modal (scoped to this batch)                                       */
/* -------------------------------------------------------------------------- */

function BatchCleanupModal({
  open,
  batchLabel,
  loading,
  deleting,
  error,
  preview,
  job,
  confirming,
  onClose,
  onDismiss,
  onConfirmStage,
  onDelete,
}: {
  open: boolean;
  batchLabel: string;
  loading: boolean;
  deleting: boolean;
  error: string | null;
  preview: PairsWithoutImagesPreview | null;
  job: BatchCleanupJob | null;
  confirming: boolean;
  onClose: () => void;
  onDismiss: () => void;
  onConfirmStage: () => void;
  onDelete: () => void;
}) {
  const isRunning = isCleanupJobActive(job);

  useEffect(() => {
    if (!open) return;

    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      if (deleting) return;

      if (isRunning) onDismiss();
      else onClose();
    }

    window.addEventListener("keydown", onKeyDown);

    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open, deleting, isRunning, onClose, onDismiss]);

  if (!open) return null;

  const hasPairs = Boolean(preview && preview.count > 0);
  const isFailed = job?.status === "failed";
  const isDone = job?.status === "done";

  const progressPct =
    job && job.total > 0
      ? Math.min(100, Math.round((job.deleted / job.total) * 100))
      : 0;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={() => {
        if (deleting) return;
        if (isRunning) onDismiss();
        else onClose();
      }}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="w-full max-w-lg overflow-hidden rounded-2xl bg-white shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="border-b border-gray-200 px-6 py-5">
          <div className="flex items-start gap-4">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-amber-50">
              <span className="material-symbols-outlined text-[22px] text-amber-600">
                cleaning_services
              </span>
            </div>

            <div className="min-w-0 flex-1">
              <h2 className="text-base font-semibold text-gray-900">
                {isRunning
                  ? "Deleting pairs…"
                  : isDone
                    ? "Cleanup complete"
                    : "Clean up pairs without images"}
              </h2>

              <p className="mt-1 break-all text-sm text-gray-500">
                Batch <span className="font-mono">{batchLabel}</span>
                {isRunning && job && (
                  <>
                    {" "}— job{" "}
                    <span className="font-mono">
                      {job.job_id.slice(0, 8)}…
                    </span>
                  </>
                )}
              </p>
            </div>

            <button
              type="button"
              disabled={deleting}
              onClick={isRunning ? onDismiss : onClose}
              className="text-gray-400 transition hover:text-gray-700 disabled:opacity-40"
              aria-label="Close"
            >
              <span className="material-symbols-outlined">
                close
              </span>
            </button>
          </div>
        </div>

        <div className="max-h-[60vh] overflow-y-auto px-6 py-6">
          {job && (
            <div className="space-y-4">
              <div
                className={`flex items-start gap-3 rounded-xl border p-4 ${
                  isFailed
                    ? "border-red-200 bg-red-50"
                    : isDone
                      ? "border-emerald-200 bg-emerald-50"
                      : "border-blue-200 bg-blue-50"
                }`}
              >
                <span
                  className={`material-symbols-outlined text-[20px] ${
                    isFailed
                      ? "text-red-600"
                      : isDone
                        ? "text-emerald-600"
                        : "text-blue-600 animate-spin"
                  }`}
                >
                  {isFailed
                    ? "error"
                    : isDone
                      ? "check_circle"
                      : "progress_activity"}
                </span>

                <div className="min-w-0 flex-1">
                  <p
                    className={`text-sm font-medium ${
                      isFailed
                        ? "text-red-900"
                        : isDone
                          ? "text-emerald-900"
                          : "text-blue-900"
                    }`}
                  >
                    {isFailed
                      ? "Cleanup failed"
                      : isDone
                        ? `${job.deleted.toLocaleString()} pair${
                            job.deleted === 1 ? "" : "s"
                          } deleted`
                        : `Deleted ${job.deleted.toLocaleString()}${
                            job.total
                              ? ` of ${job.total.toLocaleString()}`
                              : ""
                          } pair${job.deleted === 1 ? "" : "s"}`}
                  </p>

                  {isFailed && job.error && (
                    <p className="mt-1 text-xs text-red-700">
                      {job.error}
                    </p>
                  )}

                  {isRunning && (
                    <p className="mt-1 text-xs text-blue-700">
                      Running in the background. You can close
                      this dialog — the deletion will continue.
                    </p>
                  )}
                </div>
              </div>

              {isRunning && (
                <div className="space-y-1.5">
                  <div className="h-2 w-full overflow-hidden rounded-full bg-gray-100">
                    <div
                      className="h-full rounded-full bg-gray-900 transition-all"
                      style={{ width: `${progressPct}%` }}
                    />
                  </div>
                  <div className="flex justify-between text-[11px] text-gray-500">
                    <span>
                      {job.total ? `${progressPct}%` : "Counting…"}
                    </span>
                    <span>
                      {job.deleted.toLocaleString()} /{" "}
                      {job.total
                        ? job.total.toLocaleString()
                        : "…"}
                    </span>
                  </div>
                </div>
              )}
            </div>
          )}

          {loading && !job && (
            <div className="flex items-center justify-center gap-2 py-8 text-sm text-gray-500">
              <span className="material-symbols-outlined animate-spin text-[18px]">
                progress_activity
              </span>
              Scanning batch for pairs without images…
            </div>
          )}

          {!loading && error && !job && (
            <div className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4">
              <span className="material-symbols-outlined text-[20px] text-red-600">
                error
              </span>

              <p className="flex-1 text-sm text-red-700">{error}</p>
            </div>
          )}

          {!loading && !error && preview && preview.count === 0 && !job && (
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
                Every pair in this batch has at least one uploaded
                image.
              </p>
            </div>
          )}

          {!loading && !error && hasPairs && preview && !job && (
            <div className="space-y-4">
              <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4">
                <span className="material-symbols-outlined text-[20px] text-amber-600">
                  warning
                </span>

                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-amber-900">
                    {preview.count.toLocaleString()} pair
                    {preview.count === 1 ? "" : "s"} in this
                    batch will be deleted
                  </p>

                  <p className="mt-0.5 text-xs text-amber-700">
                    This action cannot be undone. Related
                    capture sessions and identification
                    records for these pairs will be removed
                    too.
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
                    {preview.count === 1 ? "" : "s"} from this
                    batch.
                  </p>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 border-t border-gray-100 bg-gray-50/60 px-6 py-4">
          <button
            type="button"
            disabled={deleting}
            onClick={isRunning ? onDismiss : onClose}
            className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50 disabled:opacity-50"
          >
            {isRunning ? "Close (runs in background)" : "Cancel"}
          </button>

          {hasPairs && !job && (
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

export default function BatchDetailsPage() {
  const { batchId } = useParams<{ batchId: string }>();
  const navigate = useNavigate();

  /* Data state */
  const [details, setDetails] =
    useState<BatchDetailsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState("");

  /* Search / filters */
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [conditionFilter, setConditionFilter] = useState("");
  const [brandFilter, setBrandFilter] = useState("");
  const [ordering, setOrdering] = useState("-created_at");

  /* Pagination */
  const [page, setPage] = useState(1);

  /* UI state */
  const [showActions, setShowActions] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showAddPair, setShowAddPair] = useState(false);
  const [showBulkUpload, setShowBulkUpload] = useState(false);
  const [confirmAction, setConfirmAction] =
    useState<ConfirmAction>(null);
  const [confirmError, setConfirmError] = useState("");
  const [toast, setToast] = useState<Toast | null>(null);

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
  const [cleanupJob, setCleanupJob] =
    useState<BatchCleanupJob | null>(null);

  /** Cancellation token for the cleanup poll loop. */
  const pollTokenRef = useRef(0);

  /* Edit form */
  const [editName, setEditName] = useState("");
  const [editSource, setEditSource] = useState("");
  const [editQuantity, setEditQuantity] = useState("");

  /* Search debounce */
  useEffect(() => {
    const timer = window.setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(1);
    }, 350);

    return () => {
      window.clearTimeout(timer);
    };
  }, [searchInput]);

  /* Reset pagination when filters change */
  useEffect(() => {
    setPage(1);
  }, [statusFilter, conditionFilter, brandFilter, ordering]);

  /* Close actions menu on outside click */
  useEffect(() => {
    if (!showActions) return;

    function onDocClick() {
      setShowActions(false);
    }

    window.addEventListener("click", onDocClick);

    return () => {
      window.removeEventListener("click", onDocClick);
    };
  }, [showActions]);

  /* Clear confirm error when opening a new action */
  useEffect(() => {
    setConfirmError("");
  }, [confirmAction]);

  /* Stop polling when the page unmounts */
  useEffect(() => {
    return () => {
      pollTokenRef.current += 1;
    };
  }, []);

  /* Toast */
  function showToast(
    type: "success" | "error",
    message: string,
  ) {
    setToast({ type, message });

    window.setTimeout(() => {
      setToast(null);
    }, 4000);
  }

  /* Load batch details */
  async function loadBatchDetails() {
    if (!batchId) return;

    try {
      setLoading(true);
      setError("");

      const data = await getBatchDetails(batchId, {
        page,
        page_size: PAGE_SIZE,
        search: search || undefined,
        status: statusFilter || undefined,
        condition: conditionFilter || undefined,
        brand: brandFilter || undefined,
        ordering,
      });

      setDetails(data);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  /* Fetch on query change */
  useEffect(() => {
    loadBatchDetails();
  }, [
    batchId,
    page,
    search,
    statusFilter,
    conditionFilter,
    brandFilter,
    ordering,
  ]);

  /* Refresh pairs when a bulk upload into this batch finishes. Failures
     are explained by the upload panel, so no toast here. */
  useEffect(
    () =>
      useBulkUpload.subscribe((state, prev) => {
        if (state.phase === prev.phase || state.batchId !== batchId) return;
        if (state.phase !== "done" && state.phase !== "failed") return;

        // Off page 1, the page change itself triggers the fetch above.
        if (page === 1) loadBatchDetails();
        else setPage(1);
      }),
    [batchId, page, loadBatchDetails],
  );

  /* Populate edit form */
  useEffect(() => {
    if (!details) return;

    setEditName(details.batch.name);
    setEditSource(details.batch.source);
    setEditQuantity(String(details.batch.expected_quantity));
  }, [details]);

  /* Filter options */
  const brands = useMemo(() => {
    if (!details) return [];

    return Array.from(
      new Set(
        details.pairs
          .map((pair) => pair.brand)
          .filter(Boolean) as string[],
      ),
    ).sort();
  }, [details]);

  const conditions = useMemo(() => {
    if (!details) return [];

    return Array.from(
      new Set(
        details.pairs
          .map((pair) => pair.condition)
          .filter(Boolean) as string[],
      ),
    ).sort();
  }, [details]);

  const statuses = useMemo(() => {
    if (!details) return [];

    return Array.from(
      new Set(
        details.pairs
          .map((pair) => pair.status)
          .filter(Boolean),
      ),
    ).sort();
  }, [details]);

  /* Pagination */
  const totalPages = details
    ? Math.max(1, Math.ceil(details.meta.count / PAGE_SIZE))
    : 1;

  const paginationItems = getPaginationItems(page, totalPages);

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
    setOrdering("-created_at");
    setPage(1);
  }

  /* ------------------------------------------------------------------ */
  /* Cleanup handlers                                                    */
  /* ------------------------------------------------------------------ */

  async function openCleanup() {
    if (!batchId) return;

    setShowCleanup(true);

    if (isCleanupJobActive(cleanupJob)) {
      return;
    }

    setCleanupConfirming(false);
    setCleanupError(null);
    setCleanupPreview(null);
    setCleanupJob(null);
    setCleanupLoading(true);

    try {
      const preview = await getBatchPairsWithoutImages(batchId);
      setCleanupPreview(preview);
    } catch (err) {
      setCleanupError(getErrorMessage(err));
    } finally {
      setCleanupLoading(false);
    }
  }

  function closeCleanup() {
    if (cleanupDeleting) return;

    pollTokenRef.current += 1;

    setShowCleanup(false);
    setCleanupPreview(null);
    setCleanupConfirming(false);
    setCleanupError(null);
    setCleanupJob(null);
  }

  function dismissCleanup() {
    setShowCleanup(false);
    setCleanupConfirming(false);
    setCleanupError(null);
  }

  async function pollCleanupJob(jobId: string) {
    if (!batchId) return;

    const token = ++pollTokenRef.current;
    const POLL_INTERVAL_MS = 1500;

    while (pollTokenRef.current === token) {
      try {
        const job = await getBatchCleanupJob(batchId, jobId);

        if (pollTokenRef.current !== token) return;

        setCleanupJob(job);

        if (job.status === "done" || job.status === "failed") {
          return;
        }
      } catch (err) {
        if (pollTokenRef.current !== token) return;
        setCleanupError(getErrorMessage(err));
        return;
      }

      await new Promise((resolve) =>
        window.setTimeout(resolve, POLL_INTERVAL_MS),
      );
    }
  }

  async function handleCleanupDelete() {
    if (!batchId) return;

    setCleanupDeleting(true);
    setCleanupError(null);

    let jobId: string | null = null;

    try {
      const response = await deleteBatchPairsWithoutImages(batchId);
      jobId = response.job_id;

      if (!jobId) {
        setCleanupDeleting(false);
        closeCleanup();
        setPage(1);
        await loadBatchDetails();
        showToast("success", "No pairs needed cleanup.");
        return;
      }

      setCleanupJob({
        job_id: jobId,
        status: "pending",
        total: 0,
        deleted: 0,
        error: "",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
    } catch (err) {
      setCleanupError(getErrorMessage(err));
      setCleanupDeleting(false);
      return;
    }

    setCleanupDeleting(false);

    await pollCleanupJob(jobId);

    const finished = await getBatchCleanupJob(batchId, jobId);
    setCleanupJob(finished);

    if (finished.status === "done") {
      setShowCleanup(false);
      setCleanupPreview(null);
      setCleanupConfirming(false);
      setCleanupError(null);
      setCleanupJob(null);

      setPage(1);
      await loadBatchDetails();

      showToast(
        "success",
        `${finished.deleted.toLocaleString()} pair${
          finished.deleted === 1 ? "" : "s"
        } deleted.`,
      );
    } else if (finished.status === "failed") {
      setCleanupError(finished.error || "Cleanup failed.");
      setShowCleanup(true);
    }
  }

  /* ------------------------------------------------------------------ */
  /* Batch confirm handlers                                              */
  /* ------------------------------------------------------------------ */

  async function handleOpenBatch() {
    if (!batchId) return;

    try {
      setActionLoading(true);
      setConfirmError("");

      const updated = await openBatch(batchId);

      setDetails((current) =>
        current ? { ...current, batch: updated } : current,
      );

      setConfirmAction(null);
      showToast("success", "Batch opened successfully.");
    } catch (err) {
      setConfirmError(getErrorMessage(err));
    } finally {
      setActionLoading(false);
    }
  }

  async function handleCloseBatch() {
    if (!batchId) return;

    try {
      setActionLoading(true);
      setConfirmError("");

      const updated = await closeBatch(batchId);

      setDetails((current) =>
        current ? { ...current, batch: updated } : current,
      );

      setConfirmAction(null);
      showToast("success", "Batch closed successfully.");
    } catch (err) {
      setConfirmError(getErrorMessage(err));
    } finally {
      setActionLoading(false);
    }
  }

  async function handleDeleteBatch() {
    if (!batchId || !details) return;

    try {
      setActionLoading(true);
      setConfirmError("");

      await deleteBatch(batchId);

      showToast("success", "Batch deleted successfully.");
      navigate("/batches");
    } catch (err) {
      setConfirmError(getErrorMessage(err));
      setActionLoading(false);
    }
  }

  /* Edit batch */
  async function handleEditBatch(
    event: React.FormEvent,
  ) {
    event.preventDefault();

    if (!batchId) return;

    const quantity = Number(editQuantity);

    if (!editName.trim()) {
      showToast("error", "Batch name is required.");
      return;
    }

    if (!Number.isInteger(quantity) || quantity <= 0) {
      showToast(
        "error",
        "Expected quantity must be a positive whole number.",
      );
      return;
    }

    try {
      setActionLoading(true);

      const updated = await updateBatch(batchId, {
        name: editName.trim(),
        source: editSource.trim(),
        expected_quantity: quantity,
      });

      setDetails((current) =>
        current ? { ...current, batch: updated } : current,
      );

      setShowEditModal(false);
      showToast("success", "Batch updated successfully.");
    } catch (err) {
      showToast("error", getErrorMessage(err));
    } finally {
      setActionLoading(false);
    }
  }

  /* Initial loading */
  if (loading && !details) {
    return (
      <div className="space-y-6">
        <div className="h-4 w-24 animate-pulse rounded bg-gray-200" />

        <div className="rounded-2xl border border-gray-200 bg-white p-7">
          <div className="h-5 w-24 animate-pulse rounded bg-gray-200" />
          <div className="mt-4 h-8 w-72 animate-pulse rounded bg-gray-200" />
          <div className="mt-3 h-4 w-48 animate-pulse rounded bg-gray-200" />
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {[1, 2, 3, 4].map((item) => (
            <div
              key={item}
              className="h-32 animate-pulse rounded-2xl border border-gray-200 bg-white"
            />
          ))}
        </div>

        <div className="h-[500px] animate-pulse rounded-2xl border border-gray-200 bg-white" />
      </div>
    );
  }

  /* Initial error */
  if (error && !details) {
    return (
      <div className="space-y-6">
        <Link
          to="/batches"
          className="inline-flex items-center gap-2 text-sm font-medium text-gray-500 hover:text-gray-900"
        >
          <span className="material-symbols-outlined text-[19px]">
            arrow_back
          </span>

          Batches
        </Link>

        <div className="rounded-2xl border border-red-200 bg-red-50 p-6">
          <div className="flex gap-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-red-100">
              <span className="material-symbols-outlined text-red-600">
                error
              </span>
            </div>

            <div>
              <h2 className="font-semibold text-red-900">
                Unable to load batch
              </h2>

              <p className="mt-1 text-sm text-red-700">{error}</p>

              <button
                type="button"
                onClick={loadBatchDetails}
                className="mt-4 inline-flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700"
              >
                <span className="material-symbols-outlined text-[18px]">
                  refresh
                </span>

                Try again
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!details) return null;

  const { batch } = details;
  const batchLabel = batch.batch_id ?? batch.id;

  /* Render */
  return (
    <div className="mx-auto max-w-[1600px] space-y-6">
      {/* Toast */}
      {toast && (
        <div className="fixed right-5 top-5 z-50 w-[min(380px,calc(100vw-40px))]">
          <div
            className={`flex items-start gap-3 rounded-xl border bg-white p-4 shadow-xl ${
              toast.type === "success"
                ? "border-emerald-200"
                : "border-red-200"
            }`}
          >
            <span
              className={`material-symbols-outlined ${
                toast.type === "success"
                  ? "text-emerald-600"
                  : "text-red-600"
              }`}
            >
              {toast.type === "success"
                ? "check_circle"
                : "error"}
            </span>

            <p className="flex-1 text-sm font-medium text-gray-800">
              {toast.message}
            </p>

            <button
              type="button"
              onClick={() => setToast(null)}
              className="text-gray-400 hover:text-gray-700"
            >
              <span className="material-symbols-outlined text-[18px]">
                close
              </span>
            </button>
          </div>
        </div>
      )}

      {/* Breadcrumb */}
      <Link
        to="/batches"
        className="inline-flex items-center gap-2 text-sm font-medium text-gray-500 transition hover:text-gray-900"
      >
        <span className="material-symbols-outlined text-[19px]">
          arrow_back
        </span>

        Batches
      </Link>

      {/* Batch header */}
      <section className="overflow-visible rounded-2xl border border-gray-200 bg-white shadow-sm">
        <div className="p-6 sm:p-7">
          <div className="flex flex-col gap-6 xl:flex-row xl:items-start xl:justify-between">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-3">
                <span className="rounded-lg bg-gray-100 px-2.5 py-1 font-mono text-xs font-semibold text-gray-600">
                  BATCH
                </span>

                <span
                  className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium capitalize ring-1 ring-inset ${batchStatusClasses(
                    batch.status,
                  )}`}
                >
                  <span className="h-1.5 w-1.5 rounded-full bg-current" />

                  {batch.status}
                </span>
              </div>

              <h1 className="mt-4 break-all font-mono text-2xl font-semibold tracking-tight text-gray-950 sm:text-3xl">
                {batch.batch_id ?? batch.id}
              </h1>

              <p className="mt-2 text-base font-medium text-gray-700">
                {batch.name}
              </p>

              <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-gray-500">
                <span className="inline-flex items-center gap-2">
                  <span className="material-symbols-outlined text-[18px]">
                    inventory_2
                  </span>

                  Source:

                  <span className="font-medium text-gray-700">
                    {batch.source || "—"}
                  </span>
                </span>

                <span className="hidden text-gray-300 sm:block">
                  •
                </span>

                <span className="inline-flex items-center gap-2">
                  <span className="material-symbols-outlined text-[18px]">
                    calendar_today
                  </span>

                  Created {formatDate(batch.created_at)}
                </span>
              </div>
            </div>

            {/* Actions */}
            <div
              className="relative flex shrink-0 gap-2"
              onClick={(event) => event.stopPropagation()}
            >
              <button
                type="button"
                disabled={actionLoading}
                onClick={() => setShowEditModal(true)}
                className="inline-flex h-10 items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 text-sm font-medium text-gray-700 transition hover:bg-gray-50 disabled:opacity-50"
              >
                <span className="material-symbols-outlined text-[18px]">
                  edit
                </span>

                Edit
              </button>

              <button
                type="button"
                disabled={actionLoading}
                onClick={() =>
                  setShowActions((current) => !current)
                }
                className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-gray-300 bg-white text-gray-600 transition hover:bg-gray-50 disabled:opacity-50"
                aria-label="More actions"
                aria-haspopup="menu"
                aria-expanded={showActions}
              >
                <span className="material-symbols-outlined text-[20px]">
                  more_vert
                </span>
              </button>

              {showActions && (
                <div className="absolute right-0 top-12 z-30 w-56 overflow-hidden rounded-xl border border-gray-200 bg-white py-1 shadow-xl">
                  {batch.status.toLowerCase() !== "open" && (
                    <button
                      type="button"
                      onClick={() => {
                        setShowActions(false);
                        setConfirmAction("open");
                      }}
                      className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm text-gray-700 hover:bg-gray-50"
                    >
                      <span className="material-symbols-outlined text-[19px]">
                        play_arrow
                      </span>

                      Open batch
                    </button>
                  )}

                  {batch.status.toLowerCase() === "open" && (
                    <button
                      type="button"
                      onClick={() => {
                        setShowActions(false);
                        setConfirmAction("close");
                      }}
                      className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm text-gray-700 hover:bg-gray-50"
                    >
                      <span className="material-symbols-outlined text-[19px]">
                        lock
                      </span>

                      Close batch
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => {
                      setShowActions(false);
                      openCleanup();
                    }}
                    className={`flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm hover:bg-gray-50 ${
                      isCleanupJobActive(cleanupJob)
                        ? "text-blue-700"
                        : "text-gray-700"
                    }`}
                  >
                    <span
                      className={`material-symbols-outlined text-[19px] ${
                        isCleanupJobActive(cleanupJob)
                          ? "animate-spin"
                          : ""
                      }`}
                    >
                      {isCleanupJobActive(cleanupJob)
                        ? "progress_activity"
                        : "cleaning_services"}
                    </span>

                    {isCleanupJobActive(cleanupJob)
                      ? "View cleanup progress"
                      : "Clean up pairs without images"}
                  </button>

                  <div className="my-1 border-t border-gray-100" />

                  <button
                    type="button"
                    onClick={() => {
                      setShowActions(false);
                      setConfirmAction("delete");
                    }}
                    className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm text-red-600 hover:bg-red-50"
                  >
                    <span className="material-symbols-outlined text-[19px]">
                      delete
                    </span>

                    Delete batch
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Metadata */}
        <div className="grid border-t border-gray-200 sm:grid-cols-2 xl:grid-cols-4">
          <div className="border-b border-gray-200 px-6 py-5 sm:border-r xl:border-b-0">
            <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">
              Expected quantity
            </p>

            <p className="mt-2 text-xl font-semibold text-gray-900">
              {batch.expected_quantity.toLocaleString()}
            </p>

            <p className="mt-1 text-xs text-gray-500">
              Expected pairs
            </p>
          </div>

          <div className="border-b border-gray-200 px-6 py-5 xl:border-b-0 xl:border-r">
            <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">
              Captured pairs
            </p>

            <p className="mt-2 text-xl font-semibold text-gray-900">
              {details.meta.count.toLocaleString()}
            </p>

            <p className="mt-1 text-xs text-gray-500">
              Pairs currently recorded
            </p>
          </div>

          <div className="border-b border-gray-200 px-6 py-5 sm:border-r xl:border-b-0">
            <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">
              Received
            </p>

            <p className="mt-2 text-sm font-semibold text-gray-900">
              {formatDate(batch.received_at)}
            </p>

            <p className="mt-1 text-xs text-gray-500">
              Physical receipt
            </p>
          </div>

          <div className="px-6 py-5">
            <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">
              Last updated
            </p>

            <p className="mt-2 text-sm font-semibold text-gray-900">
              {formatDateTime(batch.updated_at)}
            </p>

            <p className="mt-1 text-xs text-gray-500">
              Batch record
            </p>
          </div>
        </div>
      </section>

      {/* Sneaker pairs */}
      <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
        <div className="border-b border-gray-200 px-6 py-5 sm:px-7">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className="flex items-center gap-3">
                <h2 className="text-base font-semibold text-gray-900">
                  Sneaker pairs
                </h2>

                <span className="rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-600">
                  {details.meta.count.toLocaleString()}
                </span>
              </div>

              <p className="mt-1 text-sm text-gray-500">
                Individual pairs captured under this batch.
              </p>
            </div>

            <div className="flex shrink-0 gap-2">
              {/* Add pair — only for open batches */}
              {batch.status.toLowerCase() === "open" && (
                <button
                  type="button"
                  onClick={() => setShowAddPair(true)}
                  className="inline-flex h-9 items-center gap-2 self-start rounded-lg bg-gray-900 px-3 text-sm font-medium text-white transition hover:bg-gray-800 lg:self-auto"
                >
                  <span className="material-symbols-outlined text-[18px]">
                    add
                  </span>
                  Add pair
                </button>
              )}

              {/* Bulk upload — only for open batches */}
              {batch.status.toLowerCase() === "open" && (
                <button
                  type="button"
                  onClick={() => setShowBulkUpload(true)}
                  className="inline-flex h-9 items-center gap-2 self-start rounded-lg border border-gray-300 bg-white px-3 text-sm font-medium text-gray-700 transition hover:bg-gray-50 lg:self-auto"
                >
                  <span className="material-symbols-outlined text-[18px]">
                    drive_folder_upload
                  </span>
                  Bulk upload
                </button>
              )}

              {/* Clean up / Cleanup running */}
              {isCleanupJobActive(cleanupJob) ? (
                <button
                  type="button"
                  onClick={openCleanup}
                  title="A cleanup job is running. Click to view progress."
                  className="inline-flex h-9 items-center gap-2 self-start rounded-lg border border-blue-300 bg-blue-50 px-3 text-sm font-medium text-blue-700 transition hover:bg-blue-100 lg:self-auto"
                >
                  <span className="material-symbols-outlined animate-spin text-[18px]">
                    progress_activity
                  </span>

                  <span className="hidden sm:inline">
                    Cleanup running
                  </span>
                  <span className="sm:hidden">Running</span>

                  {cleanupProgressPct(cleanupJob) !== null && (
                    <span className="rounded-full bg-blue-200/70 px-1.5 text-[11px] font-semibold text-blue-800">
                      {cleanupProgressPct(cleanupJob)}%
                    </span>
                  )}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={openCleanup}
                  className="inline-flex h-9 items-center gap-2 self-start rounded-lg border border-gray-300 px-3 text-sm font-medium text-gray-700 transition hover:bg-gray-50 lg:self-auto"
                >
                  <span className="material-symbols-outlined text-[18px]">
                    cleaning_services
                  </span>

                  Clean up
                </button>
              )}

              <button
                type="button"
                onClick={loadBatchDetails}
                disabled={loading}
                className="inline-flex h-9 items-center gap-2 self-start rounded-lg border border-gray-300 px-3 text-sm font-medium text-gray-700 transition hover:bg-gray-50 disabled:opacity-50 lg:self-auto"
              >
                <span
                  className={`material-symbols-outlined text-[18px] ${
                    loading ? "animate-spin" : ""
                  }`}
                >
                  refresh
                </span>

                Refresh
              </button>
            </div>
          </div>
        </div>

        {/* Filters */}
        <div className="border-b border-gray-200 bg-gray-50/60 px-6 py-4 sm:px-7">
          <div className="flex flex-col gap-3 xl:flex-row">
            <div className="relative min-w-0 flex-1">
              <span className="material-symbols-outlined pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[20px] text-gray-400">
                search
              </span>

              <input
                type="text"
                value={searchInput}
                onChange={(event) =>
                  setSearchInput(event.target.value)
                }
                placeholder="Search pair ID, brand, model or SKU"
                className="h-10 w-full rounded-lg border border-gray-300 bg-white pl-10 pr-3 text-sm outline-none placeholder:text-gray-400 focus:border-gray-500 focus:ring-2 focus:ring-gray-200"
              />
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-4 xl:w-[680px]">
              <select
                value={statusFilter}
                onChange={(event) =>
                  setStatusFilter(event.target.value)
                }
                className="h-10 rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-700 outline-none focus:border-gray-500 focus:ring-2 focus:ring-gray-200"
              >
                <option value="">All statuses</option>

                {statuses.map((status) => (
                  <option key={status} value={status}>
                    {status}
                  </option>
                ))}
              </select>

              <select
                value={brandFilter}
                onChange={(event) =>
                  setBrandFilter(event.target.value)
                }
                className="h-10 rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-700 outline-none focus:border-gray-500 focus:ring-2 focus:ring-gray-200"
              >
                <option value="">All brands</option>

                {brands.map((brand) => (
                  <option key={brand} value={brand}>
                    {brand}
                  </option>
                ))}
              </select>

              <select
                value={conditionFilter}
                onChange={(event) =>
                  setConditionFilter(event.target.value)
                }
                className="h-10 rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-700 outline-none focus:border-gray-500 focus:ring-2 focus:ring-gray-200"
              >
                <option value="">All conditions</option>

                {conditions.map((condition) => (
                  <option key={condition} value={condition}>
                    {condition}
                  </option>
                ))}
              </select>

              <select
                value={ordering}
                onChange={(event) =>
                  setOrdering(event.target.value)
                }
                className="h-10 rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-700 outline-none focus:border-gray-500 focus:ring-2 focus:ring-gray-200"
              >
                <option value="-created_at">Newest</option>
                <option value="created_at">Oldest</option>
                <option value="brand">Brand A–Z</option>
                <option value="-brand">Brand Z–A</option>
                <option value="model">Model A–Z</option>
                <option value="-model">Model Z–A</option>
              </select>
            </div>
          </div>

          {hasFilters && (
            <div className="mt-3 flex items-center justify-between">
              <p className="text-xs text-gray-500">
                Filters are applied to the batch dataset.
              </p>

              <button
                type="button"
                onClick={clearFilters}
                className="text-xs font-medium text-gray-600 underline underline-offset-2 hover:text-gray-900"
              >
                Clear filters
              </button>
            </div>
          )}
        </div>

        {/* Inline error */}
        {error && details && (
          <div className="border-b border-red-200 bg-red-50 px-6 py-3">
            <div className="flex items-center justify-between gap-4">
              <p className="text-sm text-red-700">{error}</p>

              <button
                type="button"
                onClick={loadBatchDetails}
                className="shrink-0 text-sm font-medium text-red-700 underline"
              >
                Retry
              </button>
            </div>
          </div>
        )}

        {/* Table */}
        <div className="overflow-x-auto">
          {details.pairs.length === 0 && !loading ? (
            <div className="flex min-h-[360px] flex-col items-center justify-center px-6 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gray-100">
                <span className="material-symbols-outlined text-[28px] text-gray-400">
                  footprint
                </span>
              </div>

              <h3 className="mt-4 text-sm font-semibold text-gray-900">
                {hasFilters
                  ? "No matching pairs"
                  : "No sneaker pairs yet"}
              </h3>

              <p className="mt-1 max-w-sm text-sm leading-6 text-gray-500">
                {hasFilters
                  ? "Try changing your search or filter criteria."
                  : "Sneaker pairs captured under this batch will appear here."}
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
          ) : (
            <table className="min-w-[1150px] w-full">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50/80">
                  <th className="px-6 py-3.5 text-left text-[11px] font-semibold uppercase tracking-wider text-gray-400">
                    Pair
                  </th>

                  <th className="px-4 py-3.5 text-left text-[11px] font-semibold uppercase tracking-wider text-gray-400">
                    Brand
                  </th>

                  <th className="px-4 py-3.5 text-left text-[11px] font-semibold uppercase tracking-wider text-gray-400">
                    Model
                  </th>

                  <th className="px-4 py-3.5 text-left text-[11px] font-semibold uppercase tracking-wider text-gray-400">
                    SKU
                  </th>

                  <th className="px-4 py-3.5 text-left text-[11px] font-semibold uppercase tracking-wider text-gray-400">
                    Size
                  </th>

                  <th className="px-4 py-3.5 text-left text-[11px] font-semibold uppercase tracking-wider text-gray-400">
                    Condition
                  </th>

                  <th className="px-4 py-3.5 text-left text-[11px] font-semibold uppercase tracking-wider text-gray-400">
                    Status
                  </th>

                  <th className="px-4 py-3.5 text-left text-[11px] font-semibold uppercase tracking-wider text-gray-400">
                    Images
                  </th>

                  <th className="px-6 py-3.5 text-right text-[11px] font-semibold uppercase tracking-wider text-gray-400">
                    Added
                  </th>
                </tr>
              </thead>

              <tbody className="divide-y divide-gray-100">
                {loading
                  ? Array.from({ length: 8 }).map((_, index) => (
                      <tr key={`skeleton-${index}`}>
                        <td className="px-6 py-4">
                          <div className="h-4 w-28 animate-pulse rounded bg-gray-200" />
                        </td>

                        <td className="px-4 py-4">
                          <div className="h-4 w-20 animate-pulse rounded bg-gray-200" />
                        </td>

                        <td className="px-4 py-4">
                          <div className="h-4 w-32 animate-pulse rounded bg-gray-200" />
                        </td>

                        <td className="px-4 py-4">
                          <div className="h-4 w-24 animate-pulse rounded bg-gray-200" />
                        </td>

                        <td className="px-4 py-4">
                          <div className="h-4 w-10 animate-pulse rounded bg-gray-200" />
                        </td>

                        <td className="px-4 py-4">
                          <div className="h-6 w-16 animate-pulse rounded-md bg-gray-200" />
                        </td>

                        <td className="px-4 py-4">
                          <div className="h-6 w-20 animate-pulse rounded-full bg-gray-200" />
                        </td>

                        <td className="px-4 py-4">
                          <div className="h-6 w-16 animate-pulse rounded-full bg-gray-200" />
                        </td>

                        <td className="px-6 py-4">
                          <div className="ml-auto h-4 w-20 animate-pulse rounded bg-gray-200" />
                        </td>
                      </tr>
                    ))
                  : details.pairs.map((pair) => {
                      const images = countCapturedImages(pair);

                      return (
                        <tr
                          key={pair.id}
                          className="group transition-colors hover:bg-gray-50"
                        >
                          <td className="px-6 py-4">
                            <Link
                              to={`/sneakers/${pair.id}`}
                              className="inline-flex items-center gap-2"
                            >
                              <span className="font-mono text-sm font-semibold text-gray-900 group-hover:underline">
                                {getPairId(pair)}
                              </span>

                              <span className="material-symbols-outlined text-[16px] text-gray-300 transition group-hover:text-gray-500">
                                arrow_outward
                              </span>
                            </Link>
                          </td>

                          <td className="px-4 py-4 text-sm font-medium text-gray-800">
                            {pair.brand || "—"}
                          </td>

                          <td className="max-w-[220px] px-4 py-4">
                            <span
                              className="block truncate text-sm text-gray-700"
                              title={pair.model || undefined}
                            >
                              {pair.model || "—"}
                            </span>
                          </td>

                          <td className="px-4 py-4 font-mono text-xs text-gray-500">
                            {pair.sku || "—"}
                          </td>

                          <td className="px-4 py-4 text-sm text-gray-700">
                            {pair.size || "—"}
                          </td>

                          <td className="px-4 py-4">
                            {pair.condition ? (
                              <span className="rounded-md bg-gray-100 px-2 py-1 text-xs font-medium text-gray-700">
                                {pair.condition}
                              </span>
                            ) : (
                              <span className="text-sm text-gray-400">
                                —
                              </span>
                            )}
                          </td>

                          <td className="px-4 py-4">
                            <span
                              className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium capitalize ring-1 ring-inset ${pairStatusClasses(
                                pair.status,
                              )}`}
                            >
                              {pair.status}
                            </span>
                          </td>

                          {/* Images */}
                          <td className="px-4 py-4">
                            <ImagesCell
                              uploaded={images.uploaded}
                              total={images.total}
                            />
                          </td>

                          <td className="whitespace-nowrap px-6 py-4 text-right text-xs text-gray-500">
                            {formatDate(pair.created_at)}
                          </td>
                        </tr>
                      );
                    })}
              </tbody>
            </table>
          )}
        </div>

        {/* Pagination */}
        {details.meta.count > 0 && totalPages > 1 && (
          <div className="flex flex-col gap-4 border-t border-gray-200 px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-xs text-gray-500">
              <span className="font-medium text-gray-700">
                Page {page}
              </span>

              <span className="mx-1.5 text-gray-300">·</span>

              {details.meta.count.toLocaleString()} total pairs
            </div>

            <nav
              className="flex items-center gap-1"
              aria-label="Pagination"
            >
              <button
                type="button"
                disabled={page === 1 || loading}
                onClick={() =>
                  setPage((current) =>
                    Math.max(1, current - 1),
                  )
                }
                className="mr-1 inline-flex h-9 w-9 items-center justify-center rounded-lg border border-gray-300 bg-white text-gray-600 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-30"
                aria-label="Previous page"
              >
                <span className="material-symbols-outlined text-[19px]">
                  chevron_left
                </span>
              </button>

              {paginationItems.map((item, index) => {
                if (item === "ellipsis") {
                  return (
                    <span
                      key={`ellipsis-${index}`}
                      className="flex h-9 w-9 items-center justify-center text-sm text-gray-400"
                    >
                      …
                    </span>
                  );
                }

                const isCurrent = item === page;

                return (
                  <button
                    key={item}
                    type="button"
                    disabled={loading}
                    onClick={() => {
                      if (item !== page) {
                        setPage(item);
                      }
                    }}
                    className={`inline-flex h-9 min-w-9 items-center justify-center rounded-lg px-2.5 text-sm font-medium transition ${
                      isCurrent
                        ? "bg-gray-900 text-white shadow-sm"
                        : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
                    } ${
                      loading
                        ? "cursor-not-allowed opacity-60"
                        : ""
                    }`}
                    aria-current={isCurrent ? "page" : undefined}
                  >
                    {item}
                  </button>
                );
              })}

              <button
                type="button"
                disabled={page === totalPages || loading}
                onClick={() =>
                  setPage((current) =>
                    Math.min(totalPages, current + 1),
                  )
                }
                className="ml-1 inline-flex h-9 w-9 items-center justify-center rounded-lg border border-gray-300 bg-white text-gray-600 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-30"
                aria-label="Next page"
              >
                <span className="material-symbols-outlined text-[19px]">
                  chevron_right
                </span>
              </button>
            </nav>
          </div>
        )}
      </section>

      {/* Edit modal */}
      {showEditModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-lg rounded-2xl bg-white shadow-2xl">
            <form onSubmit={handleEditBatch}>
              <div className="border-b border-gray-200 px-6 py-5">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-lg font-semibold text-gray-900">
                      Edit batch
                    </h2>

                    <p className="mt-1 text-sm text-gray-500">
                      Update the batch information.
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => setShowEditModal(false)}
                    className="text-gray-400 hover:text-gray-700"
                  >
                    <span className="material-symbols-outlined">
                      close
                    </span>
                  </button>
                </div>
              </div>

              <div className="space-y-5 px-6 py-6">
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-700">
                    Batch name
                  </label>

                  <input
                    type="text"
                    value={editName}
                    onChange={(event) =>
                      setEditName(event.target.value)
                    }
                    className="h-11 w-full rounded-lg border border-gray-300 px-3 text-sm outline-none focus:border-gray-500 focus:ring-2 focus:ring-gray-200"
                  />
                </div>

                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-700">
                    Source
                  </label>

                  <input
                    type="text"
                    value={editSource}
                    onChange={(event) =>
                      setEditSource(event.target.value)
                    }
                    className="h-11 w-full rounded-lg border border-gray-300 px-3 text-sm outline-none focus:border-gray-500 focus:ring-2 focus:ring-gray-200"
                  />
                </div>

                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-700">
                    Expected quantity
                  </label>

                  <input
                    type="number"
                    min="1"
                    value={editQuantity}
                    onChange={(event) =>
                      setEditQuantity(event.target.value)
                    }
                    className="h-11 w-full rounded-lg border border-gray-300 px-3 text-sm outline-none focus:border-gray-500 focus:ring-2 focus:ring-gray-200"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-3 border-t border-gray-200 px-6 py-4">
                <button
                  type="button"
                  onClick={() => setShowEditModal(false)}
                  className="rounded-lg border border-gray-300 px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  disabled={actionLoading}
                  className="inline-flex items-center gap-2 rounded-lg bg-gray-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
                >
                  {actionLoading && (
                    <span className="material-symbols-outlined animate-spin text-[18px]">
                      progress_activity
                    </span>
                  )}

                  Save changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Cleanup modal */}
      <BatchCleanupModal
        open={showCleanup}
        batchLabel={batchLabel}
        loading={cleanupLoading}
        deleting={cleanupDeleting}
        error={cleanupError}
        preview={cleanupPreview}
        job={cleanupJob}
        confirming={cleanupConfirming}
        onClose={closeCleanup}
        onDismiss={dismissCleanup}
        onConfirmStage={() => setCleanupConfirming(true)}
        onDelete={handleCleanupDelete}
      />

      {/* Bulk upload modal */}
      <BulkUploadModal
        open={showBulkUpload}
        batchId={batchId!}
        onClose={() => setShowBulkUpload(false)}
      />

      {/* Add pair modal */}
      <AddPairModal
        open={showAddPair}
        batchId={batchId!}
        onClose={() => {
          setShowAddPair(false);
          setPage(1);
          loadBatchDetails();
        }}
        onCreated={() => {
          setShowAddPair(false);
          setPage(1);
          loadBatchDetails();
          showToast(
            "success",
            "Pair created and images uploaded.",
          );
        }}
      />

      {/* Open batch confirmation */}
      <ConfirmDialog
        open={confirmAction === "open"}
        tone="primary"
        icon="play_arrow"
        title="Open this batch?"
        description="Opening the batch allows new sneaker pairs to be captured under it. You can close it again at any time."
        confirmLabel="Open batch"
        loading={actionLoading}
        error={confirmError}
        onConfirm={handleOpenBatch}
        onCancel={() => setConfirmAction(null)}
      />

      {/* Close batch confirmation */}
      <ConfirmDialog
        open={confirmAction === "close"}
        tone="primary"
        icon="lock"
        title="Close this batch?"
        description="Closing the batch will stop new sneaker pairs from being added. Existing pairs will remain available."
        confirmLabel="Close batch"
        loading={actionLoading}
        error={confirmError}
        onConfirm={handleCloseBatch}
        onCancel={() => setConfirmAction(null)}
      />

      {/* Delete batch confirmation */}
      <ConfirmDialog
        open={confirmAction === "delete"}
        tone="danger"
        icon="delete"
        title="Delete this batch?"
        description={`Batch ${batchLabel} and its ${details.meta.count} captured pair${
          details.meta.count === 1 ? "" : "s"
        } will be permanently removed. This action cannot be undone.`}
        confirmLabel="Delete batch"
        loading={actionLoading}
        error={confirmError}
        onConfirm={handleDeleteBatch}
        onCancel={() => setConfirmAction(null)}
      />
    </div>
  );
}