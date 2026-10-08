import { describe, expect, it } from "vitest";

import type {
  AIIdentificationJob,
  AnalysisRun,
  CaptureImage,
  SneakerPair,
  VerificationEligibility,
} from "./types";
import {
  type AiAnalysis,
  aiAnalysisFrom,
  angleSlots,
  formatConfidence,
  verificationBlockers,
} from "./verification";

function image(
  angle: string,
  overrides: Partial<CaptureImage> = {},
): CaptureImage {
  return {
    id: `${angle}-id`,
    idempotency_key: `${angle}-key`,
    angle,
    content_type: "image/jpeg",
    status: "uploaded",
    storage_key: `pairs/${angle}.jpg`,
    image_url: `https://img.test/${angle}.jpg`,
    original_filename: `${angle}.jpg`,
    captured_at: null,
    created_at: "2026-10-07T10:00:00Z",
    updated_at: "2026-10-07T10:00:00Z",
    ...overrides,
  };
}

function pairWith(images: CaptureImage[], status = "verification"): SneakerPair {
  return {
    id: "pair-uuid",
    pair_id: "KKX-PAIR-00000042",
    batch: "batch-uuid",
    brand: "Nike",
    model: "Air Max 95",
    sku: "",
    size: "42",
    condition: "b",
    status,
    capture_sessions: [
      {
        id: "session",
        is_ready: false,
        images,
        created_at: "2026-10-07T10:00:00Z",
        updated_at: "2026-10-07T10:00:00Z",
      },
    ],
    created_at: "2026-10-07T10:00:00Z",
    updated_at: "2026-10-07T10:00:00Z",
  };
}

function job(overrides: Partial<AIIdentificationJob>): AIIdentificationJob {
  return {
    id: "job",
    sneaker_pair_id: "KKX-PAIR-00000042",
    celery_task_id: "task",
    status: "queued",
    identification: null,
    error_message: "",
    started_at: null,
    completed_at: null,
    created_at: "2026-10-07T10:00:00Z",
    updated_at: "2026-10-07T10:00:00Z",
    ...overrides,
  };
}

const settled = { loading: false, error: false };

describe("angleSlots", () => {
  it("gives every spec angle a slot, in order, with gaps for missing ones", () => {
    const slots = angleSlots(pairWith([image("sole"), image("front")]));

    expect(slots.map((s) => s.angle)).toEqual([
      "lateral",
      "medial",
      "front",
      "label",
      "top",
      "sole",
    ]);
    expect(slots[2].image?.id).toBe("front-id");
    expect(slots[0].image).toBeNull();
    expect(slots[5].image?.id).toBe("sole-id");
  });

  it("fills the side slots from legacy left/right photos; overview is extra", () => {
    const slots = angleSlots(
      pairWith([image("left"), image("right"), image("overview")]),
    );

    expect(slots[0]).toMatchObject({ angle: "lateral", label: "Lateral side" });
    expect(slots[0].image?.id).toBe("left-id");
    expect(slots[1].image?.id).toBe("right-id");
    expect(slots).toHaveLength(7);
    expect(slots[6]).toMatchObject({ angle: "overview", label: "Overview" });
  });

  it("ignores images that never finished uploading", () => {
    const slots = angleSlots(
      pairWith([image("top", { status: "uploading", image_url: null })]),
    );

    expect(slots.every((s) => s.image === null)).toBe(true);
  });

  it("shows the newest photo when an angle has two", () => {
    const slots = angleSlots(
      pairWith([
        image("top", { id: "old" }),
        image("top", { id: "new", created_at: "2026-10-08T10:00:00Z" }),
      ]),
    );

    expect(slots.find((s) => s.angle === "top")?.image?.id).toBe("new");
  });

  it("appends photos of other angles after the required ones", () => {
    const slots = angleSlots(pairWith([image("other")]));

    expect(slots).toHaveLength(7);
    expect(slots[6]).toMatchObject({ angle: "other", label: "Other" });
  });
});

describe("formatConfidence", () => {
  it("formats the backend's 0–1 decimal string as a percentage", () => {
    expect(formatConfidence("0.9400")).toBe("94%");
    expect(formatConfidence("0.8650")).toBe("87%");
    expect(formatConfidence("1.0000")).toBe("100%");
  });

  it("returns null when there is no usable value", () => {
    expect(formatConfidence(null)).toBeNull();
    expect(formatConfidence("")).toBeNull();
    expect(formatConfidence("n/a")).toBeNull();
  });
});

