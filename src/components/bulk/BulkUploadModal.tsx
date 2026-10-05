import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
  type KeyboardEvent,
} from "react";

import { getUploadConfig, type UploadConfig } from "../../lib/api";
import {
  REQUIRED_ANGLES,
  classifyFiles,
  collectDroppedFiles,
  isIgnoredFile,
  type Angle,
  type DroppedInput,
} from "../../lib/bulk-parser";
import {
  EMPTY_REVIEW,
  METADATA_MAX_LENGTH,
  addEmptyPair,
  assignFile,
  buildReviewState,
  buildRunInput,
  discardUnassigned,
  pairIssues,
  removePair,
  setPairFile,
  startBlocker,
  unassignPairFile,
  updatePairMetadata,
  type MetadataField,
  type ReviewPair,
  type ReviewState,
  type UnassignedFile,
} from "../../lib/bulk-review";
import { runBulkUpload } from "../../lib/bulk-upload-driver";
import { useBulkUpload, type JobPhase } from "../../lib/bulk-upload-store";
import { CONDITION_OPTIONS } from "../../lib/conditions";
import {
  IMAGE_ACCEPT,
  contentTypeForName,
  formatFileSize,
} from "../../lib/image-types";

interface BulkUploadModalProps {
  open: boolean;
  batchId: string;
  onClose: () => void;
}

type Step = "intake" | "review";

const ACTIVE_PHASES: ReadonlySet<JobPhase> = new Set([
  "preparing",
  "uploading",
  "completing",
]);

const UNSUPPORTED_TYPE_ERROR =
  "Unsupported file type. Use JPEG, PNG, WebP or HEIC.";

const METADATA_FIELDS: Array<{ field: MetadataField; label: string }> = [
  { field: "brand", label: "Brand" },
  { field: "model", label: "Model" },
  { field: "sku", label: "SKU" },
  { field: "size", label: "Size" },
];

function MaterialIcon({
  name,
  className = "",
}: {
  name: string;
  className?: string;
}) {
  return (
    <span
      className={`material-symbols-outlined ${className}`}
      aria-hidden="true"
    >
      {name}
    </span>
  );
}

/* Stable per-File key so tile state (e.g. a broken preview) resets
   when the file in a slot changes. */
const fileKeys = new WeakMap<File, number>();
let nextFileKey = 0;
function fileKey(file: File): number {
  let key = fileKeys.get(file);
  if (key === undefined) {
    key = nextFileKey++;
    fileKeys.set(file, key);
  }
  return key;
}

/* ============================================================
   THUMBNAILS
   ============================================================ */

/*
 * Object URL created and revoked by the effect itself and handed to the
 * <img> through a ref, so StrictMode's double mount never leaves the
 * image pointing at a revoked URL.
 */
function Thumbnail({
  file,
  onError,
  className,
}: {
  file: File;
  onError: () => void;
  className: string;
}) {
  const imgRef = useRef<HTMLImageElement>(null);

  useEffect(() => {
    const url = URL.createObjectURL(file);
    if (imgRef.current) imgRef.current.src = url;
    return () => URL.revokeObjectURL(url);
  }, [file]);

  return <img ref={imgRef} alt="" onError={onError} className={className} />;
}

/* Browsers other than Safari can't render HEIC; show the file instead. */
function FilePreview({ file, compact = false }: { file: File; compact?: boolean }) {
  const [broken, setBroken] = useState(false);

  if (broken) {
    return (
      <div
        className={`flex h-full w-full flex-col items-center justify-center gap-0.5 bg-gray-100 px-1 text-center ${
          compact ? "" : "p-1.5"
        }`}
        title={file.name}
      >
        <MaterialIcon
          name="image"
          className={compact ? "text-[18px] text-gray-400" : "text-[22px] text-gray-400"}
        />
        {!compact && (
          <>
            <span className="w-full truncate text-[10px] text-gray-600">
              {file.name}
            </span>
            <span className="text-[10px] text-gray-400">
              {formatFileSize(file.size)}
            </span>
          </>
        )}
      </div>
    );
  }

  return (
    <Thumbnail
      file={file}
      onError={() => setBroken(true)}
      className="h-full w-full object-cover"
    />
  );
}

/* ============================================================
   INTAKE
   ============================================================ */

