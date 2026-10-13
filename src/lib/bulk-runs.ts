/** Bulk pipeline runs: many pairs, paced for the vision provider. */
import { api, type PipelineOverrides } from "./api";

export type BulkStatus = "running" | "paused" | "completed" | "cancelled";
export type BulkItemStatus =
  | "queued"
  | "running"
  | "succeeded"
  | "needs_attention"
  | "failed"
  | "skipped"
  | "cancelled";
export type BulkScope = "all" | "no_result" | "needs_attention" | "unverified";

export type BulkCounts = Record<BulkItemStatus, number> & { total: number; waiting_retry: number };

export interface BulkRun {
  id: string;
  label: string;
  status: BulkStatus;
  pause_reason: string;
  source_batch: string | null;
  scope: string;
  overrides: PipelineOverrides;
  is_test: boolean;
  created_by: string | null;
  created_at: string;
  finished_at: string | null;
  counts: BulkCounts;
}

export interface BulkItem {
  id: string;
  sneaker_pair: string;
  sneaker_pair_id: string;
  brand: string;
  model: string;
  status: BulkItemStatus;
  error: string;
  /* "rate_limited", "quota", "unavailable", "photos", "vision", "pipeline" */
  error_kind: string;
  attempts: number;
  next_attempt_at: string | null;
  started_at: string | null;
  finished_at: string | null;
  run: string | null;
  run_status: string | null;
  duration_ms: number | null;
  result: Record<"brand" | "model" | "sku" | "size", { value: string | null; confidence: number } | null> | null;
}

export interface BulkPreview {
  pairs: number;
  will_run: number;
  skipped: { reason: string; pairs: number }[];
  max_pairs: number;
  concurrency: number;
  scopes: { value: BulkScope; label: string }[];
}

export interface BulkSelection {
  batch?: string;
  scope?: BulkScope;
  pairs?: string[];
}

export async function previewBulkRun(selection: BulkSelection): Promise<BulkPreview> {
  const response = await api.post("/pipeline-bulk-runs/preview/", selection);
  return response.data.data;
}

export async function startBulkRun(
  selection: BulkSelection & { overrides?: PipelineOverrides; is_test?: boolean },
): Promise<BulkRun> {
  const response = await api.post("/pipeline-bulk-runs/", selection);
  return response.data.data;
}

export async function listBulkRuns(batch?: string): Promise<BulkRun[]> {
  const response = await api.get("/pipeline-bulk-runs/", { params: batch ? { batch } : {} });
  return response.data.data;
}

export async function getBulkRun(
  id: string,
  params: { status?: string; page?: number } = {},
): Promise<{ run: BulkRun; items: BulkItem[]; count: number }> {
  const response = await api.get(`/pipeline-bulk-runs/${id}/`, {
    params: Object.fromEntries(Object.entries(params).filter(([, v]) => v)),
  });
  const { items, ...run } = response.data.data;
  return { run, items, count: response.data.meta?.count ?? items.length };
}

/** Queue chosen pairs again, or every pair with one of `statuses`. */
export async function retryBulkRun(
  id: string,
  target: { items: string[] } | { statuses: BulkItemStatus[] },
): Promise<BulkRun & { queued: number }> {
  const response = await api.post(`/pipeline-bulk-runs/${id}/retry/`, target);
  return response.data.data;
}

export async function cancelBulkRun(id: string): Promise<BulkRun> {
  const response = await api.post(`/pipeline-bulk-runs/${id}/cancel/`);
  return response.data.data;
}

/** Completed or cancelled runs only; the pairs keep their runs and results. */
export async function deleteBulkRun(id: string): Promise<void> {
  await api.delete(`/pipeline-bulk-runs/${id}/`);
}

export async function resumeBulkRun(id: string): Promise<BulkRun> {
  const response = await api.post(`/pipeline-bulk-runs/${id}/resume/`);
  return response.data.data;
}

export const ITEM_STATUS: Record<BulkItemStatus, { label: string; badge: string; bar: string }> = {
  succeeded: { label: "Succeeded", badge: "bg-emerald-50 text-emerald-700 ring-emerald-600/20", bar: "bg-emerald-500" },
  needs_attention: { label: "Needs attention", badge: "bg-amber-50 text-amber-700 ring-amber-600/20", bar: "bg-amber-400" },
  failed: { label: "Failed", badge: "bg-red-50 text-red-700 ring-red-600/20", bar: "bg-red-500" },
  running: { label: "Running", badge: "bg-sky-50 text-sky-700 ring-sky-600/20", bar: "bg-sky-500" },
  queued: { label: "Queued", badge: "bg-gray-100 text-gray-700 ring-gray-500/20", bar: "bg-gray-300" },
  skipped: { label: "Skipped", badge: "bg-gray-50 text-gray-500 ring-gray-400/20", bar: "bg-gray-200" },
  cancelled: { label: "Cancelled", badge: "bg-gray-50 text-gray-500 ring-gray-400/20", bar: "bg-gray-200" },
};

export const BULK_STATUS: Record<BulkStatus, { label: string; badge: string }> = {
  running: { label: "Running", badge: "bg-sky-50 text-sky-700 ring-sky-600/20" },
  paused: { label: "Paused", badge: "bg-amber-50 text-amber-700 ring-amber-600/20" },
  completed: { label: "Completed", badge: "bg-emerald-50 text-emerald-700 ring-emerald-600/20" },
  cancelled: { label: "Cancelled", badge: "bg-gray-100 text-gray-600 ring-gray-500/20" },
};

/** Pairs that finished one way or another (for progress). */
export function done(counts: BulkCounts) {
  return counts.succeeded + counts.needs_attention + counts.failed + counts.skipped + counts.cancelled;
}
