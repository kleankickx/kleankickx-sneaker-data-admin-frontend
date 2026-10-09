import axios from "axios";
import type {
  AIIdentificationJob,
  AnalysisRun,
  ApiResponse,
  Batch,
  CaptureImage,
  ReviewQueueNeighbors,
  ReviewQueueRow,
  SneakerPair,
  VerificationEligibility,
} from "./types";

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ??
  "http://127.0.0.1:8000/api/v1";

/* ============================================================
   AXIOS INSTANCE
   ============================================================ */

export const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    "Content-Type": "application/json",
  },
  timeout: 30000,
  /* Send cookies on every request. Required for httpOnly auth. */
  withCredentials: true,
});

/* ============================================================
   TYPES
   ============================================================ */

export interface AuthUser {
  id: string | number;
  email: string;
  name?: string;
  username?: string;
  role?: string;
  /* Staff see the pipeline monitor. */
  is_staff?: boolean;
}

export type ApiErrorCode =
  | "authentication_required"
  | "authentication_failed"
  | "token_not_valid"
  | "token_expired"
  | "token_invalid"
  | "permission_denied"
  | "bad_request"
  | "validation_error"
  | "not_found"
  | "method_not_allowed"
  | "conflict"
  | "rate_limit_exceeded"
  | "server_error"
  | "api_error";

/* ============================================================
   RESPONSE INTERCEPTOR — refresh on 401, retry once
   ============================================================ */

let refreshPromise: Promise<boolean> | null = null;

async function refreshSession(): Promise<boolean> {
  try {
    await axios.post(
      `${API_BASE_URL}/auth/token/refresh/`,
      {},
      {
        withCredentials: true,
        headers: { "Content-Type": "application/json" },
      },
    );
    return true;
  } catch {
    return false;
  }
}

/* One refresh request at a time, shared by everything waiting on it. */
async function refreshOnce(): Promise<boolean> {
  refreshPromise = refreshPromise ?? refreshSession();
  try {
    return await refreshPromise;
  } finally {
    refreshPromise = null;
  }
}

/**
 * Codes that mean "the access token is no longer usable, try
 * a refresh before giving up." Anything else (e.g. wrong
 * credentials on the login form) should propagate unchanged.
 */
const REFRESHABLE_CODES: ReadonlySet<string> = new Set([
  "token_expired",
  "token_not_valid",
  "authentication_required",
]);

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const original = error.config;
    const status = error.response?.status;
    const code = error.response?.data?.error?.code as
      | string
      | undefined;

    const url = String(original?.url ?? "");
    const isAuthEndpoint =
      url.includes("/auth/login/") ||
      url.includes("/auth/logout/") ||
      url.includes("/auth/token/refresh/") ||
      url.includes("/auth/me/");

    if (
      status === 401 &&
      !original?._retry &&
      !isAuthEndpoint &&
      code &&
      REFRESHABLE_CODES.has(code)
    ) {
      original._retry = true;

      if (await refreshOnce()) {
        return api(original);
      }

      /* Refresh failed. Notify the auth provider and let
         ProtectedRoute handle the redirect so router state
         (and therefore the login page's "reason") survives. */
      if (typeof window !== "undefined") {
        window.dispatchEvent(new Event("kkx:session-expired"));
      }
    }

    return Promise.reject(error);
  },
);

/* ============================================================
   AUTH
   ============================================================ */

export interface LoginResponse {
  user: AuthUser;
}

export async function login(
  username: string,
  password: string,
): Promise<LoginResponse> {
  const response = await api.post<any>("/auth/login/", {
    username,
    password,
  });

  const body = response?.data ?? {};
  const data = body?.data ?? body;

  return { user: data.user as AuthUser };
}

export async function logout(): Promise<void> {
  await api.post("/auth/logout/");
}

export async function getMe(): Promise<AuthUser> {
  const response = await api.get<any>("/auth/me/");
  const body = response?.data ?? {};
  return (body?.data ?? body) as AuthUser;
}

