/*
 * Helpers for the pair verification workspace. Everything here only
 * reshapes what the backend returned; nothing is invented.
 */

import type {
  AIIdentificationJob,
  CaptureImage,
  SneakerIdentification,
  SneakerPair,
  VerificationEligibility,
} from "./types";

/*
 * CaptureSession.REQUIRED_ANGLES on the backend, in the order a
 * verifier walks around the shoe.
 */
export const CAPTURE_ANGLES = [
  { angle: "overview", label: "Overview" },
  { angle: "left", label: "Left side" },
  { angle: "right", label: "Right side" },
  { angle: "top", label: "Top" },
  { angle: "sole", label: "Sole" },
  { angle: "label", label: "Label" },
] as const;

export interface AngleSlot {
  angle: string;
  label: string;
  /* The uploaded image for this angle, or null when it is missing. */
  image: CaptureImage | null;
}

export function formatAngle(angle: string): string {
  const known = CAPTURE_ANGLES.find((slot) => slot.angle === angle);
  if (known) return known.label;
  if (!angle) return "Unknown";

  return angle
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

/**
 * One slot per required angle holding its newest uploaded image (a
 * replaced photo may briefly sit next to the old one), followed by any
 * uploaded images of other angles.
 */
export function angleSlots(pair: SneakerPair): AngleSlot[] {
  const uploaded = (pair.capture_sessions ?? [])
    .flatMap((session) => session.images ?? [])
    .filter((image) => image.status.toLowerCase() === "uploaded")
    .sort((a, b) => b.created_at.localeCompare(a.created_at));

  const slots: AngleSlot[] = CAPTURE_ANGLES.map(({ angle, label }) => ({
    angle,
    label,
    image: uploaded.find((image) => image.angle === angle) ?? null,
  }));

  const required = new Set<string>(CAPTURE_ANGLES.map((s) => s.angle));
  const extras = uploaded
    .filter((image) => !required.has(image.angle))
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

export type AiAnalysis =
  | { kind: "loading" }
  | { kind: "error" }
  | { kind: "not_requested" }
  | { kind: "pending"; status: "queued" | "processing" }
  | { kind: "failed" }
  | { kind: "no_result" }
  | { kind: "ready"; identification: SneakerIdentification };

/** What the AI section should show, from the pair's latest AI job. */
export function aiAnalysisFrom(
  job: AIIdentificationJob | null | undefined,
  { loading, error }: { loading: boolean; error: boolean },
): AiAnalysis {
  if (loading) return { kind: "loading" };
  if (error) return { kind: "error" };
  if (!job) return { kind: "not_requested" };

  switch (job.status) {
    case "queued":
    case "processing":
      return { kind: "pending", status: job.status };
    case "failed":
      return { kind: "failed" };
    case "completed":
      return job.identification
        ? { kind: "ready", identification: job.identification }
        : { kind: "no_result" };
    default:
      return { kind: "not_requested" };
  }
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