function IntakeStep({
  parseError,
  skipped,
  canReturn,
  onInputs,
  onDropError,
  onReturn,
}: {
  parseError: string | null;
  skipped: number;
  canReturn: boolean;
  onInputs: (inputs: DroppedInput[]) => void;
  onDropError: () => void;
  onReturn: () => void;
}) {
  const filesRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragging(false);
    // Must be called before anything awaits: the browser empties
    // dataTransfer.items once this handler yields.
    collectDroppedFiles(event.dataTransfer).then(onInputs, onDropError);
  }

  function handlePick(
    event: ChangeEvent<HTMLInputElement>,
    folder: boolean,
  ) {
    const inputs = Array.from(event.target.files ?? []).map((file) => ({
      file,
      relativePath: folder ? file.webkitRelativePath || file.name : file.name,
    }));
    event.target.value = "";
    if (inputs.length > 0) onInputs(inputs);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      filesRef.current?.click();
    }
  }

  return (
    <div className="space-y-4 p-6">
      <div
        role="button"
        tabIndex={0}
        aria-label="Drop a folder or files here, or press Enter to choose files"
        onKeyDown={handleKeyDown}
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        className={`flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed px-6 py-12 text-center outline-none transition focus-visible:ring-2 focus-visible:ring-gray-300 ${
          dragging ? "border-gray-900 bg-gray-50" : "border-gray-300"
        }`}
      >
        <MaterialIcon name="drive_folder_upload" className="text-[40px] text-gray-400" />
        <p className="text-sm font-semibold text-gray-900">
          Drag a folder or files here
        </p>
        <p className="text-xs text-gray-500">
          One subfolder per pair, or files named like{" "}
          <code className="text-gray-700">pair-2-top.jpg</code>. JPEG, PNG,
          WebP or HEIC.
        </p>

        <div className="mt-2 flex gap-2">
          <label className="cursor-pointer rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50">
            Choose folder
            <input
              type="file"
              multiple
              className="sr-only"
              ref={(el) => el?.setAttribute("webkitdirectory", "")}
              onChange={(event) => handlePick(event, true)}
            />
          </label>
          <label className="cursor-pointer rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50">
            Choose files
            <input
              ref={filesRef}
              type="file"
              multiple
              accept={IMAGE_ACCEPT}
              className="sr-only"
              onChange={(event) => handlePick(event, false)}
            />
          </label>
        </div>
      </div>

      {parseError && (
        <p role="alert" className="text-sm text-red-700">
          {parseError}
        </p>
      )}
      {skipped > 0 && (
        <p className="text-xs text-gray-500">
          {skipped} {skipped === 1 ? "file" : "files"} skipped (unsupported
          type)
        </p>
      )}
      {canReturn && (
        <button
          type="button"
          onClick={onReturn}
          className="text-sm font-medium text-gray-700 underline-offset-2 hover:underline"
        >
          Back to review
        </button>
      )}
    </div>
  );
}

/* ============================================================
   REVIEW
   ============================================================ */

function AngleTile({
  angle,
  file,
  error,
  onPick,
  onRemove,
}: {
  angle: Angle;
  file: File | undefined;
  error: string | undefined;
  onPick: () => void;
  onRemove: () => void;
}) {
  return (
    <div className="min-w-0">
      {file ? (
        <div className="overflow-hidden rounded-lg border border-gray-200">
          <div className="aspect-square bg-gray-100">
            <FilePreview file={file} />
          </div>
          <div className="flex items-center justify-between gap-1 border-t border-gray-200 px-1.5 py-1">
            <span className="truncate text-[11px] font-medium text-gray-700">
              {angle}
            </span>
            <span className="flex shrink-0 gap-0.5">
              <button
                type="button"
                onClick={onPick}
                aria-label={`Replace ${angle}`}
                className="rounded p-0.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
              >
                <MaterialIcon name="swap_horiz" className="text-[16px]" />
              </button>
              <button
                type="button"
                onClick={onRemove}
                aria-label={`Remove ${angle}`}
                className="rounded p-0.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
              >
                <MaterialIcon name="close" className="text-[16px]" />
              </button>
            </span>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={onPick}
          aria-label={`Add ${angle}`}
          className="flex aspect-square w-full flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed border-gray-300 text-gray-400 transition hover:border-gray-400 hover:text-gray-600"
        >
          <MaterialIcon name="add_photo_alternate" className="text-[20px]" />
          <span className="text-[11px] font-medium">{angle}</span>
        </button>
      )}
      {error && (
        <p role="alert" className="mt-1 text-[10px] leading-3 text-red-700">
          {error}
        </p>
      )}
    </div>
  );
}