/**
 * Who is logged in, used on page load. The access cookie only lives
 * 15 minutes, so a 401 here usually means "expired", not "logged out":
 * refresh once with the 7-day refresh cookie and ask again. Rejects
 * only when there is no usable session.
 */
export async function restoreSession(): Promise<AuthUser> {
  try {
    return await getMe();
  } catch (error) {
    const status = (error as { response?: { status?: number } })?.response
      ?.status;
    if (status === 401 && (await refreshOnce())) {
      return getMe();
    }
    throw error;
  }
}

/* ============================================================
   BATCHES
   ============================================================ */

export interface BatchesMeta {
  count: number;
  next: string | null;
  previous: string | null;
}

export interface BatchesResponse {
  results: Batch[];
  meta: BatchesMeta;
}

export async function getBatches(): Promise<BatchesResponse> {
  const response = await api.get<any>("/batches/");

  const body = response?.data ?? {};
  const data = body?.data ?? body;

  return {
    results: Array.isArray(data?.results)
      ? data.results
      : Array.isArray(data)
        ? data
        : [],
    meta: {
      count:
        typeof data?.count === "number"
          ? data.count
          : Array.isArray(data?.results)
            ? data.results.length
            : Array.isArray(data)
              ? data.length
              : 0,
      next: data?.next ?? null,
      previous: data?.previous ?? null,
    },
  };
}

export async function getBatch(
  batchId: string,
): Promise<Batch> {
  const response = await api.get<ApiResponse<Batch>>(
    `/batches/${batchId}/`,
  );

  return response.data.data;
}

export async function createBatch(data: {
  name: string;
  source: string;
  expected_quantity: number;
}): Promise<Batch> {
  const response = await api.post<ApiResponse<Batch>>(
    "/batches/",
    data,
  );

  return response.data.data;
}

export async function updateBatch(
  batchId: string,
  data: {
    name?: string;
    source?: string;
    expected_quantity?: number;
  },
): Promise<Batch> {
  const response = await api.patch<ApiResponse<Batch>>(
    `/batches/${batchId}/`,
    data,
  );

  return response.data.data;
}

export async function deleteBatch(
  batchId: string,
): Promise<void> {
  await api.delete(`/batches/${batchId}/`);
}

export async function openBatch(
  batchId: string,
): Promise<Batch> {
  const response = await api.post<ApiResponse<Batch>>(
    `/batches/${batchId}/open/`,
  );

  return response.data.data;
}

export async function closeBatch(
  batchId: string,
): Promise<Batch> {
  const response = await api.post<ApiResponse<Batch>>(
    `/batches/${batchId}/close/`,
  );

  return response.data.data;
}

/* ============================================================
   SNEAKERS
   ============================================================ */

export interface SneakersMeta {
  count: number;
  next: string | null;
  previous: string | null;
}

export interface SneakersResponse {
  results: SneakerPair[];
  meta: SneakersMeta;
}

export interface SneakersParams {
  page?: number;
  page_size?: number;
  search?: string;
  status?: string;
  condition?: string;
  brand?: string;
  ordering?: string;
}

export async function getSneakers(
  params: SneakersParams = {},
): Promise<SneakersResponse> {
  const response = await api.get<any>("/sneakers/", {
    params,
  });

  const body = response?.data ?? {};
  const data = body?.data ?? body;

  return {
    results: Array.isArray(data?.results)
      ? data.results
      : Array.isArray(data)
        ? data
        : [],
    meta: {
      count:
        typeof data?.count === "number"
          ? data.count
          : Array.isArray(data?.results)
            ? data.results.length
            : Array.isArray(data)
              ? data.length
              : 0,
      next: data?.next ?? null,
      previous: data?.previous ?? null,
    },
  };
}

export async function getSneaker(
  sneakerId: string,
): Promise<SneakerPair> {
  const response = await api.get<ApiResponse<SneakerPair>>(
    `/sneakers/${sneakerId}/`,
  );

  return response.data.data;
}

