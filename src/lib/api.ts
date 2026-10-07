import axios from "axios";
import type {
  ApiResponse,
  Batch,
  CaptureImage,
  SneakerPair,
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

      refreshPromise = refreshPromise ?? refreshSession();
      const refreshed = await refreshPromise;
      refreshPromise = null;

      if (refreshed) {
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