describe("aiAnalysisFrom", () => {
  const identification = {
    id: "ident",
    sneaker_pair: "pair-uuid",
    brand: "Nike",
    model: "Air Max 90",
    sku: "",
    size: "",
    source: "ai",
    confidence: "0.8700",
    created_at: "2026-10-07T10:00:00Z",
    updated_at: "2026-10-07T10:00:00Z",
  };

  const field = (value: string | null, confidence = 0.9) => ({
    value,
    confidence,
    evidence: "seen",
  });

  const run: AnalysisRun = {
    id: "run",
    sneaker_pair: "pair-uuid",
    sneaker_pair_id: "KKX-PAIR-00000042",
    result: {
      brand: field("Nike"),
      model: field("Air Max 95"),
      sku: field(null, 0),
      size: field("US 10"),
      colorway: field("white/black", 0.6),
      condition: field("Good", 0.7),
      materials: [],
      visible_text: [],
      candidate_matches: [],
      overall_assessment: "",
      limitations: [],
    },
    regions: [{ material_type: "suede", location: "overlays" }],
    prompt_version: "fdc-v1",
    provider: "openai",
    model_name: "m",
    vlm_used: true,
    vlm_error: "",
    duration_ms: 1,
    created_at: "2026-10-07T10:00:00Z",
  };

  it("reports loading and error before anything else", () => {
    expect(aiAnalysisFrom(null, run, { loading: true, error: false }).kind).toBe(
      "loading",
    );
    expect(aiAnalysisFrom(null, run, { loading: false, error: true }).kind).toBe(
      "error",
    );
  });

  it("is not_requested when there is no job and no run", () => {
    expect(aiAnalysisFrom(null, null, settled)).toEqual({ kind: "not_requested" });
  });

  it("is pending while a newer analysis is queued or processing", () => {
    expect(aiAnalysisFrom(job({ status: "processing" }), run, settled)).toEqual({
      kind: "pending",
      status: "processing",
    });
  });

  it("shows the latest run, with its regions", () => {
    const analysis = aiAnalysisFrom(job({ status: "completed" }), run, settled);

    expect(analysis).toEqual({
      kind: "ready",
      suggestion: { result: run.result, regions: run.regions, run },
    });
  });

  it("is failed for a failed job, and no_result for an empty completed one", () => {
    expect(aiAnalysisFrom(job({ status: "failed" }), null, settled).kind).toBe(
      "failed",
    );
    expect(aiAnalysisFrom(job({ status: "completed" }), null, settled).kind).toBe(
      "no_result",
    );
  });

  it("shows an earlier identification in the same shape", () => {
    const analysis = aiAnalysisFrom(
      job({ status: "completed", identification }),
      null,
      settled,
    );

    expect(analysis.kind).toBe("ready");
    const { result, run: none } = (
      analysis as Extract<AiAnalysis, { kind: "ready" }>
    ).suggestion;
    expect(none).toBeNull();
    expect(result.brand).toMatchObject({ value: "Nike", confidence: 0.87 });
    expect(result.sku).toMatchObject({ value: null, confidence: 0 });
    expect(result.condition.value).toBeNull();
  });
});

describe("verificationBlockers", () => {
  const eligibility = (
    overrides: Partial<VerificationEligibility>,
  ): VerificationEligibility => ({
    sneaker_pair_id: "KKX-PAIR-00000042",
    eligible: true,
    checks: {
      status_ready: true,
      has_identification: true,
      has_ready_capture: true,
    },
    reasons: [],
    ...overrides,
  });

  it("uses the backend's reasons when the pair isn't eligible", () => {
    const reasons = ["Sneaker pair must have an identification result."];

    expect(
      verificationBlockers(
        pairWith([]),
        eligibility({ eligible: false, reasons }),
      ),
    ).toEqual(reasons);
  });

  it("allows verification when the backend says the pair is eligible", () => {
    expect(verificationBlockers(pairWith([]), eligibility({}))).toEqual([]);
  });

  it("blocks pairs that are already verified", () => {
    expect(verificationBlockers(pairWith([], "verified"), null)).toEqual([
      "This pair is already verified.",
    ]);
  });

  it("falls back to the status rule when eligibility couldn't load", () => {
    expect(verificationBlockers(pairWith([], "verification"), null)).toEqual(
      [],
    );
    expect(verificationBlockers(pairWith([], "received"), null)).toEqual([
      "Only pairs in verification can be verified.",
    ]);
  });
});
