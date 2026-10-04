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