/* ============================================================
   BATCH DETAILS
   ============================================================ */

export interface BatchDetailsMeta {
  count: number;
  next: string | null;
  previous: string | null;
}

export interface BatchDetailsResponse {
  batch: Batch;
  pairs: SneakerPair[];
  meta: BatchDetailsMeta;
}

export interface BatchDetailsParams {
  page?: number;
  page_size?: number;
  search?: string;
  status?: string;
  condition?: string;
  brand?: string;
  ordering?: string;
}

export async function getBatchDetails(
  batchId: string,
  params: BatchDetailsParams = {},
): Promise<BatchDetailsResponse> {
  const response = await api.get<
    ApiResponse<BatchDetailsResponse>
  >(`/batches/${batchId}/details/`, {
    params,
  });

  return response.data.data;
}

/* ============================================================
   BATCH CLEANUP — pairs without images
   ============================================================ */

export interface PairWithoutImages {
  id: string;
  pair_id: string | null;
  brand: string | null;
  model: string | null;
  status: string;
  created_at: string;
}

export interface PairsWithoutImagesPreview {
  count: number;
  preview: PairWithoutImages[];
  preview_limit: number;
}

export type BatchCleanupJobStatus =
  | "pending"
  | "running"
  | "done"
  | "failed";

export interface BatchCleanupJob {
  job_id: string;
  status: BatchCleanupJobStatus;
  total: number;
  deleted: number;
  error: string;
  created_at: string;
  updated_at: string;
}

export interface DeleteBatchPairsResponse {
  job_id: string | null;
  status: BatchCleanupJobStatus;
  poll_url?: string;
  deleted_count?: number;
}

export async function getBatchPairsWithoutImages(
  batchId: string,
): Promise<PairsWithoutImagesPreview> {
  const response = await api.get<
    ApiResponse<PairsWithoutImagesPreview>
  >(`/batches/${batchId}/pairs-without-images/`);

  return response.data.data;
}

export async function deleteBatchPairsWithoutImages(
  batchId: string,
): Promise<DeleteBatchPairsResponse> {
  const response = await api.post<
    ApiResponse<DeleteBatchPairsResponse>
  >(`/batches/${batchId}/pairs-without-images/delete/`, {
    confirm: true,
  });

  return response.data.data;
}

export async function getBatchCleanupJob(
  batchId: string,
  jobId: string,
): Promise<BatchCleanupJob> {
  const response = await api.get<ApiResponse<BatchCleanupJob>>(
    `/batches/${batchId}/cleanup-jobs/${jobId}/`,
  );

  return response.data.data;
}

/* ============================================================
   GLOBAL CLEANUP — pairs without images (across all batches)

   Used by SneakersPage for a workspace-wide cleanup. For
   per-batch cleanup, see the next section.
   ============================================================ */

export async function getPairsWithoutImages(): Promise<PairsWithoutImagesPreview> {
  const response = await api.get<
    ApiResponse<PairsWithoutImagesPreview>
  >("/sneakers/without-images/");

  return response.data.data;
}

export async function deletePairsWithoutImages(): Promise<{
  deleted_count: number;
  deleted_ids: string[];
}> {
  const response = await api.post<
    ApiResponse<{
      deleted_count: number;
      deleted_ids: string[];
    }>
  >("/sneakers/without-images/delete/", {
    confirm: true,
  });

  return response.data.data;
}


/* ============================================================
   DASHBOARD
   ============================================================ */

export interface DashboardStats {
  batches: number;
  sneakers: number;
  photos: number;
  pending_verification: number;
  identified: number;
  verified: number;
}

export async function getDashboardStats(): Promise<DashboardStats> {
  const response = await api.get<ApiResponse<DashboardStats>>(
    "/dashboard/stats/",
  );

  return response.data.data;
}


export interface PairUploadSlot {
  angle: string;
  image_id: string;
  upload: {
    upload_url: string;
    fields: Record<string, string | number>;
  };
}

