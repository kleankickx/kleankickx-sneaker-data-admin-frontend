import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { getSneaker } from "../lib/api";
import type {
  CaptureImage,
  SneakerPair,
} from "../lib/types";

interface Toast {
  type: "success" | "error";
  message: string;
}

function formatDate(value: string | null | undefined) {
  if (!value) return "—";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "—";
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
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

function imageStatusClasses(status: string) {
  switch (status.toLowerCase()) {
    case "uploaded":
      return "bg-emerald-50 text-emerald-700";

    case "uploading":
      return "bg-blue-50 text-blue-700";

    case "pending":
      return "bg-amber-50 text-amber-700";

    case "failed":
      return "bg-red-50 text-red-700";

    default:
      return "bg-gray-50 text-gray-600";
  }
}

function formatStatus(status: string) {
  if (!status) return "Unknown";

  return status
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatAngle(angle: string) {
  if (!angle) return "Unknown";

  return angle
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function getErrorMessage(error: any) {
  return (
    error?.response?.data?.error?.message ||
    error?.response?.data?.message ||
    error?.message ||
    "Something went wrong while loading this sneaker."
  );
}

function DetailSkeleton() {
  return (
    <div className="animate-pulse space-y-6">
      <div className="h-4 w-48 rounded bg-gray-200" />

      <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-4">
            <div className="h-4 w-32 rounded bg-gray-200" />
            <div className="h-9 w-64 rounded bg-gray-200" />
            <div className="h-4 w-40 rounded bg-gray-200" />
          </div>

          <div className="h-9 w-28 rounded-xl bg-gray-200" />
        </div>
      </div>

      <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="h-6 w-40 rounded bg-gray-200" />

        <div className="mt-5 aspect-[16/10] rounded-xl bg-gray-200" />

        <div className="mt-4 grid grid-cols-4 gap-3 sm:grid-cols-6">
          {Array.from({ length: 6 }).map((_, index) => (
            <div
              key={index}
              className="aspect-square rounded-xl bg-gray-200"
            />
          ))}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <div
            key={index}
            className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm"
          >
            <div className="h-4 w-24 rounded bg-gray-200" />
            <div className="mt-3 h-6 w-32 rounded bg-gray-200" />
          </div>
        ))}
      </div>
    </div>
  );
}

function EmptyImages() {
  return (
    <div className="flex aspect-[16/10] flex-col items-center justify-center rounded-xl border border-dashed border-gray-200 bg-gray-50">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white shadow-sm">
        <span className="material-symbols-outlined text-[28px] text-gray-400">
          photo_camera
        </span>
      </div>

      <h3 className="mt-4 text-sm font-semibold text-gray-900">
        No uploaded images
      </h3>

      <p className="mt-1 max-w-sm text-center text-sm text-gray-500">
        No completed capture images are available for this sneaker pair yet.
      </p>
    </div>
  );
}

