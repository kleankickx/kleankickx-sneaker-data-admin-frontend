/*
 * Bulk upload driver.
 *
 * Orchestrates one bulk job: create pairs + upload slots, upload every
 * file straight to Cloudinary, then confirm the uploads with the API.
 * State lives in bulk-upload-store; this module only drives it, so it
 * keeps running when the page that started it unmounts.
 */

import {
  completeCaptureImagesBulk,
  createPairsBulk,
  retryCaptureImage,
  type BulkPairPayload,
  type CreatePairsBulkResponse,
} from "./api";
import { useBulkUpload, type QueueItem } from "./bulk-upload-store";

export const UPLOAD_CONCURRENCY = 6;
const RETRY_ALL_CONCURRENCY = 3;

/* Server-side caps (BatchBulkCreateSerializer / complete-bulk). */
const MAX_PAIRS_PER_REQUEST = 50;
const MAX_COMPLETE_IDS = 200;

export interface RunBulkUploadInput {
  batchId: string;
  pairs: BulkPairPayload[];
  /** Map from clientRef to File objects keyed by angle. */
  files: Record<string, Partial<Record<string, File>>>;
}

/* Re-created per run; aborted by cancelBulkUpload. */
let controller = new AbortController();

const store = () => useBulkUpload.getState();

function getItem(id: string): QueueItem | undefined {
  return store().items.find((i) => i.id === id);
}

function setPhase(phase: ReturnType<typeof store>["phase"]): void {
  console.debug(`[bulk] phase → ${phase}`);
  store().setPhase(phase);
}

/* ============================================================
   HELPERS
   ============================================================ */

function errorMessage(error: unknown): string {
  const e = error as {
    response?: { data?: { error?: { message?: string } } };
    message?: string;
  };
  return (
    e?.response?.data?.error?.message ||
    e?.message ||
    "Unexpected error."
  );
}

function isAbortError(error: unknown): boolean {
  return (error as { name?: string })?.name === "AbortError";
}

function httpStatus(error: unknown): number | undefined {
  return (error as { response?: { status?: number } })?.response?.status;
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }
  return out;
}

async function runWithConcurrency<T>(
  items: T[],
  limit: number,
  worker: (item: T) => Promise<void>,
): Promise<void> {
  let next = 0;

  async function lane(): Promise<void> {
    while (next < items.length) {
      const item = items[next++];
      await worker(item);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, lane),
  );
}

/* Once nothing is in flight, the job is done or failed. */
function settlePhase(): void {
  const { items } = store();
  const busy = items.some((i) =>
    ["queued", "uploading", "uploaded", "completing"].includes(i.status),
  );
  if (busy) return;

  setPhase(items.some((i) => i.status === "failed") ? "failed" : "done");
}

/* ============================================================
   UPLOAD
   ============================================================ */

function uploadOne(
  item: QueueItem,
  onProgress: (pct: number) => void,
  signal: AbortSignal,
): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new DOMException("Aborted", "AbortError"));
      return;
    }
    if (!item.uploadUrl) {
      reject(new Error("No upload slot returned."));
      return;
    }

    const xhr = new XMLHttpRequest();
    const onAbort = () => xhr.abort();
    const settle = (fn: () => void) => {
      signal.removeEventListener("abort", onAbort);
      fn();
    };

    xhr.open("POST", item.uploadUrl);
    signal.addEventListener("abort", onAbort);

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) {
        onProgress(Math.round((event.loaded / event.total) * 100));
      }
    };

    xhr.onload = () =>
      settle(() => {
        if (xhr.status >= 200 && xhr.status < 300) resolve();
        else reject(new Error(`Upload failed (${xhr.status})`));
      });
    xhr.onabort = () =>
      settle(() => reject(new DOMException("Aborted", "AbortError")));
    xhr.onerror = () => settle(() => reject(new Error("Network error")));
    xhr.ontimeout = () =>
      settle(() => reject(new Error("Upload timed out")));

    const formData = new FormData();
    formData.append("file", item.file);
    for (const [key, value] of Object.entries(item.uploadFields ?? {})) {
      formData.append(key, String(value));
    }

    xhr.send(formData);
  });
}

