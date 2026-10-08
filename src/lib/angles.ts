/*
 * Capture angles. Values match CaptureImage.Angle and
 * CaptureSession.REQUIRED_ANGLES on the backend. Every view is of the
 * LEFT shoe of the pair.
 */

export const REQUIRED_ANGLES = [
  "lateral",
  "medial",
  "front",
  "label",
  "top",
  "sole",
] as const;

export type Angle = (typeof REQUIRED_ANGLES)[number];

/* Optional extra view; it never counts as front. */
export const OVERVIEW = "overview";

/* Angles a photo can be replaced at. */
export const REPLACEABLE_ANGLES = [...REQUIRED_ANGLES, OVERVIEW] as const;

export type ReplaceableAngle = (typeof REPLACEABLE_ANGLES)[number];

/*
 * Older captures stored the sides of the left shoe as left/right; the
 * backend renames them with migrate_side_angles.
 */
export const LEGACY_SIDE_ANGLES: Record<string, Angle> = {
  left: "lateral",
  right: "medial",
};

export const ANGLE_LABELS: Record<ReplaceableAngle, string> = {
  lateral: "Lateral side",
  medial: "Medial side",
  front: "Front",
  label: "Label / tag",
  top: "Top",
  sole: "Sole",
  overview: "Overview",
};

export const ANGLE_HINTS: Record<ReplaceableAngle, string> = {
  lateral: "Left shoe, outer side: toe left, heel right",
  medial: "Left shoe, inner side: toe right, heel left",
  front: "Toe box, tongue and laces",
  label: "Size tag: US/UK/EUR and barcode",
  top: "Straight down: insole, tongue, laces",
  sole: "Outsole and tread pattern",
  overview: "Optional extra view of the whole shoe",
};