export default function SneakerDetailsPage() {
  const { sneakerId } = useParams<{ sneakerId: string }>();
  const navigate = useNavigate();

  const [sneaker, setSneaker] = useState<SneakerPair | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<Toast | null>(null);
  const [selectedImageId, setSelectedImageId] = useState<string | null>(
    null,
  );

  const loadSneaker = useCallback(
    async (isRefresh = false) => {
      if (!sneakerId) {
        setError("Sneaker ID is missing.");
        setLoading(false);
        return;
      }

      try {
        if (isRefresh) {
          setRefreshing(true);
        } else {
          setLoading(true);
        }

        setError(null);

        const data = await getSneaker(sneakerId);

        setSneaker(data);

        if (isRefresh) {
          setToast({
            type: "success",
            message: "Sneaker details refreshed.",
          });
        }
      } catch (err) {
        setError(getErrorMessage(err));
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [sneakerId],
  );

  useEffect(() => {
    loadSneaker();
  }, [loadSneaker]);

  useEffect(() => {
    if (!toast) return;

    const timeout = window.setTimeout(() => {
      setToast(null);
    }, 3500);

    return () => {
      window.clearTimeout(timeout);
    };
  }, [toast]);

  const uploadedImages = useMemo(() => {
    const sessions = sneaker?.capture_sessions ?? [];

    const images: CaptureImage[] = [];

    for (const session of sessions) {
      for (const image of session.images ?? []) {
        if (
          image.status.toLowerCase() === "uploaded" &&
          image.image_url
        ) {
          images.push(image);
        }
      }
    }

    return images;
  }, [sneaker]);

  useEffect(() => {
    if (uploadedImages.length === 0) {
      setSelectedImageId(null);
      return;
    }

    const currentStillExists = uploadedImages.some(
      (image) => image.id === selectedImageId,
    );

    if (currentStillExists) {
      return;
    }

    const overviewImage = uploadedImages.find(
      (image) => image.angle.toLowerCase() === "overview",
    );

    setSelectedImageId(
      overviewImage?.id ?? uploadedImages[0].id,
    );
  }, [uploadedImages, selectedImageId]);

  const selectedImage = useMemo(() => {
    if (!uploadedImages.length) {
      return null;
    }

    return (
      uploadedImages.find(
        (image) => image.id === selectedImageId,
      ) ?? uploadedImages[0]
    );
  }, [uploadedImages, selectedImageId]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
          <DetailSkeleton />
        </main>
      </div>
    );
  }

  if (error || !sneaker) {
    return (
      <div className="min-h-screen bg-gray-50">
        <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
          <div className="mb-6 flex items-center gap-2 text-sm">
            <Link
              to="/sneakers"
              className="text-gray-500 transition hover:text-gray-900"
            >
              Sneakers
            </Link>

            <span className="text-gray-300">/</span>

            <span className="text-gray-900">Details</span>
          </div>

          <div className="rounded-2xl border border-red-200 bg-white p-8 text-center shadow-sm">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-red-50">
              <span className="material-symbols-outlined text-red-600">
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
                onClick={() => loadSneaker()}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-gray-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-gray-800"
              >
                <span className="material-symbols-outlined text-[18px]">
                  refresh
                </span>
                Try again
              </button>

              <button
                type="button"
                onClick={() => navigate(-1)}
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 transition hover:bg-gray-50"
              >
                Go back
              </button>
            </div>
          </div>
        </main>
      </div>
    );
  }

  const displayPairId = getPairId(sneaker);

  const totalCaptureSessions =
    sneaker.capture_sessions?.length ?? 0;

  const readyCaptureSessions =
    sneaker.capture_sessions?.filter(
      (session) => session.is_ready,
    ).length ?? 0;

  return (
    <div className="min-h-screen bg-gray-50">
      {toast && (
        <div className="fixed right-4 top-4 z-50 w-[calc(100%-2rem)] max-w-sm">
          <div
            className={`flex items-start gap-3 rounded-xl border bg-white p-4 shadow-lg ${
              toast.type === "success"
                ? "border-emerald-200"
                : "border-red-200"
            }`}
          >
            <div
              className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
                toast.type === "success"
                  ? "bg-emerald-50"
                  : "bg-red-50"
              }`}
            >
              <span
                className={`material-symbols-outlined text-[18px] ${
                  toast.type === "success"
                    ? "text-emerald-600"
                    : "text-red-600"
                }`}
              >
                {toast.type === "success"
                  ? "check"
                  : "error"}
              </span>
            </div>

            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-gray-900">
                {toast.message}
              </p>
            </div>

            <button
              type="button"
              onClick={() => setToast(null)}
              className="text-gray-400 transition hover:text-gray-600"
              aria-label="Dismiss notification"
            >
              <span className="material-symbols-outlined text-[18px]">
                close
              </span>
            </button>
          </div>
        </div>
      )}

      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        {/* Breadcrumb */}
        <div className="mb-6 flex flex-wrap items-center gap-2 text-sm">
          <Link
            to="/sneakers"
            className="text-gray-500 transition hover:text-gray-900"
          >
            Sneakers
          </Link>

          <span className="text-gray-300">/</span>

          <span className="font-medium text-gray-900">
            {displayPairId}
          </span>
        </div>

        {/* Header */}
        <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm sm:p-7">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-3">
                <span className="inline-flex items-center rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-600">
                  Sneaker Pair
                </span>

                <span
                  className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset ${statusClasses(
                    sneaker.status,
                  )}`}
                >
                  {formatStatus(sneaker.status)}
                </span>
              </div>

              <h1 className="mt-4 break-words text-2xl font-semibold tracking-tight text-gray-900 sm:text-3xl">
                {displayPairId}
              </h1>

              <p className="mt-2 text-sm text-gray-500">
                {sneaker.brand || "Unknown brand"}
                {sneaker.model
                  ? ` · ${sneaker.model}`
                  : ""}
              </p>
            </div>

            <div className="flex shrink-0 flex-wrap gap-2">
              <button
                type="button"
                onClick={() => loadSneaker(true)}
                disabled={refreshing}
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <span
                  className={`material-symbols-outlined text-[18px] ${
                    refreshing ? "animate-spin" : ""
                  }`}
                >
                  refresh
                </span>

                {refreshing
                  ? "Refreshing..."
                  : "Refresh"}
              </button>

              <button
                type="button"
                onClick={() => navigate(-1)}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-gray-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-gray-800"
              >
                <span className="material-symbols-outlined text-[18px]">
                  arrow_back
                </span>
                Back
              </button>
            </div>
          </div>
        </section>

        {/* Image gallery */}
        <section className="mt-6 rounded-2xl border border-gray-200 bg-white p-6 shadow-sm sm:p-7">
          <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-base font-semibold text-gray-900">
                Capture images
              </h2>

              <p className="mt-1 text-sm text-gray-500">
                Images captured during the sneaker intake process.
              </p>
            </div>

            <div className="mt-2 flex items-center gap-2 sm:mt-0">
              <span className="inline-flex items-center rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-600">
                {uploadedImages.length}{" "}
                {uploadedImages.length === 1
                  ? "image"
                  : "images"}
              </span>
            </div>
          </div>

          <div className="mt-5">
            {!selectedImage ? (
              <EmptyImages />
            ) : (
              <>
                {/* Main image */}
                <div className="group relative overflow-hidden rounded-2xl border border-gray-200 bg-gray-50">
                  <div className="flex aspect-[16/10] items-center justify-center">
                    <img
                      src={selectedImage.image_url ?? ""}
                      alt={`${formatAngle(
                        selectedImage.angle,
                      )} view of ${displayPairId}`}
                      className="h-full w-full object-contain"
                    />
                  </div>

                  <div className="absolute bottom-4 left-4">
                    <span className="inline-flex items-center gap-1.5 rounded-lg bg-black/70 px-3 py-1.5 text-xs font-medium text-white backdrop-blur-sm">
                      <span className="material-symbols-outlined text-[15px]">
                        photo_camera
                      </span>
                      {formatAngle(selectedImage.angle)}
                    </span>
                  </div>
                </div>

                {/* Thumbnails */}
                <div className="mt-4">
                  <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-6">
                    {uploadedImages.map((image) => {
                      const isSelected =
                        image.id === selectedImage.id;

                      return (
                        <button
                          key={image.id}
                          type="button"
                          onClick={() =>
                            setSelectedImageId(image.id)
                          }
                          className={`group relative overflow-hidden rounded-xl border-2 bg-gray-50 transition ${
                            isSelected
                              ? "border-gray-900"
                              : "border-transparent hover:border-gray-300"
                          }`}
                        >
                          <div className="aspect-square">
                            <img
                              src={image.image_url ?? ""}
                              alt={`${formatAngle(
                                image.angle,
                              )} view`}
                              className="h-full w-full object-cover transition duration-200 group-hover:scale-105"
                            />
                          </div>

                          <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent px-2 pb-2 pt-5">
                            <p className="truncate text-left text-[11px] font-medium text-white">
                              {formatAngle(image.angle)}
                            </p>
                          </div>

                          {isSelected && (
                            <div className="absolute right-2 top-2 flex h-5 w-5 items-center justify-center rounded-full bg-gray-900 text-white">
                              <span className="material-symbols-outlined text-[14px]">
                                check
                              </span>
                            </div>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </>
            )}
          </div>
        </section>

        {/* Overview cards */}
        <section className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-gray-500">
                Brand
              </p>

              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gray-50">
                <span className="material-symbols-outlined text-[20px] text-gray-500">
                  sell
                </span>
              </div>
            </div>

            <p className="mt-3 truncate text-lg font-semibold text-gray-900">
              {sneaker.brand || "Unknown"}
            </p>
          </div>

          <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-gray-500">
                Model
              </p>

              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gray-50">
                <span className="material-symbols-outlined text-[20px] text-gray-500">
                  category
                </span>
              </div>
            </div>

            <p className="mt-3 truncate text-lg font-semibold text-gray-900">
              {sneaker.model || "Unknown"}
            </p>
          </div>

          <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-gray-500">
                Size
              </p>

              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gray-50">
                <span className="material-symbols-outlined text-[20px] text-gray-500">
                  straighten
                </span>
              </div>
            </div>

            <p className="mt-3 text-lg font-semibold text-gray-900">
              {sneaker.size || "Unknown"}
            </p>
          </div>

          <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-gray-500">
                Condition
              </p>

              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gray-50">
                <span className="material-symbols-outlined text-[20px] text-gray-500">
                  verified
                </span>
              </div>
            </div>

            <p className="mt-3 text-lg font-semibold text-gray-900">
              {sneaker.condition
                ? sneaker.condition.toUpperCase()
                : "Unknown"}
            </p>
          </div>
        </section>

        {/* Capture overview */}
        <section className="mt-6 overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
          <div className="border-b border-gray-100 px-6 py-5">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gray-50">
                <span className="material-symbols-outlined text-[20px] text-gray-600">
                  photo_library
                </span>
              </div>

              <div>
                <h2 className="text-base font-semibold text-gray-900">
                  Capture overview
                </h2>

                <p className="mt-0.5 text-sm text-gray-500">
                  Evidence collected for this sneaker pair.
                </p>
              </div>
            </div>
          </div>

          <div className="grid gap-6 p-6 sm:grid-cols-3">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-gray-400">
                Capture sessions
              </p>

              <p className="mt-1.5 text-lg font-semibold text-gray-900">
                {totalCaptureSessions}
              </p>
            </div>

            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-gray-400">
                Ready sessions
              </p>

              <p className="mt-1.5 text-lg font-semibold text-gray-900">
                {readyCaptureSessions}
              </p>
            </div>

            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-gray-400">
                Uploaded images
              </p>

              <p className="mt-1.5 text-lg font-semibold text-gray-900">
                {uploadedImages.length}
              </p>
            </div>
          </div>
        </section>

        {/* Sneaker information */}
        <section className="mt-6 overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
          <div className="border-b border-gray-100 px-6 py-5">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gray-50">
                <span className="material-symbols-outlined text-[20px] text-gray-600">
                  footprint
                </span>
              </div>

              <div>
                <h2 className="text-base font-semibold text-gray-900">
                  Sneaker information
                </h2>

                <p className="mt-0.5 text-sm text-gray-500">
                  Identification and capture details for this pair.
                </p>
              </div>
            </div>
          </div>

          <div className="grid gap-x-8 gap-y-7 p-6 sm:grid-cols-2 lg:grid-cols-3">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-gray-400">
                Pair ID
              </p>

              <p className="mt-1.5 break-all text-sm font-medium text-gray-900">
                {displayPairId}
              </p>
            </div>

            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-gray-400">
                Pair number
              </p>

              <p className="mt-1.5 text-sm font-medium text-gray-900">
                {sneaker.pair_number ?? "—"}
              </p>
            </div>

            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-gray-400">
                Database ID
              </p>

              <p className="mt-1.5 break-all text-sm text-gray-600">
                {sneaker.id}
              </p>
            </div>

            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-gray-400">
                Batch ID
              </p>

              <Link
                to={`/batches/${sneaker.batch}`}
                className="mt-1.5 inline-flex max-w-full items-center gap-1.5 break-all text-sm font-medium text-gray-900 transition hover:text-gray-600"
              >
                <span className="truncate">
                  {sneaker.batch}
                </span>

                <span className="material-symbols-outlined shrink-0 text-[16px]">
                  open_in_new
                </span>
              </Link>
            </div>

            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-gray-400">
                Brand
              </p>

              <p className="mt-1.5 text-sm font-medium text-gray-900">
                {sneaker.brand || "Not identified"}
              </p>
            </div>

            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-gray-400">
                Model
              </p>

              <p className="mt-1.5 text-sm font-medium text-gray-900">
                {sneaker.model || "Not identified"}
              </p>
            </div>

            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-gray-400">
                SKU
              </p>

              <p className="mt-1.5 break-all text-sm font-medium text-gray-900">
                {sneaker.sku || "Not identified"}
              </p>
            </div>

            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-gray-400">
                Size
              </p>

              <p className="mt-1.5 text-sm font-medium text-gray-900">
                {sneaker.size || "Not recorded"}
              </p>
            </div>

            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-gray-400">
                Condition
              </p>

              <p className="mt-1.5 text-sm font-medium text-gray-900">
                {sneaker.condition
                  ? sneaker.condition.toUpperCase()
                  : "Not assessed"}
              </p>
            </div>

            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-gray-400">
                Status
              </p>

              <div className="mt-1.5">
                <span
                  className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset ${statusClasses(
                    sneaker.status,
                  )}`}
                >
                  {formatStatus(sneaker.status)}
                </span>
              </div>
            </div>
          </div>
        </section>

        {/* Record activity */}
        <section className="mt-6 overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
          <div className="border-b border-gray-100 px-6 py-5">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gray-50">
                <span className="material-symbols-outlined text-[20px] text-gray-600">
                  schedule
                </span>
              </div>

              <div>
                <h2 className="text-base font-semibold text-gray-900">
                  Record activity
                </h2>

                <p className="mt-0.5 text-sm text-gray-500">
                  When this sneaker record was created and last updated.
                </p>
              </div>
            </div>
          </div>

          <div className="grid gap-6 p-6 sm:grid-cols-2">
            <div className="flex items-start gap-3">
              <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gray-50">
                <span className="material-symbols-outlined text-[19px] text-gray-500">
                  add_circle
                </span>
              </div>

              <div className="min-w-0">
                <p className="text-xs font-medium uppercase tracking-wide text-gray-400">
                  Created
                </p>

                <p className="mt-1 text-sm font-medium text-gray-900">
                  {formatDateTime(sneaker.created_at)}
                </p>

                <p className="mt-1 text-xs text-gray-500">
                  {formatDate(sneaker.created_at)}
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gray-50">
                <span className="material-symbols-outlined text-[19px] text-gray-500">
                  update
                </span>
              </div>

              <div className="min-w-0">
                <p className="text-xs font-medium uppercase tracking-wide text-gray-400">
                  Last updated
                </p>

                <p className="mt-1 text-sm font-medium text-gray-900">
                  {formatDateTime(sneaker.updated_at)}
                </p>

                <p className="mt-1 text-xs text-gray-500">
                  {formatDate(sneaker.updated_at)}
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Batch relationship */}
        <section className="mt-6 rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gray-50">
                <span className="material-symbols-outlined text-[20px] text-gray-600">
                  inventory_2
                </span>
              </div>

              <div>
                <h2 className="text-base font-semibold text-gray-900">
                  Batch
                </h2>

                <p className="mt-1 text-sm text-gray-500">
                  This sneaker pair belongs to batch{" "}
                  <span className="font-medium text-gray-700">
                    {sneaker.batch}
                  </span>
                  .
                </p>
              </div>
            </div>

            <Link
              to={`/batches/${sneaker.batch}`}
              className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 transition hover:bg-gray-50"
            >
              View batch
              <span className="material-symbols-outlined text-[17px]">
                arrow_forward
              </span>
            </Link>
          </div>
        </section>
      </main>
    </div>
  );
}