export interface CreatePairResponse {
  pair: SneakerPair;
  capture_session_id: string;
  upload_slots: PairUploadSlot[];
}

export interface CreatePairPayload {
  brand?: string;
  model?: string;
  sku?: string;
  size?: string;
  condition?: string;
  uploads: Array<{
    angle: string;
    file_size: number;
    content_type: string;
    original_filename?: string;
  }>;
}

export async function createPairInBatch(
  batchId: string,
  payload: CreatePairPayload,
): Promise<CreatePairResponse> {
  const response = await api.post<ApiResponse<CreatePairResponse>>(
    `/batches/${batchId}/pairs/`,
    payload,
  );

  return response.data.data;
}

export async function completeCaptureImage(
  imageId: string,
): Promise<void> {
  await api.post(`/capture-images/${imageId}/complete/`);
}

export default api;

/* ============================================================
   BULK PAIR UPLOAD
   ============================================================ */

/* Matches BatchBulkCreatedPairSerializer in the backend. */
export interface BulkCreatedPair {
  client_ref: string;
  pair: {
    id: string;
    pair_id: string;
    pair_number: number;
    batch: string;
    brand: string;
    model: string;
    sku: string;
    size: string;
    condition: string;
    status: string;
    created_at: string;
  };
  capture_session_id: string;
  upload_slots: PairUploadSlot[];
}

export interface CreatePairsBulkResponse {
  pairs: BulkCreatedPair[];
}

export interface BulkPairUploadSlotPayload {
  angle: string;
  file_size: number;
  content_type: string;
  original_filename?: string;
}

export interface BulkPairPayload {
  client_ref: string;
  brand?: string;
  model?: string;
  sku?: string;
  size?: string;
  condition?: string;
  uploads: BulkPairUploadSlotPayload[];
}

export interface CompleteBulkResponse {
  completed: number;
  failed: Array<{ image_id: string; error: string }>;
}

/*
 * Retry returns the flat CaptureImageSerializer, which includes
 * capture_session but not image_url (unlike the nested CaptureImage).
 */
export interface RetryCaptureImageResponse {
  image: Omit<CaptureImage, "image_url"> & {
    capture_session: string;
  };
  upload: PairUploadSlot["upload"];
}

export async function createPairsBulk(
  batchId: string,
  body: { pairs: BulkPairPayload[] },
): Promise<CreatePairsBulkResponse> {
  const response = await api.post<ApiResponse<CreatePairsBulkResponse>>(
    `/batches/${batchId}/pairs/bulk/`,
    body,
  );

  return response.data.data;
}

export async function completeCaptureImagesBulk(
  imageIds: string[],
): Promise<CompleteBulkResponse> {
  const response = await api.post<ApiResponse<CompleteBulkResponse>>(
    "/capture-images/complete-bulk/",
    { image_ids: imageIds },
  );

  return response.data.data;
}

export async function retryCaptureImage(
  imageId: string,
): Promise<RetryCaptureImageResponse> {
  const response = await api.post<ApiResponse<RetryCaptureImageResponse>>(
    `/capture-images/${imageId}/retry/`,
    {},
  );

  return response.data.data;
}

/* ============================================================
   UPLOAD CONFIG
   ============================================================ */

export interface UploadConfig {
  max_capture_image_size: number;
  allowed_content_types: string[];
  required_angles: string[];
  extension_to_content_type: Record<string, string>;
}

export async function getUploadConfig(): Promise<UploadConfig> {
  const response = await api.get<ApiResponse<UploadConfig>>("/config/");

  return response.data.data;
}

/* ============================================================
   EDIT / DELETE SNEAKER PAIR
   ============================================================ */

export interface SneakerPairEdit {
  brand?: string;
  model?: string;
  sku?: string;
  size?: string;
  colorway?: string;
  condition?: string;
}

