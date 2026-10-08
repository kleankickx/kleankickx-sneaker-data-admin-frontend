import { useEffect, useRef, useState, type ChangeEvent } from "react";

import {
  completeImageReplacement,
  getUploadConfig,
  startImageReplacement,
  type UploadConfig,
} from "../../lib/api";
import {
  ANGLE_LABELS,
  LEGACY_SIDE_ANGLES,
  REPLACEABLE_ANGLES,
  type ReplaceableAngle as Angle,
} from "../../lib/angles";
import { imageRulesFromConfig } from "../../lib/bulk-review";
import { uploadToSlot } from "../../lib/direct-upload";
import {
  acceptFor,
  contentTypeForName,
  formatFileSize,
} from "../../lib/image-types";
import type { CaptureImage, SneakerPair } from "../../lib/types";
import FilePreview from "../FilePreview";

type AngleStatus =
  | { state: "uploading"; progress: number }
  | { state: "confirming" }
  | { state: "done" }
  | { state: "failed"; error: string };

function errorMessage(error: unknown, fallback: string): string {
  const e = error as {
    response?: { data?: { error?: { message?: string } } };
    message?: string;
  };
  return e?.response?.data?.error?.message || e?.message || fallback;
}

function isVerified(pair: SneakerPair): boolean {
  return pair.status.toLowerCase() === "verified";
}

/* The photo currently shown for each angle (newest uploaded one). */
function currentImages(pair: SneakerPair): Partial<Record<Angle, CaptureImage>> {
  const byAngle: Partial<Record<Angle, CaptureImage>> = {};
  const images = (pair.capture_sessions ?? [])
    .flatMap((session) => session.images ?? [])
    .filter((image) => image.status.toLowerCase() === "uploaded" && image.image_url)
    .sort((a, b) => a.created_at.localeCompare(b.created_at));

  for (const image of images) {
    // Older captures stored the lateral/medial sides as left/right.
    byAngle[(LEGACY_SIDE_ANGLES[image.angle] ?? image.angle) as Angle] = image;
  }
  return byAngle;
}

function StatusLine({ status }: { status: AngleStatus | undefined }) {
  if (!status) return null;

  switch (status.state) {
    case "uploading":
      return (
        <div
          role="progressbar"
          aria-valuenow={status.progress}
          aria-valuemin={0}
          aria-valuemax={100}
          className="h-1 w-full overflow-hidden rounded-full bg-gray-200"
        >
          <div
            className="h-full bg-gray-900 transition-[width]"
            style={{ width: `${status.progress}%` }}
          />
        </div>
      );
    case "confirming":
      return <p className="text-[11px] text-gray-500">Confirming…</p>;
    case "done":
      return <p className="text-[11px] font-medium text-green-700">Replaced</p>;
    case "failed":
      return (
        <p role="alert" className="text-[11px] leading-3 text-red-700">
          {status.error}
        </p>
      );
  }
}

