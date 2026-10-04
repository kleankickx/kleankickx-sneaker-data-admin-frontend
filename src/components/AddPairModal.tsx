import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  completeCaptureImage,
  createPairInBatch,
  type PairUploadSlot,
} from "../lib/api";

/* -------------------------------------------------------------------------- */
/* Constants                                                                  */
/* -------------------------------------------------------------------------- */

const REQUIRED_ANGLES = [
  "overview",
  "top",
  "left",
  "right",
  "sole",
  "label",
] as const;

type Angle = (typeof REQUIRED_ANGLES)[number];

const ANGLE_LABELS: Record<Angle, string> = {
  overview: "Overview",
  top: "Top",
  left: "Left side",
  right: "Right side",
  sole: "Sole",
  label: "Label / tag",
};

const ANGLE_HINTS: Record<Angle, string> = {
  overview: "Whole shoe, 3/4 angle",
  top: "Looking straight down",
  left: "Left profile",
  right: "Right profile",
  sole: "Outsole tread pattern",
  label: "Size tag or SKU label",
};

/* -------------------------------------------------------------------------- */
/* Types                                                                      */
/* -------------------------------------------------------------------------- */

type FileStatus =
  | "pending"
  | "uploading"
  | "completing"
  | "done"
  | "error";

type FileState = {
  file: File;
  previewUrl: string;
  status: FileStatus;
  progress: number;
  error?: string;
};

type Phase = "form" | "uploading" | "done";

/* -------------------------------------------------------------------------- */
/* Utils                                                                      */
/* -------------------------------------------------------------------------- */

function getErrorMessage(error: any) {
  return (
    error?.response?.data?.error?.message ||
    error?.response?.data?.message ||
    error?.message ||
    "Something went wrong."
  );
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function uploadWithProgress(
  url: string,
  formData: FormData,
  {
    onProgress,
    signal,
  }: {
    onProgress: (pct: number) => void;
    signal?: AbortSignal;
  } = { onProgress: () => {} },
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", url);
    xhr.responseType = "text";

    if (signal) {
      if (signal.aborted) {
        reject(new DOMException("Aborted", "AbortError"));
        return;
      }
      signal.addEventListener("abort", () => {
        xhr.abort();
      });
    }

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) {
        onProgress(
          Math.round((event.loaded / event.total) * 100),
        );
      }
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve();
      } else {
        reject(
          new Error(
            `Upload failed (${xhr.status}): ${xhr.responseText}`,
          ),
        );
      }
    };

    xhr.onabort = () =>
      reject(new DOMException("Aborted", "AbortError"));
    xhr.onerror = () => reject(new Error("Network error"));
    xhr.ontimeout = () => reject(new Error("Upload timed out"));

    xhr.send(formData);
  });
}

/* -------------------------------------------------------------------------- */
/* Modal                                                                      */
/* -------------------------------------------------------------------------- */