/* Matches SneakerPairDeletionService.preview in the backend. */
export interface PairDeletionPreview {
  capture_sessions: number;
  images: number;
  stored_files: number;
  identifications: number;
  materials: number;
  ai_jobs: number;
  is_verified: boolean;
}

export interface DeletePairResponse {
  id: string;
  pair_id: string;
  deleted: PairDeletionPreview;
}

export async function updateSneaker(
  sneakerId: string,
  data: SneakerPairEdit,
): Promise<SneakerPair> {
  const response = await api.patch<ApiResponse<SneakerPair>>(
    `/sneakers/${sneakerId}/`,
    data,
  );

  return response.data.data;
}

export async function getSneakerDeletionPreview(
  sneakerId: string,
): Promise<PairDeletionPreview> {
  const response = await api.get<ApiResponse<PairDeletionPreview>>(
    `/sneakers/${sneakerId}/deletion-preview/`,
  );

  return response.data.data;
}

export async function deleteSneaker(
  sneakerId: string,
): Promise<DeletePairResponse> {
  const response = await api.delete<ApiResponse<DeletePairResponse>>(
    `/sneakers/${sneakerId}/`,
  );

  return response.data.data;
}

/* ============================================================
   REPLACE PAIR IMAGES
   ============================================================ */

export interface ImageReplacementUpload {
  angle: string;
  file_size: number;
  content_type: string;
  original_filename?: string;
}

export interface ImageReplacementResult {
  replaced: Array<{ image_id: string; angle: string }>;
  failed: Array<{ image_id: string; error: string }>;
}

/* Current images stay in place until completeImageReplacement. */
export async function startImageReplacement(
  sneakerId: string,
  uploads: ImageReplacementUpload[],
): Promise<PairUploadSlot[]> {
  const response = await api.post<
    ApiResponse<{ upload_slots: PairUploadSlot[] }>
  >(`/sneakers/${sneakerId}/image-replacements/`, { uploads });

  return response.data.data.upload_slots;
}

export async function completeImageReplacement(
  sneakerId: string,
  imageIds: string[],
): Promise<ImageReplacementResult> {
  const response = await api.post<ApiResponse<ImageReplacementResult>>(
    `/sneakers/${sneakerId}/image-replacements/complete/`,
    { image_ids: imageIds },
  );

  return response.data.data;
}

/* ============================================================
   VERIFICATION
   ============================================================ */

export interface VerifiedMaterial {
  /* SneakerMaterial.MaterialType value. */
  material_type: string;
  /* Region of the shoe, e.g. "upper" or "outsole". */
  location: string;
}

/*
 * Matches SneakerVerificationSerializer. Condition must be one of the
 * five grades; materials replace the pair's human-entered ones.
 */
export interface SneakerVerificationPayload {
  brand: string;
  model: string;
  sku: string;
  size: string;
  colorway: string;
  condition: string;
  materials: VerifiedMaterial[];
}

/** The pair's most recent AI identification job, or null if none. */
export async function getLatestAiJob(
  sneakerId: string,
): Promise<AIIdentificationJob | null> {
  const response = await api.get<ApiResponse<AIIdentificationJob[]>>(
    "/ai-identification-jobs/",
    {
      params: {
        sneaker_pair: sneakerId,
        ordering: "-created_at",
        page_size: 1,
      },
    },
  );

  return response.data.data[0] ?? null;
}

export async function getVerificationEligibility(
  sneakerId: string,
): Promise<VerificationEligibility> {
  const response = await api.get<ApiResponse<VerificationEligibility>>(
    `/sneakers/${sneakerId}/verification-eligibility/`,
  );

  return response.data.data;
}

/** Saves the verified values and moves the pair to "verified". */
export async function completeVerification(
  sneakerId: string,
  data: SneakerVerificationPayload,
): Promise<SneakerPair> {
  const response = await api.post<ApiResponse<SneakerPair>>(
    `/sneakers/${sneakerId}/complete/`,
    data,
  );

  return response.data.data;
}