function ReplaceImagesContent({
  pair,
  onClose,
  onReplaced,
}: {
  pair: SneakerPair;
  onClose: () => void;
  onReplaced: (count: number, finished: boolean) => void;
}) {
  const [config, setConfig] = useState<UploadConfig | null>(null);
  const [picks, setPicks] = useState<Partial<Record<Angle, File>>>({});
  const [pickErrors, setPickErrors] = useState<Partial<Record<Angle, string>>>({});
  const [statuses, setStatuses] = useState<Partial<Record<Angle, AngleStatus>>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);
  const pickTarget = useRef<Angle | null>(null);

  useEffect(() => {
    let active = true;
    getUploadConfig().then(
      (loaded) => {
        if (active) setConfig(loaded);
      },
      () => {
        // Size checks are skipped; the server still enforces the limit.
      },
    );
    return () => {
      active = false;
    };
  }, []);

  const rules = imageRulesFromConfig(config);
  const current = currentImages(pair);
  const picked = REPLACEABLE_ANGLES.filter((angle) => picks[angle]);
  const hasFailures = Object.values(statuses).some((s) => s?.state === "failed");

  function setStatus(angle: Angle, status: AngleStatus) {
    setStatuses((all) => ({ ...all, [angle]: status }));
  }

  function choose(angle: Angle) {
    pickTarget.current = angle;
    inputRef.current?.click();
  }

  function handlePicked(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    const angle = pickTarget.current;
    event.target.value = "";
    pickTarget.current = null;
    if (!file || !angle) return;

    let problem: string | null = null;
    if (contentTypeForName(file.name, rules.contentTypes) === null) {
      problem = "Unsupported file type. Use JPEG, PNG, WebP or HEIC.";
    } else if (rules.maxFileSize !== null && file.size > rules.maxFileSize) {
      problem = `${formatFileSize(file.size)} is over the ${formatFileSize(
        rules.maxFileSize,
      )} limit.`;
    }

    setPickErrors((all) => ({ ...all, [angle]: problem ?? undefined }));
    if (problem) return;

    setPicks((all) => ({ ...all, [angle]: file }));
    setStatuses((all) => ({ ...all, [angle]: undefined }));
  }

  function undo(angle: Angle) {
    setPicks((all) => {
      const rest = { ...all };
      delete rest[angle];
      return rest;
    });
    setStatuses((all) => ({ ...all, [angle]: undefined }));
  }

  async function handleReplace() {
    if (busy || picked.length === 0) return;
    const angles = picked;

    setBusy(true);
    setError(null);
    for (const angle of angles) setStatus(angle, { state: "uploading", progress: 0 });

    let slots;
    try {
      slots = await startImageReplacement(
        pair.id,
        angles.map((angle) => {
          const file = picks[angle]!;
          return {
            angle,
            file_size: file.size,
            content_type: contentTypeForName(file.name, rules.contentTypes)!,
            original_filename: file.name,
          };
        }),
      );
    } catch (err) {
      setError(errorMessage(err, "Could not start the replacement."));
      setStatuses({});
      setBusy(false);
      return;
    }

    const angleOf = new Map<string, Angle>();
    const uploadedIds: string[] = [];
    let failures = 0;

    await Promise.all(
      slots.map(async (slot) => {
        const angle = slot.angle as Angle;
        try {
          await uploadToSlot(slot.upload, picks[angle]!, {
            onProgress: (progress) =>
              setStatus(angle, { state: "uploading", progress }),
          });
          setStatus(angle, { state: "confirming" });
          angleOf.set(slot.image_id, angle);
          uploadedIds.push(slot.image_id);
        } catch (err) {
          failures += 1;
          setStatus(angle, {
            state: "failed",
            error: errorMessage(err, "Upload failed."),
          });
        }
      }),
    );

    let replaced = 0;
    if (uploadedIds.length > 0) {
      try {
        const result = await completeImageReplacement(pair.id, uploadedIds);
        for (const { image_id } of result.replaced) {
          const angle = angleOf.get(image_id)!;
          replaced += 1;
          setStatus(angle, { state: "done" });
          setPicks((all) => {
            const rest = { ...all };
            delete rest[angle];
            return rest;
          });
        }
        for (const { image_id, error: reason } of result.failed) {
          failures += 1;
          setStatus(angleOf.get(image_id)!, { state: "failed", error: reason });
        }
      } catch (err) {
        const reason = `Could not confirm: ${errorMessage(err, "request failed")}`;
        for (const id of uploadedIds) {
          failures += 1;
          setStatus(angleOf.get(id)!, { state: "failed", error: reason });
        }
      }
    }

    setBusy(false);
    if (replaced > 0 || failures === 0) onReplaced(replaced, failures === 0);
  }

  const verified = isVerified(pair);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="replace-images-title"
      onKeyDown={(event) => {
        if (event.key === "Escape" && !busy) onClose();
      }}
    >
      <div className="flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex shrink-0 items-center justify-between border-b border-gray-200 px-6 py-5">
          <div className="min-w-0">
            <h2
              id="replace-images-title"
              className="text-lg font-semibold text-gray-900"
            >
              Replace photos
            </h2>
            <p className="mt-1 truncate text-sm text-gray-500">
              {pair.pair_id ?? pair.id}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="text-gray-400 hover:text-gray-700 disabled:opacity-40"
            aria-label="Close"
          >
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-6 py-5">
          {verified ? (
            <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
              This pair has been verified, so its photos can't be changed.
            </p>
          ) : (
            <>
              <p className="text-sm text-gray-600">
                Choose a new photo for each angle you want to change. The
                current photo stays until the new one has uploaded and been
                checked. Identification results are not re-run.
              </p>

              <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {REPLACEABLE_ANGLES.map((angle) => {
                  const file = picks[angle];
                  const image = current[angle];
                  const status = statuses[angle];

                  return (
                    <li
                      key={angle}
                      aria-label={angle}
                      className={`overflow-hidden rounded-xl border ${
                        file ? "border-gray-900" : "border-gray-200"
                      }`}
                    >
                      <div className="relative aspect-square bg-gray-100">
                        {file ? (
                          <FilePreview file={file} />
                        ) : image?.image_url ? (
                          <img
                            src={image.image_url}
                            alt={`Current ${angle} photo`}
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <div className="flex h-full items-center justify-center text-xs text-gray-400">
                            No photo yet
                          </div>
                        )}
                        {file && (
                          <span className="absolute left-1.5 top-1.5 rounded-full bg-gray-900 px-2 py-0.5 text-[10px] font-semibold text-white">
                            New
                          </span>
                        )}
                      </div>

                      <div className="space-y-1.5 p-2">
                        <div className="flex items-center justify-between gap-1">
                          <span className="text-xs font-medium text-gray-800">
                            {ANGLE_LABELS[angle]}
                          </span>
                          {file && !busy ? (
                            <button
                              type="button"
                              onClick={() => undo(angle)}
                              className="text-[11px] font-medium text-gray-500 hover:text-gray-800"
                            >
                              Undo
                            </button>
                          ) : (
                            !busy && (
                              <button
                                type="button"
                                onClick={() => choose(angle)}
                                className="text-[11px] font-medium text-gray-700 underline-offset-2 hover:underline"
                                aria-label={`Choose new ${angle} photo`}
                              >
                                {image ? "Replace" : "Add"}
                              </button>
                            )
                          )}
                        </div>
                        <StatusLine status={status} />
                        {pickErrors[angle] && (
                          <p role="alert" className="text-[11px] leading-3 text-red-700">
                            {pickErrors[angle]}
                          </p>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>

              <input
                ref={inputRef}
                type="file"
                accept={acceptFor(rules.contentTypes)}
                className="sr-only"
                tabIndex={-1}
                aria-hidden="true"
                onChange={handlePicked}
              />
            </>
          )}

          {error && (
            <p role="alert" className="text-sm text-red-700">
              {error}
            </p>
          )}
        </div>

        <div className="flex shrink-0 items-center justify-end gap-3 border-t border-gray-200 px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50 disabled:opacity-40"
          >
            {hasFailures ? "Close" : "Cancel"}
          </button>
          {!verified && (
            <button
              type="button"
              onClick={handleReplace}
              disabled={busy || picked.length === 0}
              className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {busy
                ? "Replacing…"
                : hasFailures
                  ? "Try again"
                  : picked.length > 0
                    ? `Replace ${picked.length} ${picked.length === 1 ? "photo" : "photos"}`
                    : "Replace photos"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/** Replace photos of a pair. Open by passing a pair; close with null. */
export default function ReplaceImagesModal({
  pair,
  onClose,
  onReplaced,
}: {
  pair: SneakerPair | null;
  onClose: () => void;
  /** `finished` is true when every chosen photo was replaced. */
  onReplaced: (count: number, finished: boolean) => void;
}) {
  if (!pair) return null;
  return (
    <ReplaceImagesContent
      key={pair.id}
      pair={pair}
      onClose={onClose}
      onReplaced={onReplaced}
    />
  );
}