async function uploadItem(id: string, signal: AbortSignal): Promise<void> {
  const item = getItem(id);
  if (!item || signal.aborted) return;

  store().updateItem(id, { status: "uploading", progress: 0 });

  let lastPct = 0;
  try {
    await uploadOne(
      item,
      (pct) => {
        if (pct === lastPct) return;
        lastPct = pct;
        store().updateItem(id, { progress: pct });
      },
      signal,
    );
    store().updateItem(id, { status: "uploaded", progress: 100 });
  } catch (error) {
    if (isAbortError(error)) return;
    store().updateItem(id, {
      status: "failed",
      error: errorMessage(error),
      attempts: item.attempts + 1,
    });
  }
}

/* ============================================================
   COMPLETE
   ============================================================ */

async function completeItems(ids: string[]): Promise<void> {
  const items = ids
    .map(getItem)
    .filter((i): i is QueueItem => i?.imageId !== undefined);

  for (const group of chunk(items, MAX_COMPLETE_IDS)) {
    for (const item of group) {
      store().updateItem(item.id, { status: "completing" });
    }

    try {
      const result = await completeCaptureImagesBulk(
        group.map((i) => i.imageId!),
      );
      const failed = new Map(
        result.failed.map((f) => [f.image_id, f.error]),
      );

      for (const item of group) {
        const error = failed.get(item.imageId!);
        store().updateItem(
          item.id,
          error === undefined
            ? { status: "done" }
            : { status: "failed", error },
        );
      }
    } catch (error) {
      const message = `Could not confirm upload: ${errorMessage(error)}`;
      for (const item of group) {
        store().updateItem(item.id, { status: "failed", error: message });
      }
    }
  }
}

/* ============================================================
   RUN
   ============================================================ */

function pairLabel(pair: BulkPairPayload): string {
  const label = `${pair.brand ?? ""} ${pair.model ?? ""}`.trim();
  return label || pair.client_ref;
}

/* Throws before anything is created if a payload angle has no file. */
function buildItems(input: RunBulkUploadInput): QueueItem[] {
  return input.pairs.flatMap((pair) =>
    pair.uploads.map(({ angle }) => {
      const file = input.files[pair.client_ref]?.[angle];
      if (!file) {
        throw new Error(`No file for ${pair.client_ref} / ${angle}.`);
      }

      return {
        id: `${pair.client_ref}:${angle}`,
        pairId: pair.client_ref,
        pairLabel: pairLabel(pair),
        angle,
        file,
        status: "queued" as const,
        progress: 0,
        attempts: 0,
      };
    }),
  );
}

function applySlots(response: CreatePairsBulkResponse, refs: string[]) {
  const byRef = new Map(response.pairs.map((p) => [p.client_ref, p]));
  const wanted = new Set(refs);

  for (const item of store().items) {
    if (!wanted.has(item.pairId)) continue;

    const slot = byRef
      .get(item.pairId)
      ?.upload_slots.find((s) => s.angle === item.angle);

    store().updateItem(
      item.id,
      slot
        ? {
            imageId: slot.image_id,
            uploadUrl: slot.upload.upload_url,
            uploadFields: slot.upload.fields,
          }
        : { status: "failed", error: "No upload slot returned." },
    );
  }
}

function failPairs(refs: Set<string>, error: string): void {
  for (const item of store().items) {
    if (refs.has(item.pairId)) {
      store().updateItem(item.id, { status: "failed", error });
    }
  }
}

/**
 * Run one bulk upload job end to end. Rejects only if the first
 * create request fails (nothing was created); every later problem is
 * recorded per item and the job ends in phase "failed".
 */
