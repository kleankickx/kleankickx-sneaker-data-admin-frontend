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
  colorway?: string | null;
  condition: string | null;
  /* Grade on the retired A-D scale, kept as history; never mapped. */
  legacy_condition?: string;
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

/* One field of footwear_data_capture/fdc/output_schema.json. */
export interface AnalysisField {
  value: string | null;
  /* 0-1 */
  confidence: number;
  evidence: string;
}

/* The exact Footwear Data Capture output schema. */
export interface AnalysisResult {
  brand: AnalysisField;
  model: AnalysisField;
  sku: AnalysisField;
  size: AnalysisField;
  colorway: AnalysisField;
  /* Grade name, e.g. "Like New". */
  condition: AnalysisField;
  materials: Array<{ material: string; confidence: number; evidence: string }>;
  visible_text: string[];
  candidate_matches: Array<{
    brand: string | null;
    model: string | null;
    sku: string | null;
    confidence: number;
    reason: string;
  }>;
  overall_assessment: string;
  limitations: string[];
}

/* Matches AnalysisRunSerializer. */
export interface AnalysisRun {
  id: string;
  sneaker_pair: string;
  sneaker_pair_id: string;
  result: AnalysisResult;
  /* Each AI material with the region of the shoe it covers. */
  regions: Array<{ material_type: string; location: string }>;
  prompt_version: string;
  provider: string;
  model_name: string;
  vlm_used: boolean;
  vlm_error: string;
  duration_ms: number | null;
  created_at: string;
}

/* A row of GET /analysis-runs/review-queue/. */
export interface ReviewQueueRow {
  run_id: string;
  sneaker_pair: string;
  sneaker_pair_id: string;
  status: string;
  brand: string | null;
  model: string | null;
  low_fields: string[];
  created_at: string;
}

export interface ReviewQueueNeighbors {
  /* 1-based; null when the pair isn't in the queue. */
  position: number | null;
  total: number;
  previous: string | null;
  next: string | null;
}

