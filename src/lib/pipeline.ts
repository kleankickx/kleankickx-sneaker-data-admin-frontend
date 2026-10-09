/* Helpers for the stage-by-stage pipeline runner. */

import type {
  PipelineRunState,
  PipelineRunStatus,
  PipelineStageStatus,
} from "./api";
import type { AnalysisResult, SneakerPair } from "./types";

/* What each stage does, for the flow graph and inspector. */
export const STAGE_META: Record<number, { icon: string; short: string; about: string }> = {
  1: {
    icon: "photo_library",
    short: "Photos",
    about: "Downloads the original photos of each angle from storage.",
  },
  2: {
    icon: "high_quality",
    short: "Quality",
    about: "Checks every photo for sharpness, exposure, background and cropping.",
  },
  3: {
    icon: "barcode_scanner",
    short: "Label",
    about: "Reads the size label: barcode, style code (SKU) and US/UK/EUR sizes.",
  },
  4: {
    icon: "menu_book",
    short: "Catalog",
    about: "Looks the barcode and SKU candidates up in the Kleankickx catalog.",
  },
  5: {
    icon: "visibility",
    short: "Vision",
    about: "Sends the photos to the vision model for brand, model, condition and materials.",
  },
  6: {
    icon: "merge",
    short: "Fusion",
    about: "Combines every source into the output schema and validates it.",
  },
  7: {
    icon: "move_to_inbox",
    short: "Route",
    about: "Saves the result and sends it to the review queue if a key field is below 0.8.",
  },
};

/* The pipeline's view names -> our capture angles. */
export const ANGLE_FOR_VIEW: Record<string, string> = {
  lateral: "left",
  medial: "right",
  overview: "overview",
  top: "top",
  sole: "sole",
  label: "label",
};

export const ANGLE_TITLES: Record<string, string> = {
  overview: "Overview",
  left: "Left side",
  right: "Right side",
  top: "Top",
  sole: "Sole",
  label: "Label",
};

/* Our angle -> display URL of the pair's newest uploaded photo. */
export function photoUrls(pair: SneakerPair | null | undefined): Record<string, string> {
  const images = (pair?.capture_sessions ?? [])
    .flatMap((session) => session.images ?? [])
    .filter((image) => image.status.toLowerCase() === "uploaded" && image.image_url)
    .sort((a, b) => a.created_at.localeCompare(b.created_at));
  const urls: Record<string, string> = {};
  for (const image of images) urls[image.angle] = image.image_url as string;
  return urls;
}

export const STAGE_STATUS: Record<
  PipelineStageStatus,
  { label: string; icon: string; dot: string; text: string }
> = {
  waiting: { label: "Waiting", icon: "schedule", dot: "bg-gray-300", text: "text-gray-500" },
  running: { label: "Running", icon: "progress_activity", dot: "bg-sky-600", text: "text-sky-700" },
  done: { label: "Done", icon: "check", dot: "bg-emerald-600", text: "text-emerald-700" },
  failed: { label: "Failed", icon: "close", dot: "bg-red-600", text: "text-red-700" },
  skipped: { label: "Skipped", icon: "remove", dot: "bg-gray-400", text: "text-gray-500" },
  reused: { label: "Reused", icon: "history", dot: "bg-violet-600", text: "text-violet-700" },
};

export const RUN_STATUS_LABEL: Record<PipelineRunStatus, string> = {
  queued: "Queued",
  running: "Running",
  waiting: "Waiting for next step",
  stopped: "Stopped",
  completed: "Completed",
  failed: "Failed",
};

/* Statuses the panel keeps polling through. */
export function isActive(status: PipelineRunStatus | undefined): boolean {
  return status === "queued" || status === "running";
}

export const RESULT_FIELDS = ["brand", "model", "sku", "size", "colorway", "condition"] as const;

export interface FieldDiff {
  field: (typeof RESULT_FIELDS)[number];
  next: { value: string | null; confidence: number };
  current: { value: string | null; confidence: number } | null;
  changed: boolean;
}

function same(a: string | null | undefined, b: string | null | undefined) {
  return (a ?? "").trim().toLowerCase() === (b ?? "").trim().toLowerCase();
}

/** Field-by-field comparison of a new result with the current one. */
export function diffResults(
  next: AnalysisResult,
  current: AnalysisResult | null | undefined,
): FieldDiff[] {
  return RESULT_FIELDS.map((field) => {
    const n = next[field];
    const c = current?.[field] ?? null;
    return {
      field,
      next: { value: n.value, confidence: n.confidence },
      current: c ? { value: c.value, confidence: c.confidence } : null,
      changed: !c || !same(n.value, c.value),
    };
  });
}

/** The fused result once stage 6 has run (before it is saved). */
export function fusedResult(run: PipelineRunState): AnalysisResult | null {
  const fusion = run.stages.find((s) => s.stage === 6);
  const output = fusion?.output as { result?: AnalysisResult } | null | undefined;
  return run.result ?? output?.result ?? null;
}
