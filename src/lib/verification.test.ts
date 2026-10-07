import { describe, expect, it } from "vitest";

import type {
  AIIdentificationJob,
  CaptureImage,
  SneakerPair,
  VerificationEligibility,
} from "./types";
import {
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
  it("gives every required angle a slot, in order, with gaps for missing ones", () => {
    const slots = angleSlots(pairWith([image("sole"), image("overview")]));

    expect(slots.map((s) => s.angle)).toEqual([
      "overview",
      "left",
      "right",
      "top",
      "sole",
      "label",
    ]);
    expect(slots[0].image?.id).toBe("overview-id");
    expect(slots[1].image).toBeNull();
    expect(slots[4].image?.id).toBe("sole-id");
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
  it("reports loading and error before anything else", () => {
    expect(aiAnalysisFrom(null, { loading: true, error: false }).kind).toBe(
      "loading",
    );
    expect(aiAnalysisFrom(null, { loading: false, error: true }).kind).toBe(
      "error",
    );
  });

  it("is not_requested when the pair has no AI job", () => {
    expect(aiAnalysisFrom(null, settled)).toEqual({ kind: "not_requested" });
  });

  it("is pending while the job is queued or processing", () => {
    expect(aiAnalysisFrom(job({ status: "processing" }), settled)).toEqual({
      kind: "pending",
      status: "processing",
    });
  });

  it("is failed for a failed job, and no_result for an empty completed one", () => {
    expect(aiAnalysisFrom(job({ status: "failed" }), settled).kind).toBe(
      "failed",
    );
    expect(aiAnalysisFrom(job({ status: "completed" }), settled).kind).toBe(
      "no_result",
    );
  });

  it("exposes the identification of a completed job", () => {
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

    expect(
      aiAnalysisFrom(job({ status: "completed", identification }), settled),
    ).toEqual({ kind: "ready", identification });
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