/** Received → identification. */
export async function startIdentification(
  sneakerId: string,
): Promise<SneakerPair> {
  const response = await api.post<ApiResponse<SneakerPair>>(
    `/sneakers/${sneakerId}/start-identification/`,
  );

  return response.data.data;
}

/* Matches SneakerIdentificationSerializer. */
export type SneakerIdentificationPayload = Pick<
  SneakerVerificationPayload,
  "brand" | "model" | "sku" | "size"
>;

/**
 * Records a manual identification and moves the pair from
 * identification → verification.
 */
export async function identifySneaker(
  sneakerId: string,
  data: SneakerIdentificationPayload,
): Promise<SneakerPair> {
  const response = await api.post<ApiResponse<SneakerPair>>(
    `/sneakers/${sneakerId}/identify/`,
    data,
  );

  return response.data.data;
}

/* ============================================================
   FOOTWEAR DATA CAPTURE ANALYSIS
   ============================================================ */

/**
 * The pair's current result: its latest finished real run (never a test
 * run or one in progress), or null if it has none.
 */
export async function getLatestAnalysisRun(
  sneakerId: string,
): Promise<AnalysisRun | null> {
  const response = await api.get<ApiResponse<AnalysisRun[]>>(
    "/analysis-runs/",
    {
      params: {
        sneaker_pair: sneakerId,
        ordering: "-finished_at",
        page_size: 1,
      },
    },
  );

  return response.data.data[0] ?? null;
}

export interface ReviewQueueResponse {
  results: ReviewQueueRow[];
  meta: SneakersMeta;
}

/** Unverified pairs whose latest run has a key field below 0.8, oldest first. */
export async function getReviewQueue(
  page = 1,
  pageSize = 25,
): Promise<ReviewQueueResponse> {
  const response = await api.get<
    ApiResponse<ReviewQueueRow[]> & { meta: SneakersMeta }
  >("/analysis-runs/review-queue/", {
    params: { page, page_size: pageSize },
  });

  return { results: response.data.data, meta: response.data.meta };
}

export async function getReviewQueueNeighbors(
  sneakerId: string,
): Promise<ReviewQueueNeighbors> {
  const response = await api.get<ApiResponse<ReviewQueueNeighbors>>(
    "/analysis-runs/review-queue/neighbors/",
    { params: { sneaker_pair: sneakerId } },
  );

  return response.data.data;
}

/* ============================================================
   PIPELINE MONITOR (staff only)
   ============================================================ */

export interface MonitorParams {
  /* YYYY-MM-DD, inclusive. Defaults to the last 7 days. */
  from?: string;
  to?: string;
  prompt_version?: string;
  model?: string;
}

export type FunnelStep =
  | "created"
  | "complete"
  | "analyzed"
  | "needs_review"
  | "verified";

export interface DayCount {
  day: string;
  count: number;
}

export interface MonitorRunRow {
  run_id: string;
  sneaker_pair: string;
  sneaker_pair_id: string;
  prompt_version: string;
  model_name: string;
  vlm_used: boolean;
  is_test: boolean;
  status: string;
  duration_ms: number | null;
  created_at: string;
}

export interface MonitorFailure {
  kind: "job_failed" | "vision_failed";
  job_id: string | null;
  run_id: string | null;
  sneaker_pair: string;
  sneaker_pair_id: string;
  error: string;
  at: string;
}

