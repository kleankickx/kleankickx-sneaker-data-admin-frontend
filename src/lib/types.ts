export interface ApiResponse<T> {
  success: boolean;
  data: T;
  message?: string;
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };
}

export interface Batch {
  id: string;
  batch_id?: string;
  name: string;
  source: string;
  expected_quantity: number;
  status: string;
  received_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface SneakerPair {
  id: string;
  pair_id?: string;
  pair_number?: number;
  batch: string;
  batch_id?: string;

  brand: string | null;
  model: string | null;
  sku: string | null;
  size: string | null;
  condition: string | null;
  status: string;

  materials?: SneakerMaterial[];
  capture_sessions?: CaptureSession[];

  verified_at?: string | null;
  created_at: string;
  updated_at: string;
}


export interface CaptureImage {
  id: string;
  idempotency_key: string;
  angle: string;
  content_type: string;
  status: string;
  storage_key: string;
  image_url: string | null;
  original_filename: string;
  captured_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface CaptureSession {
  id: string;
  is_ready: boolean;
  images: CaptureImage[];
  created_at: string;
  updated_at: string;
}

export interface SneakerMaterial {
  id: string;
  sneaker_pair: string;
  material_type: string;
  location: string;
  percentage: string | null;
  confidence: string | null;
  source: string;
  created_at: string;
  updated_at: string;
}




/* Matches SneakerIdentificationResultSerializer. */
export interface SneakerIdentification {
  id: string;
  sneaker_pair: string;
  brand: string;
  model: string;
  sku: string;
  size: string;
  /* "ai" for AI results, "manual" for operator identifications. */
  source: string;
  /* Decimal 0–1 as a string, e.g. "0.9400". */
  confidence: string | null;
  created_at: string;
  updated_at: string;
}

/* Matches AIIdentificationJobSerializer. */
export interface AIIdentificationJob {
  id: string;
  sneaker_pair_id: string;
  celery_task_id: string;
  status: "queued" | "processing" | "completed" | "failed";
  identification: SneakerIdentification | null;
  error_message: string;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

/* Matches SneakerPairViewSet.verification_eligibility. */
export interface VerificationEligibility {
  sneaker_pair_id: string;
  eligible: boolean;
  checks: {
    status_ready: boolean;
    has_identification: boolean;
    has_ready_capture: boolean;
  };
  reasons: string[];
}
