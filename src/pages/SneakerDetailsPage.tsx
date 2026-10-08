import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";

import AiAnalysisCard from "../components/verification/AiAnalysisCard";
import ImageViewer from "../components/verification/ImageViewer";
import VerificationPanel, {
  type VerificationPanelHandle,
} from "../components/verification/VerificationPanel";
import DeletePairDialog from "../components/sneakers/DeletePairDialog";
import ReplaceImagesModal from "../components/sneakers/ReplaceImagesModal";
import {
  getLatestAiJob,
  getLatestAnalysisRun,
  getReviewQueueNeighbors,
  getSneaker,
  getVerificationEligibility,
} from "../lib/api";
import type {
  AIIdentificationJob,
  AnalysisRun,
  ReviewQueueNeighbors,
  SneakerPair,
  VerificationEligibility,
} from "../lib/types";
import {
  aiAnalysisFrom,
  angleSlots,
  verificationBlockers,
} from "../lib/verification";

interface Toast {
  type: "success" | "error";
  message: string;
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return "—";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "—";
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function getPairId(pair: SneakerPair) {
  return pair.pair_id ?? pair.id;
}

function statusClasses(status: string) {
  switch (status.toLowerCase()) {
    case "received":
      return "bg-blue-50 text-blue-700 ring-blue-600/10";

    case "identification":
      return "bg-purple-50 text-purple-700 ring-purple-600/10";

    case "verification":
      return "bg-amber-50 text-amber-700 ring-amber-600/10";

    case "verified":
      return "bg-emerald-50 text-emerald-700 ring-emerald-600/10";

    default:
      return "bg-gray-50 text-gray-700 ring-gray-600/10";
  }
}

function formatStatus(status: string) {
  if (!status) return "Unknown";

  return status
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

/* A message fit for the page; never Axios's own error text. */
function loadErrorMessage(error: unknown) {
  const e = error as {
    response?: { status?: number; data?: { error?: { message?: string } } };
  };

  if (!e?.response) {
    return "Couldn't reach the server. Check your connection and try again.";
  }

  if (e.response.status === 404) {
    return "This sneaker pair doesn't exist or has been deleted.";
  }

  return (
    e.response.data?.error?.message ||
    "Something went wrong while loading this sneaker."
  );
}

function WorkspaceSkeleton() {
  return (
    <div className="animate-pulse" aria-label="Loading sneaker pair">
      <div className="h-8 w-20 rounded-lg bg-gray-200" />

      <div className="mt-5 space-y-3">
        <div className="h-8 w-56 rounded bg-gray-200" />
        <div className="h-4 w-40 rounded bg-gray-200" />
        <div className="h-6 w-24 rounded-full bg-gray-200" />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
        <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm sm:p-6">
          <div className="h-5 w-24 rounded bg-gray-200" />
          <div className="mt-4 aspect-[4/3] rounded-xl bg-gray-200" />
          <div className="mt-4 grid grid-cols-3 gap-2.5 sm:grid-cols-6">
            {Array.from({ length: 6 }).map((_, index) => (
              <div key={index} className="aspect-square rounded-xl bg-gray-200" />
            ))}
          </div>
        </div>

        <div className="space-y-6">
          <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm sm:p-6">
            <div className="h-4 w-28 rounded bg-gray-200" />
            <div className="mt-4 h-2 w-full rounded bg-gray-200" />
            <div className="mt-4 grid grid-cols-2 gap-3">
              {Array.from({ length: 4 }).map((_, index) => (
                <div key={index} className="h-10 rounded bg-gray-200" />
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm sm:p-6">
            <div className="h-5 w-32 rounded bg-gray-200" />
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              {Array.from({ length: 5 }).map((_, index) => (
                <div
                  key={index}
                  className={index === 4 ? "sm:col-span-2" : undefined}
                >
                  <div className="h-4 w-16 rounded bg-gray-200" />
                  <div className="mt-2 h-11 rounded-lg bg-gray-200" />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function ToastMessage({
  toast,
  onDismiss,
}: {
  toast: Toast;
  onDismiss: () => void;
}) {
  const success = toast.type === "success";

  return (
    <div className="fixed right-4 top-4 z-50 w-[calc(100%-2rem)] max-w-sm">
      <div
        role="status"
        className={`flex items-start gap-3 rounded-xl border bg-white p-4 shadow-lg ${
          success ? "border-emerald-200" : "border-red-200"
        }`}
      >
        <div
          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
            success ? "bg-emerald-50" : "bg-red-50"
          }`}
        >
          <span
            aria-hidden="true"
            className={`material-symbols-outlined text-[18px] ${
              success ? "text-emerald-600" : "text-red-600"
            }`}
          >
            {success ? "check" : "error"}
          </span>
        </div>

        <p className="min-w-0 flex-1 text-sm font-medium text-gray-900">
          {toast.message}
        </p>

        <button
          type="button"
          onClick={onDismiss}
          className="text-gray-400 transition hover:text-gray-600"
          aria-label="Dismiss notification"
        >
          <span aria-hidden="true" className="material-symbols-outlined text-[18px]">close</span>
        </button>
      </div>
    </div>
  );
}

function DetailRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2.5">
      <dt className="shrink-0 text-sm text-gray-500">{label}</dt>
      <dd className="min-w-0 text-right text-sm font-medium text-gray-900">
        {children}
      </dd>
    </div>
  );
}

/**
 * The verification workspace for one sneaker pair: its photos on the
 * left; AI suggestions, the verified values and record details on the
 * right.
 */
function Workspace({ sneakerId }: { sneakerId: string }) {
  const navigate = useNavigate();
  const location = useLocation();

  const [sneaker, setSneaker] = useState<SneakerPair | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<Toast | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [replacingImages, setReplacingImages] = useState(false);

  const [aiJob, setAiJob] = useState<AIIdentificationJob | null>(null);
  const [aiRun, setAiRun] = useState<AnalysisRun | null>(null);
  const [aiLoading, setAiLoading] = useState(true);
  const [aiError, setAiError] = useState(false);

  const [eligibility, setEligibility] =
    useState<VerificationEligibility | null>(null);
  const [eligibilityLoading, setEligibilityLoading] = useState(true);

  // The fetchers only set state once their request settles; callers
  // flip the loading flags first (see refresh/retry below).
  const fetchAiJob = useCallback(
    () =>
      Promise.all([getLatestAiJob(sneakerId), getLatestAnalysisRun(sneakerId)])
        .then(
          ([job, run]) => {
            setAiJob(job);
            setAiRun(run);
            setAiError(false);
          },
          () => setAiError(true),
        )
        .finally(() => setAiLoading(false)),
    [sneakerId],
  );

  const fetchEligibility = useCallback(
    () =>
      getVerificationEligibility(sneakerId)
        // On failure the panel falls back to the status rule the
        // backend enforces.
        .then(setEligibility, () => setEligibility(null))
        .finally(() => setEligibilityLoading(false)),
    [sneakerId],
  );

  const fetchSneaker = useCallback(
    (isRefresh: boolean) =>
      getSneaker(sneakerId)
        .then(
          (pair) => {
            setSneaker(pair);
            setError(null);
            if (isRefresh) {
              setToast({ type: "success", message: "Pair refreshed." });
            }
          },
          (err) => {
            if (isRefresh) {
              setToast({ type: "error", message: loadErrorMessage(err) });
            } else {
              setError(loadErrorMessage(err));
            }
          },
        )
        .finally(() => {
          setLoading(false);
          setRefreshing(false);
        }),
    [sneakerId],
  );

  // Opened from the review queue: previous/next pair in that queue.
  const fromQueue = new URLSearchParams(location.search).get("from") === "queue";
  const [neighbors, setNeighbors] = useState<ReviewQueueNeighbors | null>(null);
  useEffect(() => {
    if (!fromQueue) return;
    getReviewQueueNeighbors(sneakerId).then(setNeighbors, () => setNeighbors(null));
  }, [fromQueue, sneakerId]);

  const panel = useRef<VerificationPanelHandle>(null);

  // AI results and eligibility load on their own; a failure in either
  // never blocks the pair itself.
  useEffect(() => {
    fetchSneaker(false);
    fetchAiJob();
    fetchEligibility();
  }, [fetchSneaker, fetchAiJob, fetchEligibility]);

  function reloadAiJob() {
    setAiLoading(true);
    fetchAiJob();
  }

  function reloadEligibility() {
    setEligibilityLoading(true);
    fetchEligibility();
  }

  function reload(isRefresh: boolean) {
    if (isRefresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    fetchSneaker(isRefresh);
    reloadAiJob();
    reloadEligibility();
  }

  useEffect(() => {
    if (!toast) return;

    const timeout = window.setTimeout(() => setToast(null), 3500);

    return () => window.clearTimeout(timeout);
  }, [toast]);

  const slots = useMemo(
    () => (sneaker ? angleSlots(sneaker) : []),
    [sneaker],
  );

  const analysis = aiAnalysisFrom(aiJob, aiRun, {
    loading: aiLoading,
    error: aiError,
  });

  // Opened from a direct link there's no page to go back to.
  const goBack = () =>
    location.key === "default" ? navigate("/sneakers") : navigate(-1);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
          <WorkspaceSkeleton />
        </main>
      </div>
    );
  }

  if (error || !sneaker) {
    return (
      <div className="min-h-screen bg-gray-50">
        <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
          <div className="rounded-2xl border border-red-200 bg-white p-8 text-center shadow-sm">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-red-50">
              <span aria-hidden="true" className="material-symbols-outlined text-red-600">
                error
              </span>
            </div>

            <h2 className="mt-4 text-lg font-semibold text-gray-900">
              Unable to load sneaker
            </h2>

            <p className="mx-auto mt-2 max-w-md text-sm text-gray-500">
              {error ?? "The sneaker could not be found."}
            </p>

            <div className="mt-6 flex flex-col justify-center gap-3 sm:flex-row">
              <button
                type="button"
                onClick={() => reload(false)}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-gray-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-gray-800"
              >
                <span aria-hidden="true" className="material-symbols-outlined text-[18px]">
                  refresh
                </span>
                Try again
              </button>

              <button
                type="button"
                onClick={goBack}
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 transition hover:bg-gray-50"
              >
                <span aria-hidden="true" className="material-symbols-outlined text-[18px]">
                  arrow_back
                </span>
                Go back
              </button>
            </div>
          </div>
        </main>
      </div>
    );
  }

  const displayPairId = getPairId(sneaker);
  const isVerified = sneaker.status.toLowerCase() === "verified";
  const summary = [sneaker.brand, sneaker.model].filter(Boolean).join(" ");
  const readySessions =
    sneaker.capture_sessions?.filter((session) => session.is_ready).length ??
    0;
  const totalSessions = sneaker.capture_sessions?.length ?? 0;

  return (
    <div className="min-h-screen bg-gray-50">
      {toast && (
        <ToastMessage toast={toast} onDismiss={() => setToast(null)} />
      )}

      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        {/* Header */}
        <button
          type="button"
          onClick={goBack}
          className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 -ml-2 text-sm font-medium text-gray-500 transition hover:bg-gray-100 hover:text-gray-900"
        >
          <span aria-hidden="true" className="material-symbols-outlined text-[18px]">
            arrow_back
          </span>
          Back
        </button>

        {fromQueue && neighbors && (
          <nav
            aria-label="Review queue"
            className="mt-3 flex items-center justify-between gap-3 rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm shadow-sm"
          >
            <Link
              to="/review-queue"
              className="font-medium text-gray-700 hover:text-gray-900"
            >
              Review queue
              {neighbors.position !== null
                ? ` · ${neighbors.position} of ${neighbors.total}`
                : ` · ${neighbors.total} left`}
            </Link>
            <div className="flex gap-2">
              {[
                { id: neighbors.previous, label: "Previous", icon: "chevron_left" },
                { id: neighbors.next, label: "Next", icon: "chevron_right" },
              ].map(({ id, label, icon }) =>
                id ? (
                  <Link
                    key={label}
                    to={`/sneakers/${id}?from=queue`}
                    className="inline-flex items-center gap-1 rounded-lg border border-gray-200 px-2.5 py-1 font-medium text-gray-700 hover:bg-gray-50"
                  >
                    {label === "Previous" && (
                      <span aria-hidden="true" className="material-symbols-outlined text-[18px]">{icon}</span>
                    )}
                    {label}
                    {label === "Next" && (
                      <span aria-hidden="true" className="material-symbols-outlined text-[18px]">{icon}</span>
                    )}
                  </Link>
                ) : (
                  <span
                    key={label}
                    className="rounded-lg border border-gray-100 px-2.5 py-1 text-gray-300"
                  >
                    {label}
                  </span>
                ),
              )}
            </div>
          </nav>
        )}

        <header className="mt-3 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0">
            <h1 className="break-all font-mono text-2xl font-semibold tracking-tight text-gray-900 sm:text-3xl">
              {displayPairId}
            </h1>

            <p className="mt-1 text-sm text-gray-500">
              {summary || "Brand and model not recorded"}
            </p>

            <span
              className={`mt-3 inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset ${statusClasses(
                sneaker.status,
              )}`}
            >
              {formatStatus(sneaker.status)}
            </span>
          </div>

          <div className="flex shrink-0 flex-wrap gap-2">
            <button
              type="button"
              onClick={() => reload(true)}
              disabled={refreshing}
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <span
                aria-hidden="true"
                className={`material-symbols-outlined text-[18px] ${
                  refreshing ? "animate-spin" : ""
                }`}
              >
                refresh
              </span>
              {refreshing ? "Refreshing…" : "Refresh"}
            </button>

            <button
              type="button"
              onClick={() => setDeleting(true)}
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-red-200 bg-white px-4 py-2.5 text-sm font-medium text-red-600 transition hover:bg-red-50"
            >
              <span aria-hidden="true" className="material-symbols-outlined text-[18px]">
                delete
              </span>
              Delete
            </button>
          </div>
        </header>

        <DeletePairDialog
          pair={deleting ? sneaker : null}
          onClose={() => setDeleting(false)}
          onDeleted={() =>
            navigate(`/batches/${sneaker.batch}`, { replace: true })
          }
        />

        <ReplaceImagesModal
          pair={replacingImages ? sneaker : null}
          onClose={() => setReplacingImages(false)}
          onReplaced={(count, finished) => {
            // Refresh in place (no skeleton) so the viewer shows the swap;
            // a complete set of photos can change eligibility.
            getSneaker(sneaker.id).then(setSneaker, () => {});
            reloadEligibility();
            if (finished) setReplacingImages(false);
            setToast({
              type: "success",
              message: `${count} ${count === 1 ? "photo" : "photos"} replaced.`,
            });
          }}
        />

        {/* Workspace */}
        <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
          <div className="lg:sticky lg:top-6 lg:self-start">
            <ImageViewer
              key={sneaker.id}
              slots={slots}
              pairLabel={displayPairId}
              actions={
                <button
                  type="button"
                  onClick={() => setReplacingImages(true)}
                  disabled={isVerified}
                  title={
                    isVerified
                      ? "Verified pairs can't have their photos changed"
                      : undefined
                  }
                  className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <span aria-hidden="true" className="material-symbols-outlined text-[16px]">
                    {isVerified ? "lock" : "photo_library"}
                  </span>
                  {isVerified ? "Photos locked" : "Replace photos"}
                </button>
              }
            />
          </div>

          <div className="min-w-0 space-y-6">
            <AiAnalysisCard
              analysis={analysis}
              onRetry={reloadAiJob}
              onApplyCandidate={(candidate) =>
                panel.current?.applyCandidate(candidate)
              }
              readOnly={isVerified}
            />

            <VerificationPanel
              key={`${sneaker.id}:${sneaker.updated_at}`}
              pair={sneaker}
              ref={panel}
              suggestion={
                analysis.kind === "ready" ? analysis.suggestion : null
              }
              blockers={verificationBlockers(sneaker, eligibility)}
              checkingEligibility={eligibilityLoading}
              onSaved={(updated) => {
                setSneaker(updated);
                setToast({ type: "success", message: "Changes saved." });
              }}
              onAdvanced={(updated, message) => {
                setSneaker(updated);
                reloadEligibility();
                setToast({ type: "success", message });
              }}
              onVerified={(updated) => {
                setSneaker(updated);
                setToast({ type: "success", message: "Pair verified." });
              }}
            />

            <section className="rounded-2xl border border-gray-200 bg-white px-5 py-4 shadow-sm sm:px-6">
              <h2 className="text-base font-semibold text-gray-900">
                Record
              </h2>

              <dl className="mt-2 divide-y divide-gray-100">
                <DetailRow label="Pair number">
                  {sneaker.pair_number ?? "—"}
                </DetailRow>
                <DetailRow label="Batch">
                  <Link
                    to={`/batches/${sneaker.batch}`}
                    className="inline-flex max-w-full items-center gap-1 text-gray-900 hover:text-gray-600"
                  >
                    <span className="truncate">View batch</span>
                    <span aria-hidden="true" className="material-symbols-outlined shrink-0 text-[16px]">
                      arrow_forward
                    </span>
                  </Link>
                </DetailRow>
                <DetailRow label="Capture sessions">
                  {readySessions} of {totalSessions} complete
                </DetailRow>
                <DetailRow label="Created">
                  {formatDateTime(sneaker.created_at)}
                </DetailRow>
                <DetailRow label="Last updated">
                  {formatDateTime(sneaker.updated_at)}
                </DetailRow>
              </dl>
            </section>
          </div>
        </div>
      </main>
    </div>
  );
}

/* Keyed by id, so moving to another pair starts from a clean slate. */
export default function SneakerDetailsPage() {
  const { sneakerId = "" } = useParams<{ sneakerId: string }>();

  return <Workspace key={sneakerId} sneakerId={sneakerId} />;
}