export default function AddPairModal({
  open,
  batchId,
  onClose,
  onCreated,
}: {
  open: boolean;
  batchId: string;
  onClose: () => void;
  onCreated: (pairId: string) => void;
}) {
  const [phase, setPhase] = useState<Phase>("form");

  const [brand, setBrand] = useState("");
  const [model, setModel] = useState("");
  const [sku, setSku] = useState("");
  const [size, setSize] = useState("");
  const [condition, setCondition] = useState("unknown");

  const [files, setFiles] = useState<
    Partial<Record<Angle, FileState>>
  >({});

  const [error, setError] = useState<string | null>(null);

  /* A ref holding every blob URL we've created, so we can revoke
     exactly the right ones on unmount and never on re-render. */
  const previewUrlsRef = useRef<Set<string>>(new Set());

  /* Abort controllers for in-flight uploads, so Cancel actually
     cancels. */
  const abortRef = useRef<AbortController | null>(null);

  /* Reset when the modal opens. */
  useEffect(() => {
    if (!open) return;

    setPhase("form");
    setBrand("");
    setModel("");
    setSku("");
    setSize("");
    setCondition("unknown");
    setFiles({});
    setError(null);

    /* Do NOT revoke preview URLs here — the effect below handles
       that on unmount. If a user reopens the modal, we want a clean
       slate, so we revoke everything that's still around. */
    return () => {
      previewUrlsRef.current.forEach((url) => {
        URL.revokeObjectURL(url);
      });
      previewUrlsRef.current.clear();
    };
  }, [open]);

  /* Track blob URLs so we can revoke them exactly once, on unmount
     or when the modal closes. This effect has NO dependencies, so
     it never runs the cleanup mid-session. */
  useEffect(() => {
    return () => {
      abortRef.current?.abort();
      previewUrlsRef.current.forEach((url) => {
        URL.revokeObjectURL(url);
      });
      previewUrlsRef.current.clear();
    };
  }, []);

  /* ---------------------------------------------------------------- */
  /* Derived state                                                    */
  /* ---------------------------------------------------------------- */

  const filledCount = useMemo(
    () => REQUIRED_ANGLES.filter((a) => Boolean(files[a])).length,
    [files],
  );

  const allFilled = filledCount === REQUIRED_ANGLES.length;

  const anyUploading = useMemo(
    () =>
      REQUIRED_ANGLES.some((a) => {
        const s = files[a];
        return (
          s?.status === "uploading" ||
          s?.status === "completing"
        );
      }),
    [files],
  );

  const doneCount = useMemo(
    () =>
      REQUIRED_ANGLES.filter((a) => files[a]?.status === "done")
        .length,
    [files],
  );

  /* ---------------------------------------------------------------- */
  /* File handlers                                                    */
  /* ---------------------------------------------------------------- */

  const handleFileChange = useCallback(
    (angle: Angle, file: File | null) => {
      setFiles((current) => {
        const previous = current[angle];

        /* Replacing or removing an existing file: revoke its URL
           immediately, since we're about to forget it. */
        if (previous?.previewUrl) {
          URL.revokeObjectURL(previous.previewUrl);
          previewUrlsRef.current.delete(previous.previewUrl);
        }

        if (!file) {
          const next = { ...current };
          delete next[angle];
          return next;
        }

        const previewUrl = URL.createObjectURL(file);
        previewUrlsRef.current.add(previewUrl);

        return {
          ...current,
          [angle]: {
            file,
            previewUrl,
            status: "pending",
            progress: 0,
          },
        };
      });
    },
    [],
  );

  /* ---------------------------------------------------------------- */
  /* State mutators for a single angle                                */
  /* ---------------------------------------------------------------- */

  const updateAngle = useCallback(
    (angle: Angle, patch: Partial<FileState>) => {
      setFiles((current) => {
        const existing = current[angle];
        if (!existing) return current;

        return {
          ...current,
          [angle]: { ...existing, ...patch },
        };
      });
    },
    [],
  );

  /* ---------------------------------------------------------------- */
  /* Submit                                                           */
  /* ---------------------------------------------------------------- */

  async function handleSubmit() {
    setError(null);

    if (!allFilled) {
      setError("Please provide an image for every angle.");
      return;
    }

    setPhase("uploading");

    const uploads = REQUIRED_ANGLES.map((angle) => {
      const state = files[angle]!;
      return {
        angle,
        file_size: state.file.size,
        content_type: state.file.type || "image/jpeg",
        original_filename: state.file.name,
      };
    });

    let created;
    try {
      created = await createPairInBatch(batchId, {
        brand: brand.trim() || undefined,
        model: model.trim() || undefined,
        sku: sku.trim() || undefined,
        size: size.trim() || undefined,
        condition,
        uploads,
      });
    } catch (err) {
      setError(getErrorMessage(err));
      setPhase("form");
      return;
    }

    const slotByAngle = new Map<string, PairUploadSlot>();
    created.upload_slots.forEach((s) => slotByAngle.set(s.angle, s));

    const controller = new AbortController();
    abortRef.current = controller;

    await Promise.all(
      REQUIRED_ANGLES.map(async (angle) => {
        const state = files[angle]!;
        const slot = slotByAngle.get(angle);

        if (!slot) {
          updateAngle(angle, {
            status: "error",
            error: "No upload slot received.",
          });
          return;
        }

        try {
          updateAngle(angle, { status: "uploading" });

          const formData = new FormData();
          formData.append("file", state.file);

          Object.entries(slot.upload.fields).forEach(([k, v]) =>
            formData.append(k, v),
          );

          await uploadWithProgress(
            slot.upload.upload_url,
            formData,
            {
              onProgress: (pct) =>
                updateAngle(angle, { progress: pct }),
              signal: controller.signal,
            },
          );

          updateAngle(angle, { status: "completing" });

          await completeCaptureImage(slot.image_id);

          updateAngle(angle, {
            status: "done",
            progress: 100,
          });
        } catch (err: any) {
          if (err?.name === "AbortError") return;

          updateAngle(angle, {
            status: "error",
            error: getErrorMessage(err),
          });
        }
      }),
    );

    abortRef.current = null;

    /* All or nothing: only close when every angle is done. */
    const allDone = REQUIRED_ANGLES.every(
      (a) => files[a]?.status === "done",
    );

    /* `files` here is stale — read fresh state via a functional
       setState instead. */
    setFiles((current) => {
      const finished = REQUIRED_ANGLES.every(
        (a) => current[a]?.status === "done",
      );

      const aborted = controller.signal.aborted;

      if (finished) {
        setPhase("done");
        onCreated(created.pair.id);
      } else if (!aborted) {
        setPhase("form");
        setError(
          "Some images failed to upload. Fix the failed tiles and try again.",
        );
      }

      return current;
    });
  }

  /* ---------------------------------------------------------------- */
  /* Cancel                                                           */
  /* ---------------------------------------------------------------- */

  function handleCancel() {
    abortRef.current?.abort();
    abortRef.current = null;
    onClose();
  }

  /* ---------------------------------------------------------------- */
  /* Retry a single failed angle                                      */
  /* ---------------------------------------------------------------- */

  async function retryAngle(angle: Angle) {
    /* Because `createPairInBatch` already succeeded before the
       upload failed, we can't just re-run the whole thing without
       creating a duplicate pair. For v1 we simply tell the user to
       use the "Clean up pairs without images" flow on the batch and
       re-add. A more complete implementation would call the
       `/capture-images/{id}/retry/` endpoint with the stored image
       id. */
    updateAngle(angle, {
      status: "error",
      error:
        "Re-add this pair from the batch to retry the upload.",
    });
  }

  if (!open) return null;

  /* ---------------------------------------------------------------- */
  /* Render                                                           */
  /* ---------------------------------------------------------------- */

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      role="dialog"
      aria-modal="true"
    >
      <div className="flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        {/* Header ------------------------------------------------------ */}
        <div className="flex shrink-0 items-center justify-between border-b border-gray-200 px-6 py-5">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">
              Add sneaker pair
            </h2>

            <p className="mt-1 text-sm text-gray-500">
              {phase === "form"
                ? "Fill in the details, then attach all six capture angles."
                : phase === "uploading"
                  ? "Uploading images…"
                  : "Pair created"}
            </p>
          </div>

          <button
            type="button"
            onClick={handleCancel}
            className="text-gray-400 hover:text-gray-700"
            aria-label="Close"
          >
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        {/* Body -------------------------------------------------------- */}
        <div className="flex-1 overflow-y-auto px-6 py-6">
          {phase === "form" && (
            <FormPhase
              brand={brand}
              setBrand={setBrand}
              model={model}
              setModel={setModel}
              sku={sku}
              setSku={setSku}
              size={size}
              setSize={setSize}
              condition={condition}
              setCondition={setCondition}
              files={files}
              filledCount={filledCount}
              error={error}
              onFileChange={handleFileChange}
            />
          )}

          {phase === "uploading" && (
            <UploadingPhase
              files={files}
              doneCount={doneCount}
              total={REQUIRED_ANGLES.length}
              onCancel={handleCancel}
            />
          )}

          {phase === "done" && <DonePhase />}
        </div>

        {/* Footer ------------------------------------------------------ */}
        <div className="flex shrink-0 justify-end gap-2 border-t border-gray-100 bg-gray-50/60 px-6 py-4">
          {phase === "form" && (
            <>
              <button
                type="button"
                onClick={handleCancel}
                className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50"
              >
                Cancel
              </button>

              <button
                type="button"
                disabled={!allFilled}
                onClick={handleSubmit}
                className="inline-flex items-center gap-2 rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <span className="material-symbols-outlined text-[18px]">
                  cloud_upload
                </span>
                Create pair and upload
              </button>
            </>
          )}

          {phase === "uploading" && (
            <button
              type="button"
              onClick={handleCancel}
              className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50"
            >
              Cancel upload
            </button>
          )}

          {phase === "done" && (
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-gray-800"
            >
              Done
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Form phase                                                                 */
/* -------------------------------------------------------------------------- */

function FormPhase({
  brand,
  setBrand,
  model,
  setModel,
  sku,
  setSku,
  size,
  setSize,
  condition,
  setCondition,
  files,
  filledCount,
  error,
  onFileChange,
}: {
  brand: string;
  setBrand: (v: string) => void;
  model: string;
  setModel: (v: string) => void;
  sku: string;
  setSku: (v: string) => void;
  size: string;
  setSize: (v: string) => void;
  condition: string;
  setCondition: (v: string) => void;
  files: Partial<Record<Angle, FileState>>;
  filledCount: number;
  error: string | null;
  onFileChange: (angle: Angle, file: File | null) => void;
}) {
  return (
    <div className="space-y-7">
      {error && (
        <div className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-3.5">
          <span className="material-symbols-outlined text-[20px] text-red-600">
            error
          </span>
          <p className="flex-1 text-sm text-red-700">{error}</p>
        </div>
      )}

      {/* Details */}
      <section>
        <h3 className="text-sm font-semibold text-gray-900">
          Details
        </h3>
        <p className="mt-0.5 text-xs text-gray-500">
          Optional — can be filled in during verification if
          unknown.
        </p>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Field
            label="Brand"
            value={brand}
            onChange={setBrand}
            placeholder="e.g. Nike"
          />
          <Field
            label="Model"
            value={model}
            onChange={setModel}
            placeholder="e.g. Air Max 90"
          />
          <Field
            label="SKU"
            value={sku}
            onChange={setSku}
            placeholder="e.g. CZ5594-100"
          />
          <Field
            label="Size"
            value={size}
            onChange={setSize}
            placeholder="e.g. 42"
          />

          <div className="sm:col-span-2">
            <label className="mb-1.5 block text-sm font-medium text-gray-700">
              Condition
            </label>
            <select
              value={condition}
              onChange={(e) => setCondition(e.target.value)}
              className="h-11 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm outline-none focus:border-gray-500 focus:ring-2 focus:ring-gray-200"
            >
              <option value="unknown">Unknown</option>
              <option value="a">A — Like new</option>
              <option value="b">B — Good</option>
              <option value="c">C — Fair</option>
              <option value="d">D — Poor</option>
            </select>
          </div>
        </div>
      </section>

      {/* Images */}
      <section>
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-gray-900">
              Capture images
            </h3>
            <p className="mt-0.5 text-xs text-gray-500">
              One photo per angle. JPEG, PNG, WebP, or HEIC.
            </p>
          </div>

          <span
            className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${
              filledCount === REQUIRED_ANGLES.length
                ? "bg-emerald-50 text-emerald-700"
                : "bg-gray-100 text-gray-600"
            }`}
          >
            {filledCount} / {REQUIRED_ANGLES.length}
          </span>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {REQUIRED_ANGLES.map((angle) => (
            <AngleSlot
              key={angle}
              label={ANGLE_LABELS[angle]}
              hint={ANGLE_HINTS[angle]}
              state={files[angle]}
              onChange={(file) => onFileChange(angle, file)}
            />
          ))}
        </div>
      </section>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Uploading phase                                                            */
/* -------------------------------------------------------------------------- */

function UploadingPhase({
  files,
  doneCount,
  total,
  onCancel: _onCancel,
}: {
  files: Partial<Record<Angle, FileState>>;
  doneCount: number;
  total: number;
  onCancel: () => void;
}) {
  const pct = Math.round((doneCount / total) * 100);

  return (
    <div className="space-y-5">
      {/* Overall progress */}
      <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium text-gray-900">
            Uploading {doneCount} of {total}
          </p>
          <p className="text-xs font-medium text-gray-500">
            {pct}%
          </p>
        </div>

        <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-gray-200">
          <div
            className="h-full rounded-full bg-gray-900 transition-all duration-300"
            style={{ width: `${pct}%` }}
          />
        </div>

        <p className="mt-2 text-xs text-gray-500">
          You can close this dialog while uploads continue in
          the background.
        </p>
      </div>

      {/* Tiles */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {REQUIRED_ANGLES.map((angle) => (
          <UploadTile
            key={angle}
            label={ANGLE_LABELS[angle]}
            state={files[angle]!}
          />
        ))}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Done phase                                                                 */
/* -------------------------------------------------------------------------- */

function DonePhase() {
  return (
    <div className="flex flex-col items-center justify-center py-10 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-50">
        <span className="material-symbols-outlined text-[32px] text-emerald-600">
          check_circle
        </span>
      </div>

      <h3 className="mt-5 text-base font-semibold text-gray-900">
        Pair created
      </h3>

      <p className="mt-1 max-w-sm text-sm text-gray-500">
        All six images uploaded successfully. The pair is now
        ready for identification.
      </p>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Field                                                                      */
/* -------------------------------------------------------------------------- */

function Field({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <div>
      <label className="mb-1.5 block text-sm font-medium text-gray-700">
        {label}
      </label>
      <input
        type="text"
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="h-11 w-full rounded-lg border border-gray-300 px-3 text-sm outline-none placeholder:text-gray-400 focus:border-gray-500 focus:ring-2 focus:ring-gray-200"
      />
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Angle slot                                                                 */
/* -------------------------------------------------------------------------- */

function AngleSlot({
  label,
  hint,
  state,
  onChange,
}: {
  label: string;
  hint: string;
  state: FileState | undefined;
  onChange: (file: File | null) => void;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [dragOver, setDragOver] = useState(false);

  function openPicker() {
    inputRef.current?.click();
  }

  function handleDrop(event: React.DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragOver(false);

    const file = event.dataTransfer.files?.[0];
    if (file) onChange(file);
  }

  return (
    <div
      className={`group relative overflow-hidden rounded-xl border-2 transition ${
        state
          ? "border-gray-200 bg-white"
          : dragOver
            ? "border-gray-900 bg-gray-50"
            : "border-dashed border-gray-300 bg-gray-50 hover:border-gray-400"
      }`}
      onDragOver={(e) => {
        e.preventDefault();
        if (!state) setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={handleDrop}
    >
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0] ?? null;
          onChange(file);
          e.target.value = "";
        }}
      />

      {/* Preview or dropzone */}
      <div className="aspect-square">
        {state ? (
          <img
            src={state.previewUrl}
            alt={label}
            className="h-full w-full object-cover"
          />
        ) : (
          <button
            type="button"
            onClick={openPicker}
            className="flex h-full w-full flex-col items-center justify-center gap-2 p-4 text-center"
          >
            <span className="material-symbols-outlined text-[30px] text-gray-400">
              add_photo_alternate
            </span>
            <span className="text-xs font-semibold text-gray-700">
              {label}
            </span>
            <span className="text-[11px] leading-4 text-gray-500">
              {hint}
            </span>
            <span className="mt-1 text-[11px] font-medium text-gray-500">
              Click or drop
            </span>
          </button>
        )}
      </div>

      {/* Overlay when a file exists */}
      {state && (
        <div className="pointer-events-none absolute inset-0 flex flex-col justify-between bg-gradient-to-t from-black/60 via-transparent to-black/30 opacity-0 transition group-hover:opacity-100">
          <div className="flex justify-end p-2">
            <button
              type="button"
              className="pointer-events-auto flex h-7 w-7 items-center justify-center rounded-full bg-white/90 text-gray-700 shadow-sm hover:bg-white"
              aria-label={`Remove ${label}`}
              onClick={() => onChange(null)}
            >
              <span className="material-symbols-outlined text-[16px]">
                close
              </span>
            </button>
          </div>

          <div className="flex items-end justify-between gap-2 p-2">
            <div className="min-w-0">
              <p className="truncate text-[11px] font-semibold text-white">
                {label}
              </p>
              <p className="truncate text-[10px] text-white/70">
                {formatBytes(state.file.size)}
              </p>
            </div>

            <button
              type="button"
              className="pointer-events-auto rounded-md bg-white/90 px-2 py-1 text-[11px] font-medium text-gray-800 hover:bg-white"
              onClick={openPicker}
            >
              Replace
            </button>
          </div>
        </div>
      )}

      {/* Always-visible label bar when empty */}
      {!state && (
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/60 to-transparent px-2 py-1.5">
          <p className="truncate text-[11px] font-medium text-white">
            {label}
          </p>
        </div>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Upload tile                                                                */
/* -------------------------------------------------------------------------- */

function UploadTile({
  label,
  state,
}: {
  label: string;
  state: FileState;
}) {
  const { status, progress, error, previewUrl, file } = state;

  const statusLabel =
    status === "pending"
      ? "Waiting"
      : status === "uploading"
        ? "Uploading"
        : status === "completing"
          ? "Finalizing"
          : status === "done"
            ? "Done"
            : "Failed";

  return (
    <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
      <div className="relative aspect-square bg-gray-100">
        <img
          src={previewUrl}
          alt={label}
          className={`h-full w-full object-cover transition ${
            status === "error" ? "opacity-60" : ""
          }`}
        />

        {/* Dimming overlay while not done */}
        {(status === "uploading" ||
          status === "completing" ||
          status === "pending") && (
          <div className="absolute inset-0 bg-black/30" />
        )}

        {/* Circular progress in the middle */}
        {status === "uploading" && (
          <div className="absolute inset-0 flex items-center justify-center">
            <ProgressRing value={progress} />
          </div>
        )}

        {status === "completing" && (
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="material-symbols-outlined animate-spin text-[32px] text-white">
              progress_activity
            </span>
          </div>
        )}

        {status === "done" && (
          <div className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-emerald-500 text-white shadow-sm">
            <span className="material-symbols-outlined text-[16px]">
              check
            </span>
          </div>
        )}

        {status === "error" && (
          <div className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-red-500 text-white shadow-sm">
            <span className="material-symbols-outlined text-[16px]">
              priority_high
            </span>
          </div>
        )}
      </div>

      <div className="space-y-2 p-3">
        <div className="flex items-center justify-between gap-2">
          <p className="truncate text-xs font-semibold text-gray-800">
            {label}
          </p>

          <span
            className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${
              status === "done"
                ? "bg-emerald-50 text-emerald-700"
                : status === "error"
                  ? "bg-red-50 text-red-700"
                  : "bg-gray-100 text-gray-600"
            }`}
          >
            {statusLabel}
          </span>
        </div>

        {status === "error" && error && (
          <p className="line-clamp-2 text-[11px] text-red-600">
            {error}
          </p>
        )}

        {status === "uploading" && (
          <div className="h-1 w-full overflow-hidden rounded-full bg-gray-100">
            <div
              className="h-full rounded-full bg-gray-900 transition-all"
              style={{ width: `${progress}%` }}
            />
          </div>
        )}

        <p className="truncate text-[10px] text-gray-400">
          {formatBytes(file.size)}
        </p>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Progress ring                                                              */
/* -------------------------------------------------------------------------- */

function ProgressRing({ value }: { value: number }) {
  const size = 44;
  const stroke = 4;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const dash = (value / 100) * circumference;

  return (
    <div className="relative flex h-11 w-11 items-center justify-center">
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="rgba(255,255,255,0.25)"
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="white"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${dash} ${circumference - dash}`}
        />
      </svg>

      <span className="absolute text-[10px] font-semibold text-white">
        {Math.round(value)}%
      </span>
    </div>
  );
}