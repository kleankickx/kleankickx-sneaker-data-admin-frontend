/*
 * Helpers for the pair verification workspace. Everything here only
 * reshapes what the backend returned; nothing is invented.
 */

import {
  ANGLE_LABELS,
  LEGACY_SIDE_ANGLES,
  REQUIRED_ANGLES,
} from "./angles";
import type {
  AIIdentificationJob,
  AnalysisResult,
  AnalysisRun,
  CaptureImage,
  SneakerIdentification,
  SneakerPair,
  VerificationEligibility,
} from "./types";

/*
 * CaptureSession.REQUIRED_ANGLES on the backend: the spec's six views of
 * the LEFT shoe.
 */
export const CAPTURE_ANGLES = REQUIRED_ANGLES.map((angle) => ({
  angle,
  label: ANGLE_LABELS[angle],
}));

export interface AngleSlot {
  angle: string;
  label: string;
  /* The uploaded image for this angle, or null when it is missing. */
  image: CaptureImage | null;
}

export function formatAngle(angle: string): string {
  const known = ANGLE_LABELS[angle as keyof typeof ANGLE_LABELS];
  if (known) return known;
  if (!angle) return "Unknown";

  return angle
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

/* The spec angle a stored angle counts as (legacy left/right -> sides). */
function specAngle(angle: string): string {
  return LEGACY_SIDE_ANGLES[angle] ?? angle;
}

/**
 * One slot per required angle holding its newest uploaded image (a
 * replaced photo may briefly sit next to the old one), followed by any
 * uploaded images of other angles, such as overview. Photos stored under
 * the legacy names left/right fill the lateral/medial slots.
 */
export function angleSlots(pair: SneakerPair): AngleSlot[] {
  const uploaded = (pair.capture_sessions ?? [])
    .flatMap((session) => session.images ?? [])
    .filter((image) => image.status.toLowerCase() === "uploaded")
    .sort((a, b) => b.created_at.localeCompare(a.created_at));

  const slots: AngleSlot[] = CAPTURE_ANGLES.map(({ angle, label }) => ({
    angle,
    label,
    image:
      uploaded.find((image) => image.angle === angle) ??
      uploaded.find((image) => specAngle(image.angle) === angle) ??
      null,
  }));

  const required = new Set<string>(CAPTURE_ANGLES.map((s) => s.angle));
  const extras = uploaded
    .filter((image) => !required.has(specAngle(image.angle)))
    .reverse()
    .map((image) => ({
      angle: image.angle,
      label: formatAngle(image.angle),
      image,
    }));

  return [...slots, ...extras];
}

/** "0.9400" → "94%"; null for a missing or unreadable value. */
export function formatConfidence(
  confidence: string | null | undefined,
): string | null {
  if (confidence === null || confidence === undefined || confidence === "") {
    return null;
  }

  const value = Number(confidence);
  if (!Number.isFinite(value)) return null;

  return `${Math.round(Math.min(Math.max(value, 0), 1) * 100)}%`;
}

/* The output-schema fields that hold one value each. */
export const ANALYSIS_FIELDS = [
  "brand",
  "model",
  "sku",
  "size",
  "colorway",
  "condition",
] as const;

export type AnalysisFieldName = (typeof ANALYSIS_FIELDS)[number];

/* Below this, a field is flagged for a person (as in the review queue). */
export const REVIEW_THRESHOLD = 0.8;

export interface AiSuggestion {
  result: AnalysisResult;
  /* AI materials with their regions. */
  regions: Array<{ material_type: string; location: string }>;
  /* The run, or null for an earlier brand/model/SKU/size identification. */
  run: AnalysisRun | null;
}

export type AiAnalysis =
  | { kind: "loading" }
  | { kind: "error" }
  | { kind: "not_requested" }
  | { kind: "pending"; status: "queued" | "processing" }
  | { kind: "failed" }
  | { kind: "no_result" }
  | { kind: "ready"; suggestion: AiSuggestion };

/**
 * An identification from before the full analysis existed, in the
 * output schema's shape: brand/model/SKU/size with its one overall
 * confidence, nothing else.
 */
export function suggestionFromIdentification(
  identification: SneakerIdentification,
): AiSuggestion {
  const confidence = Number(identification.confidence ?? 0) || 0;
  const field = (value: string) => ({
    value: value || null,
    confidence: value ? confidence : 0,
    evidence: value ? "Earlier AI identification (overall confidence)" : "",
  });
  return {
    run: null,
    regions: [],
    result: {
      brand: field(identification.brand),
      model: field(identification.model),
      sku: field(identification.sku),
      size: field(identification.size),
      colorway: field(""),
      condition: field(""),
      materials: [],
      visible_text: [],
      candidate_matches: [],
      overall_assessment: "",
      limitations: [
        "Earlier AI identification: brand, model, SKU and size only.",
      ],
    },
  };
}

/**
 * What the AI section should show: the newest analysis run, unless a
 * newer analysis is still running; an earlier identification if that's
 * all there is.
 */
export function aiAnalysisFrom(
  job: AIIdentificationJob | null | undefined,
  run: AnalysisRun | null | undefined,
  { loading, error }: { loading: boolean; error: boolean },
): AiAnalysis {
  if (loading) return { kind: "loading" };
  if (error) return { kind: "error" };

  if (job && (job.status === "queued" || job.status === "processing")) {
    return { kind: "pending", status: job.status };
  }
  if (run) {
    return {
      kind: "ready",
      suggestion: { result: run.result, regions: run.regions, run },
    };
  }
  if (!job) return { kind: "not_requested" };
  if (job.status === "failed") return { kind: "failed" };
  if (job.status === "completed" && job.identification) {
    return {
      kind: "ready",
      suggestion: suggestionFromIdentification(job.identification),
    };
  }
  return job.status === "completed"
    ? { kind: "no_result" }
    : { kind: "not_requested" };
}

/** "0.87" -> "87%". */
export function percent(confidence: number): string {
  return `${Math.round(Math.min(Math.max(confidence, 0), 1) * 100)}%`;
}

/**
 * Why the pair can't be marked verified right now, or null if it can.
 * Uses the backend's eligibility check; if that couldn't be loaded,
 * falls back to the one rule the complete endpoint itself enforces.
 */
export function verificationBlockers(
  pair: SneakerPair,
  eligibility: VerificationEligibility | null,
): string[] {
  const status = pair.status.toLowerCase();

  if (status === "verified") return ["This pair is already verified."];
  if (eligibility) return eligibility.eligible ? [] : eligibility.reasons;

  return status === "verification"
    ? []
    : ["Only pairs in verification can be verified."];
}