function PairCard({
  pair,
  number,
  issues,
  tileErrors,
  onPickTile,
  onRemoveTile,
  onRemovePair,
  onMetadata,
}: {
  pair: ReviewPair;
  number: number;
  issues: string[];
  tileErrors: Record<string, string>;
  onPickTile: (angle: Angle) => void;
  onRemoveTile: (angle: Angle) => void;
  onRemovePair: () => void;
  onMetadata: (field: MetadataField | "condition", value: string) => void;
}) {
  return (
    <li
      aria-label={`Pair ${number}`}
      className={`rounded-xl border p-4 ${
        issues.length > 0 ? "border-red-200 bg-red-50/40" : "border-gray-200"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-sm font-semibold text-gray-900">
            Pair {number}
            {issues.length > 0 && (
              <span className="rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-semibold text-red-700">
                {issues.length} {issues.length === 1 ? "issue" : "issues"}
              </span>
            )}
          </p>
          {pair.displayKey && (
            <p className="truncate text-xs text-gray-400">{pair.displayKey}</p>
          )}
        </div>
        <button
          type="button"
          onClick={onRemovePair}
          className="shrink-0 rounded-md px-2 py-1 text-xs font-medium text-gray-500 transition hover:bg-gray-100 hover:text-gray-800"
        >
          Remove pair
        </button>
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-6">
        {REQUIRED_ANGLES.map((angle) => {
          const file = pair.files[angle];
          return (
            <AngleTile
              key={file ? `${angle}:${fileKey(file)}` : angle}
              angle={angle}
              file={file}
              error={tileErrors[`${pair.rowId}:${angle}`]}
              onPick={() => onPickTile(angle)}
              onRemove={() => onRemoveTile(angle)}
            />
          );
        })}
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-5">
        {METADATA_FIELDS.map(({ field, label }) => (
          <label key={field} className="min-w-0">
            <span className="mb-1 block text-[11px] font-medium text-gray-500">
              {label}
            </span>
            <input
              type="text"
              value={pair[field]}
              maxLength={METADATA_MAX_LENGTH[field]}
              onChange={(event) => onMetadata(field, event.target.value)}
              className="h-9 w-full rounded-lg border border-gray-300 bg-white px-2.5 text-sm outline-none focus:border-gray-500 focus:ring-2 focus:ring-gray-200"
            />
          </label>
        ))}
        <label className="min-w-0">
          <span className="mb-1 block text-[11px] font-medium text-gray-500">
            Condition
          </span>
          <select
            value={pair.condition}
            onChange={(event) => onMetadata("condition", event.target.value)}
            className="h-9 w-full rounded-lg border border-gray-300 bg-white px-2 text-sm outline-none focus:border-gray-500 focus:ring-2 focus:ring-gray-200"
          >
            {CONDITION_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      {issues.length > 0 && (
        <ul className="mt-3 space-y-0.5 text-xs text-red-700">
          {issues.map((issue) => (
            <li key={issue}>{issue}</li>
          ))}
        </ul>
      )}
    </li>
  );
}

function UnassignedRow({
  entry,
  pairs,
  onAssign,
  onDiscard,
}: {
  entry: UnassignedFile;
  pairs: ReviewPair[];
  onAssign: (rowId: string, angle: Angle) => void;
  onDiscard: () => void;
}) {
  const [rowId, setRowId] = useState("");
  const [angle, setAngle] = useState<Angle | "">(entry.angle ?? "");

  // A removed pair silently invalidates the selection.
  const target = pairs.some((p) => p.rowId === rowId) ? rowId : "";

  return (
    <li className="flex flex-wrap items-center gap-3 py-2.5">
      <div className="h-10 w-10 shrink-0 overflow-hidden rounded-md border border-gray-200">
        <FilePreview file={entry.file} compact />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-medium text-gray-800">
          {entry.relativePath}
        </p>
        <p className="text-[11px] text-gray-500">
          {entry.angle ? `Detected: ${entry.angle}` : "No angle detected"}
          {entry.reason && ` · ${entry.reason}`}
        </p>
      </div>

      <select
        aria-label={`Pair for ${entry.relativePath}`}
        value={target}
        onChange={(event) => setRowId(event.target.value)}
        className="h-8 rounded-lg border border-gray-300 bg-white px-2 text-xs"
      >
        <option value="">Pair…</option>
        {pairs.map((pair, index) => (
          <option key={pair.rowId} value={pair.rowId}>
            Pair {index + 1}
            {pair.displayKey ? ` — ${pair.displayKey}` : ""}
          </option>
        ))}
      </select>

      <select
        aria-label={`Angle for ${entry.relativePath}`}
        value={angle}
        onChange={(event) => setAngle(event.target.value as Angle | "")}
        className="h-8 rounded-lg border border-gray-300 bg-white px-2 text-xs"
      >
        <option value="">—</option>
        {REQUIRED_ANGLES.map((a) => (
          <option key={a} value={a}>
            {a}
          </option>
        ))}
      </select>

      <button
        type="button"
        disabled={!target || !angle}
        onClick={() => angle && onAssign(target, angle)}
        className="h-8 rounded-lg bg-gray-900 px-3 text-xs font-medium text-white transition hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-40"
      >
        Assign
      </button>
      <button
        type="button"
        onClick={onDiscard}
        className="h-8 rounded-lg px-2 text-xs font-medium text-gray-500 transition hover:bg-gray-100 hover:text-gray-800"
      >
        Discard
      </button>
    </li>
  );
}

/* ============================================================
   MODAL
   ============================================================ */

function BulkUploadModalInner({ batchId, onClose }: BulkUploadModalProps) {
  const phase = useBulkUpload((s) => s.phase);

  const [step, setStep] = useState<Step>("intake");
  const [config, setConfig] = useState<UploadConfig | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [skipped, setSkipped] = useState(0);
  const [review, setReview] = useState<ReviewState>(EMPTY_REVIEW);
  const [tileErrors, setTileErrors] = useState<Record<string, string>>({});
  const [starting, setStarting] = useState(false);

  const idCounter = useRef(0);
  const newId = () => `row-${++idCounter.current}`;

  const tileInputRef = useRef<HTMLInputElement>(null);
  const tileTarget = useRef<{ rowId: string; angle: Angle } | null>(null);

  /* Without config the size check is skipped; the server still enforces it. */
  useEffect(() => {
    let active = true;
    getUploadConfig().then(
      (loaded) => {
        if (active) setConfig(loaded);
      },
      () => console.debug("[bulk] upload config unavailable; size checks off"),
    );
    return () => {
      active = false;
    };
  }, []);

  const maxFileSize = config?.max_capture_image_size ?? null;
  const jobActive = ACTIVE_PHASES.has(phase);
  const blocker = startBlocker(review, maxFileSize);
  const hasReview = review.pairs.length > 0 || review.unassigned.length > 0;

  /* ---------------- intake ---------------- */

  function handleInputs(inputs: DroppedInput[]) {
    const usable = inputs.filter((i) => !isIgnoredFile(i.relativePath));
    const supported = usable.filter(
      (i) => contentTypeForName(i.file.name) !== null,
    );

    if (
      review.pairs.length > 0 &&
      !window.confirm("Replace the pairs you are reviewing with these files?")
    ) {
      return;
    }

    const next = buildReviewState(classifyFiles(supported), newId);
    setSkipped(usable.length - supported.length);
    setTileErrors({});

    if (next.pairs.length === 0 && next.unassigned.length === 0) {
      setReview(EMPTY_REVIEW);
      setParseError(
        "No usable images found. Drop a folder or choose files to start.",
      );
      return;
    }

    setParseError(null);
    setReview(next);
    setStep("review");
  }

  /* ---------------- review edits ---------------- */

  function openTilePicker(rowId: string, angle: Angle) {
    tileTarget.current = { rowId, angle };
    tileInputRef.current?.click();
  }

  function handleTilePicked(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    const target = tileTarget.current;
    event.target.value = "";
    tileTarget.current = null;
    if (!file || !target) return;

    const key = `${target.rowId}:${target.angle}`;
    if (contentTypeForName(file.name) === null) {
      setTileErrors((errors) => ({ ...errors, [key]: UNSUPPORTED_TYPE_ERROR }));
      return;
    }

    setTileErrors((errors) => {
      const rest = { ...errors };
      delete rest[key];
      return rest;
    });
    setReview((state) => setPairFile(state, target.rowId, target.angle, file));
  }

  /* ---------------- footer ---------------- */

  function handleCancel() {
    if (
      step === "review" &&
      review.pairs.length > 0 &&
      !window.confirm("Discard these pairs and close?")
    ) {
      return;
    }
    onClose();
  }

  function handleStart() {
    if (blocker || jobActive || starting) return;
    setStarting(true);

    // The panel reports the job from here on, including a failed start.
    runBulkUpload(buildRunInput(review, batchId)).catch((error) =>
      console.debug("[bulk] job did not start", error),
    );
    onClose();
  }

  const startDisabledReason = jobActive
    ? "Another bulk upload is still running."
    : blocker;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="bulk-upload-title"
      onKeyDown={(event) => {
        if (event.key === "Escape") handleCancel();
      }}
    >
      <div className="flex max-h-[90vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex shrink-0 items-center justify-between border-b border-gray-200 px-6 py-5">
          <div>
            <h2
              id="bulk-upload-title"
              className="text-lg font-semibold text-gray-900"
            >
              Bulk upload
            </h2>
            <p className="mt-1 text-sm text-gray-500">
              {step === "intake"
                ? "Add a folder or files for several pairs at once."
                : `Review ${review.pairs.length} ${
                    review.pairs.length === 1 ? "pair" : "pairs"
                  } before uploading.`}
            </p>
          </div>
          <button
            type="button"
            onClick={handleCancel}
            className="text-gray-400 hover:text-gray-700"
            aria-label="Close"
          >
            <MaterialIcon name="close" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {step === "intake" ? (
            <IntakeStep
              parseError={parseError}
              skipped={skipped}
              canReturn={hasReview}
              onInputs={handleInputs}
              onDropError={() =>
                setParseError("Could not read the dropped files.")
              }
              onReturn={() => setStep("review")}
            />
          ) : (
            <div className="space-y-6 p-6">
              {skipped > 0 && (
                <p className="text-xs text-gray-500">
                  {skipped} {skipped === 1 ? "file" : "files"} skipped
                  (unsupported type)
                </p>
              )}

              <ul className="space-y-3">
                {review.pairs.map((pair, index) => (
                  <PairCard
                    key={pair.rowId}
                    pair={pair}
                    number={index + 1}
                    issues={pairIssues(pair, maxFileSize)}
                    tileErrors={tileErrors}
                    onPickTile={(angle) => openTilePicker(pair.rowId, angle)}
                    onRemoveTile={(angle) =>
                      setReview((state) =>
                        unassignPairFile(state, pair.rowId, angle, newId),
                      )
                    }
                    onRemovePair={() =>
                      setReview((state) => removePair(state, pair.rowId, newId))
                    }
                    onMetadata={(field, value) =>
                      setReview((state) =>
                        updatePairMetadata(state, pair.rowId, field, value),
                      )
                    }
                  />
                ))}
              </ul>

              <button
                type="button"
                onClick={() =>
                  setReview((state) => addEmptyPair(state, newId()))
                }
                className="flex w-full items-center justify-center gap-1.5 rounded-xl border-2 border-dashed border-gray-300 py-3 text-sm font-medium text-gray-600 transition hover:border-gray-400 hover:text-gray-900"
              >
                <MaterialIcon name="add" className="text-[18px]" />
                Add pair
              </button>

              {review.unassigned.length > 0 && (
                <section aria-labelledby="bulk-unassigned-title">
                  <h3
                    id="bulk-unassigned-title"
                    className="text-sm font-semibold text-gray-900"
                  >
                    Unassigned ({review.unassigned.length})
                  </h3>
                  {review.pairs.length === 0 && (
                    <p className="mt-1 text-xs text-gray-500">
                      Add a pair, then assign these files to it.
                    </p>
                  )}
                  <ul className="mt-1 divide-y divide-gray-100">
                    {review.unassigned.map((entry) => (
                      <UnassignedRow
                        key={entry.id}
                        entry={entry}
                        pairs={review.pairs}
                        onAssign={(rowId, angle) =>
                          setReview((state) =>
                            assignFile(state, entry.id, rowId, angle, newId),
                          )
                        }
                        onDiscard={() =>
                          setReview((state) =>
                            discardUnassigned(state, entry.id),
                          )
                        }
                      />
                    ))}
                  </ul>
                </section>
              )}

              <input
                ref={tileInputRef}
                type="file"
                accept={IMAGE_ACCEPT}
                className="sr-only"
                tabIndex={-1}
                aria-hidden="true"
                onChange={handleTilePicked}
              />
            </div>
          )}
        </div>

        <div className="flex shrink-0 items-center justify-between gap-3 border-t border-gray-200 px-6 py-4">
          <div className="min-w-0">
            {step === "review" && (
              <button
                type="button"
                onClick={() => setStep("intake")}
                className="text-sm font-medium text-gray-600 hover:text-gray-900"
              >
                Back
              </button>
            )}
          </div>

          <div className="flex items-center gap-3">
            {step === "review" && startDisabledReason && (
              <p className="text-xs text-gray-500">{startDisabledReason}</p>
            )}
            <button
              type="button"
              onClick={handleCancel}
              className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50"
            >
              Cancel
            </button>
            {step === "review" && (
              <button
                type="button"
                onClick={handleStart}
                disabled={Boolean(startDisabledReason) || starting}
                className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Start upload
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/* Contents mount only while open, so every open starts from fresh state. */
export default function BulkUploadModal(props: BulkUploadModalProps) {
  if (!props.open) return null;
  return <BulkUploadModalInner {...props} />;
}