/* Matches apps.ai.monitoring.overview. Rates are 0-1 or null. */
export interface PipelineOverview {
  range: { from: string; to: string };
  filters: { prompt_versions: string[]; models: string[] };
  funnel: Array<{ step: FunnelStep; count: number; rate: number | null }>;
  run_health: {
    jobs_by_status: Record<"queued" | "processing" | "completed" | "failed", number>;
    runs: number;
    runs_per_day: DayCount[];
    avg_duration_ms: number | null;
    p95_duration_ms: number | null;
    vision_failed: number;
    vision_failure_rate: number | null;
    vision_disabled: number;
    /* Test runs in the range; every other run metric excludes them. */
    test_runs: number;
    oldest_queued_age_seconds: number | null;
    queue_stuck: boolean;
    recent_failures: MonitorFailure[];
    recent_runs: MonitorRunRow[];
  };
  stages: {
    runs: number;
    qc: {
      pass_rate: number | null;
      per_view: Array<{ view: string; runs: number; pass_rate: number | null }>;
      top_issues: Array<{ issue: string; count: number }>;
    };
    barcode_rate: number | null;
    sku_found_rate: number | null;
    sku_sources: Record<"barcode" | "ocr" | "ai", { count: number; rate: number | null }>;
    catalog_hit_rate: number | null;
    size_found_rate: number | null;
    size_consistent_rate: number | null;
    fields: Array<{
      field: string;
      avg_confidence: number | null;
      below_threshold_rate: number | null;
    }>;
  };
  review: {
    queue_size: number;
    oldest_unverified_age_seconds: number | null;
    verified_per_day: DayCount[];
    verified_per_reviewer: Array<{ reviewer: string; count: number }>;
    changed_by_field: Array<{
      prompt_version: string;
      field: string;
      reviewed: number;
      changed: number;
      changed_rate: number | null;
    }>;
  };
  catalog: { total: number; added_per_week: Array<{ week: string; count: number }> };
  generated_at: string;
}

export interface FunnelPair {
  id: string;
  pair_id: string;
  brand: string;
  model: string;
  status: string;
  created_at: string;
}

export interface RunStage {
  stage: "download" | "quality_check" | "label_reader" | "vision_model" | "fusion" | string;
  status: "ok" | "warning" | "failed" | "skipped";
  duration_ms: number;
  output: Record<string, unknown>;
}

export interface PipelineRunDetail extends AnalysisRun {
  debug: {
    stages?: RunStage[];
    sku_trace?: string[];
    label?: Record<string, unknown>;
    catalog_row?: Record<string, string> | null;
    [key: string]: unknown;
  };
  raw_response: Record<string, unknown> | null;
  job_status: string | null;
  status: PipelineRunStatus;
  is_test: boolean;
  notes: string[];
  /* Saved per-stage results; empty for runs before the stage runner. */
  stages: PipelineStage[];
  qc_ok: boolean;
  barcode_decoded: boolean;
  sku_source: "barcode" | "ocr" | "ai" | "none";
  catalog_hit: boolean;
  size_found: boolean;
  size_consistent: boolean;
}

function monitorQuery(params: MonitorParams) {
  return Object.fromEntries(
    Object.entries(params).filter(([, value]) => value),
  );
}

export async function getPipelineOverview(
  params: MonitorParams,
): Promise<PipelineOverview> {
  const response = await api.get<ApiResponse<PipelineOverview>>(
    "/pipeline-monitor/",
    { params: monitorQuery(params) },
  );
  return response.data.data;
}

export async function getFunnelPairs(
  step: FunnelStep,
  params: MonitorParams,
  page = 1,
): Promise<{ results: FunnelPair[]; meta: SneakersMeta }> {
  const response = await api.get<ApiResponse<FunnelPair[]> & { meta: SneakersMeta }>(
    `/pipeline-monitor/funnel/${step}/`,
    { params: { ...monitorQuery(params), page, page_size: 25 } },
  );
  return { results: response.data.data, meta: response.data.meta };
}

export async function getPipelineRun(runId: string): Promise<PipelineRunDetail> {
  const response = await api.get<ApiResponse<PipelineRunDetail>>(
    `/pipeline-monitor/runs/${runId}/`,
  );
  return response.data.data;
}

/** Queue a fresh analysis of a pair. Rejects if one is already pending. */
export async function rerunAnalysis(sneakerPairId: string): Promise<void> {
  await api.post("/pipeline-monitor/rerun/", { sneaker_pair: sneakerPairId });
}

/* ============================================================
   STAGE-BY-STAGE PIPELINE RUNNER (staff only)
   ============================================================ */