export async function runBulkUpload(
  input: RunBulkUploadInput,
): Promise<void> {
  const items = buildItems(input);

  controller = new AbortController();
  const { signal } = controller;

  store().reset();
  store().setBatchId(input.batchId);
  setPhase("preparing");
  store().setItems(items);

  console.debug(
    `[bulk] start: batch=${input.batchId} pairs=${input.pairs.length} ` +
      `images=${store().items.length}`,
  );

  /*
   * The server caps one create request at 50 pairs, so larger jobs are
   * sent in chunks. Each chunk is atomic; if a later chunk fails, the
   * pairs already created still upload and the rest are marked failed.
   */
  const chunks = chunk(input.pairs, MAX_PAIRS_PER_REQUEST);
  for (const [index, pairs] of chunks.entries()) {
    const refs = pairs.map((p) => p.client_ref);

    try {
      const response = await createPairsBulk(input.batchId, { pairs });
      applySlots(response, refs);
    } catch (error) {
      const remaining = new Set(
        chunks.slice(index).flat().map((p) => p.client_ref),
      );
      failPairs(
        remaining,
        `Pair could not be created: ${errorMessage(error)}`,
      );

      if (index === 0) {
        setPhase("failed");
        throw error;
      }
      break;
    }
  }

  setPhase("uploading");

  const queued = store()
    .items.filter((i) => i.status === "queued" && i.uploadUrl)
    .map((i) => i.id);

  await runWithConcurrency(queued, UPLOAD_CONCURRENCY, (id) =>
    uploadItem(id, signal),
  );

  if (signal.aborted) {
    // Leave cancelled items retryable rather than stuck mid-upload.
    for (const item of store().items) {
      if (item.status === "queued" || item.status === "uploading") {
        store().updateItem(item.id, {
          status: "failed",
          error: "Upload cancelled.",
        });
      }
    }
  }

  const uploaded = store()
    .items.filter((i) => i.status === "uploaded" && i.imageId)
    .map((i) => i.id);

  if (uploaded.length > 0) {
    setPhase("completing");
    await completeItems(uploaded);
  }

  const final = store().items;
  console.debug(
    `[bulk] finished: done=${final.filter((i) => i.status === "done").length} ` +
      `failed=${final.filter((i) => i.status === "failed").length}`,
  );

  settlePhase();
}

export function cancelBulkUpload(): void {
  console.debug("[bulk] cancel requested");
  controller.abort();
}

/* ============================================================
   RETRY
   ============================================================ */

/*
 * Fresh upload instructions for a retry. The retry endpoint only
 * accepts images the server has marked FAILED, which bulk uploads never
 * are (client-side failures never reach the server and bulk complete
 * skips validation), so on a 4xx the item's original signed slot is
 * reused. Cloudinary accepts that signature for about an hour.
 */
async function freshSlot(
  item: QueueItem,
): Promise<Pick<QueueItem, "uploadUrl" | "uploadFields">> {
  try {
    const { upload } = await retryCaptureImage(item.imageId!);
    return { uploadUrl: upload.upload_url, uploadFields: upload.fields };
  } catch (error) {
    const status = httpStatus(error);
    const rejected = status !== undefined && status >= 400 && status < 500;

    if (rejected && item.uploadUrl) {
      console.debug(`[bulk] retry ${item.id}: reusing original slot`);
      return { uploadUrl: item.uploadUrl, uploadFields: item.uploadFields };
    }
    throw error;
  }
}

function isRetryable(item: QueueItem): boolean {
  return item.status === "failed" && item.imageId !== undefined;
}

export async function retryItem(itemId: string): Promise<void> {
  const item = getItem(itemId);
  if (!item || !isRetryable(item)) {
    throw new Error(`Item ${itemId} is not a retryable failed upload.`);
  }

  if (controller.signal.aborted) controller = new AbortController();
  const { signal } = controller;

  store().updateItem(itemId, {
    status: "uploading",
    progress: 0,
    error: undefined,
  });
  if (store().phase !== "uploading") setPhase("uploading");

  try {
    const slot = await freshSlot(item);
    store().updateItem(itemId, slot);

    await uploadOne(
      { ...item, ...slot },
      (pct) => store().updateItem(itemId, { progress: pct }),
      signal,
    );
    store().updateItem(itemId, { status: "completing", progress: 100 });

    const result = await completeCaptureImagesBulk([item.imageId!]);
    const failure = result.failed.find(
      (f) => f.image_id === item.imageId,
    );

    store().updateItem(
      itemId,
      failure
        ? { status: "failed", error: failure.error }
        : { status: "done" },
    );
  } catch (error) {
    store().updateItem(itemId, {
      status: "failed",
      error: isAbortError(error)
        ? "Upload cancelled."
        : errorMessage(error),
      attempts: item.attempts + 1,
    });
  } finally {
    settlePhase();
  }
}

/* Serial on purpose: retries are rare and serial keeps logs readable. */
export async function retryPair(pairId: string): Promise<void> {
  const ids = store()
    .items.filter((i) => i.pairId === pairId && isRetryable(i))
    .map((i) => i.id);

  for (const id of ids) {
    await retryItem(id);
  }
}

export async function retryAllFailed(): Promise<void> {
  const ids = store().items.filter(isRetryable).map((i) => i.id);
  await runWithConcurrency(ids, RETRY_ALL_CONCURRENCY, retryItem);
}