export type PipelineStageStatus =
  | "waiting"
  | "running"
  | "done"
  | "failed"
  | "skipped"
  | "reused";

export type PipelineRunStatus =
  | "queued"
  | "running"
  | "waiting"
  | "stopped"
  | "completed"
  | "failed";

export type PipelineMode = "all" | "to" | "from" | "step";

export interface PipelineOverrides {
  provider?: string;
  model?: string;
  prompt_version?: string;
  ocr_backend?: string;
}

/* Matches PipelineRunViewSet.options. */
export interface PipelineOptions {
  stages: Array<{ stage: number; name: string }>;
  providers: Array<{ name: string; default_model: string; is_default: boolean }>;
  prompt_versions: string[];
  default_prompt_version: string;
  ocr_backends: string[];
}

/* Matches PipelineStageResultSerializer. */
export interface PipelineStage {
  stage: number;
  name: string;
  status: PipelineStageStatus;
  summary: string;
  output: Record<string, unknown> | null;
  error: string;
  duration_ms: number | null;
  started_at: string | null;
  finished_at: string | null;
  reused_from_run: string | null;
}

/* Matches PipelineRunSerializer. */
export interface PipelineRunState {
  id: string;
  sneaker_pair: string;
  sneaker_pair_id: string;
  status: PipelineRunStatus;
  mode: PipelineMode;
  from_stage: number;
  to_stage: number;
  source_run: string | null;
  is_test: boolean;
  overrides: PipelineOverrides;
  prompt_version: string;
  provider: string;
  model_name: string;
  notes: string[];
  error: string;
  requested_by: string | null;
  result: AnalysisRun["result"] | null;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
  duration_ms: number | null;
  stages: PipelineStage[];
  /* The pair's current result, for comparison. */
  current: {
    run_id: string;
    is_this_run: boolean;
    prompt_version: string;
    model_name: string;
    finished_at: string | null;
    result: AnalysisRun["result"];
  } | null;
}

/* Matches PipelineRunListSerializer. */
export interface PipelineRunSummary {
  id: string;
  status: PipelineRunStatus;
  mode: PipelineMode;
  is_test: boolean;
  prompt_version: string;
  model_name: string;
  created_at: string;
  finished_at: string | null;
  stage_statuses: Record<string, PipelineStageStatus>;
}

export interface StartPipelineRun {
  sneaker_pair: string;
  mode: PipelineMode;
  stage?: number;
  source_run?: string;
  is_test?: boolean;
  overrides?: PipelineOverrides;
}

export async function getPipelineOptions(): Promise<PipelineOptions> {
  const response = await api.get<ApiResponse<PipelineOptions>>("/pipeline-runs/options/");
  return response.data.data;
}

export async function listPipelineRuns(sneakerId: string): Promise<PipelineRunSummary[]> {
  const response = await api.get<ApiResponse<PipelineRunSummary[]>>("/pipeline-runs/", {
    params: { sneaker_pair: sneakerId },
  });
  return response.data.data;
}

export async function startPipelineRun(payload: StartPipelineRun): Promise<PipelineRunState> {
  const response = await api.post<ApiResponse<PipelineRunState>>("/pipeline-runs/", payload);
  return response.data.data;
}

export async function getPipelineRunState(runId: string): Promise<PipelineRunState> {
  const response = await api.get<ApiResponse<PipelineRunState>>(`/pipeline-runs/${runId}/`);
  return response.data.data;
}

/** Step mode: run the next stage. */
export async function nextPipelineStep(runId: string): Promise<PipelineRunState> {
  const response = await api.post<ApiResponse<PipelineRunState>>(`/pipeline-runs/${runId}/next/`);
  return response.data.data;
}

/** Make a finished test run the pair's current result. */
export async function promotePipelineRun(runId: string): Promise<PipelineRunState> {
  const response = await api.post<ApiResponse<PipelineRunState>>(`/pipeline-runs/${runId}/promote/`);
  return response.data.data;
}

