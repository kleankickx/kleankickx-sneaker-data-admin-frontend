// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";

import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  getFunnelPairs,
  getPipelineOverview,
  getPipelineRun,
  rerunAnalysis,
  type PipelineOverview,
  type PipelineRunDetail,
} from "../lib/api";
import { age, duration, lastNDays, pct } from "../lib/monitor";
import PipelineMonitorPage from "./PipelineMonitorPage";
import PipelineRunPage from "./PipelineRunPage";

vi.mock("../lib/api", () => ({
  getPipelineOverview: vi.fn(),
  getFunnelPairs: vi.fn(),
  getPipelineRun: vi.fn(),
  rerunAnalysis: vi.fn(),
}));

const overview: PipelineOverview = {
  range: { from: "2026-10-03", to: "2026-10-09" },
  filters: { prompt_versions: ["fdc-v1", "fdc-v2"], models: ["vision-1"] },
  funnel: [
    { step: "created", count: 10, rate: 1 },
    { step: "complete", count: 8, rate: 0.8 },
    { step: "analyzed", count: 6, rate: 0.6 },
    { step: "needs_review", count: 2, rate: 0.2 },
    { step: "verified", count: 3, rate: 0.3 },
  ],
  run_health: {
    jobs_by_status: { queued: 1, processing: 0, completed: 5, failed: 1 },
    runs: 6,
    runs_per_day: [{ day: "2026-10-08", count: 2 }, { day: "2026-10-09", count: 4 }],
    avg_duration_ms: 4200,
    p95_duration_ms: 9800,
    vision_failed: 1,
    vision_failure_rate: 1 / 6,
    vision_disabled: 0,
    test_runs: 2,
    oldest_queued_age_seconds: 3600,
    queue_stuck: true,
    recent_failures: [
      {
        kind: "vision_failed", job_id: null, run_id: "run-1",
        sneaker_pair: "pair-1", sneaker_pair_id: "KKX-PAIR-00000001",
        error: "quota exceeded", at: "2026-10-09T10:00:00Z",
      },
    ],
    recent_runs: [],
  },
  stages: {
    runs: 6,
    qc: {
      pass_rate: 0.5,
      per_view: [{ view: "lateral", runs: 6, pass_rate: 0.5 }],
      top_issues: [{ issue: "blurry", count: 3 }],
    },
    barcode_rate: 0.5,
    sku_found_rate: 0.83,
    sku_sources: {
      barcode: { count: 3, rate: 0.5 },
      ocr: { count: 1, rate: 0.17 },
      ai: { count: 1, rate: 0.17 },
    },
    catalog_hit_rate: 0.5,
    size_found_rate: 0.67,
    size_consistent_rate: 0.75,
    fields: [{ field: "brand", avg_confidence: 0.91, below_threshold_rate: 0.17 }],
  },
  review: {
    queue_size: 2,
    oldest_unverified_age_seconds: 7200,
    verified_per_day: [],
    verified_per_reviewer: [{ reviewer: "ama", count: 3 }],
    changed_by_field: [
      { prompt_version: "fdc-v1", field: "model", reviewed: 4, changed: 2, changed_rate: 0.5 },
      { prompt_version: "fdc-v2", field: "model", reviewed: 4, changed: 1, changed_rate: 0.25 },
    ],
  },
  catalog: { total: 12, added_per_week: [{ week: "2026-10-05", count: 3 }] },
  generated_at: "2026-10-09T10:00:00Z",
};

function renderPage() {
  render(
    <MemoryRouter>
      <PipelineMonitorPage />
    </MemoryRouter>,
  );
}

// Block body: a function returned from beforeEach runs as a teardown.
beforeEach(() => {
  vi.mocked(getPipelineOverview).mockReset();
  vi.mocked(getFunnelPairs).mockReset();
  vi.mocked(rerunAnalysis).mockReset();
  vi.mocked(getPipelineRun).mockReset();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("monitor formatting", () => {
  it("formats rates, durations and ages", () => {
    expect(pct(0.8)).toBe("80%");
    expect(pct(0.045)).toBe("4.5%");
    expect(pct(null)).toBe("—");
    expect(duration(850)).toBe("850 ms");
    expect(duration(9800)).toBe("9.8 s");
    expect(age(3600)).toBe("1 h");
    expect(lastNDays(7, new Date(2026, 9, 9))).toEqual({ from: "2026-10-03", to: "2026-10-09" });
  });
});

describe("PipelineMonitorPage", () => {
  it("shows each section from the overview, defaulting to the last 7 days", async () => {
    vi.mocked(getPipelineOverview).mockResolvedValue(overview);

    renderPage();

    expect(await screen.findByText("Captures created")).toBeInTheDocument();
    const params = vi.mocked(getPipelineOverview).mock.calls[0][0];
    expect(params).toEqual(lastNDays(7));

    expect(screen.getByText(/Queue may be stuck/)).toBeInTheDocument();
    expect(screen.getByText("9.8 s")).toBeInTheDocument();
    expect(screen.getByText("blurry")).toBeInTheDocument();
    expect(screen.getByText("quota exceeded")).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "fdc-v2" })).toBeInTheDocument();
    expect(screen.getByText("25%")).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "vision-1" })).toBeInTheDocument();
  });

  it("refetches when a filter changes", async () => {
    vi.mocked(getPipelineOverview).mockResolvedValue(overview);
    renderPage();
    await screen.findByText("Captures created");

    fireEvent.change(screen.getByLabelText("Prompt version"), { target: { value: "fdc-v1" } });

    await waitFor(() =>
      expect(vi.mocked(getPipelineOverview).mock.calls.at(-1)?.[0]).toMatchObject({
        prompt_version: "fdc-v1",
      }),
    );
  });

  it("lists the pairs at a funnel step", async () => {
    vi.mocked(getPipelineOverview).mockResolvedValue(overview);
    vi.mocked(getFunnelPairs).mockResolvedValue({
      results: [{
        id: "pair-9", pair_id: "KKX-PAIR-00000009", brand: "Nike", model: "Dunk",
        status: "verification", created_at: "2026-10-09T09:00:00Z",
      }],
      meta: { count: 1, next: null, previous: null },
    });
    renderPage();

    fireEvent.click(await screen.findByRole("button", { name: /Needs review/ }));

    const dialog = await screen.findByRole("dialog");
    expect(await within(dialog).findByText("KKX-PAIR-00000009")).toBeInTheDocument();
    expect(vi.mocked(getFunnelPairs).mock.calls[0][0]).toBe("needs_review");
  });

  it("re-runs a failed pair", async () => {
    vi.mocked(getPipelineOverview).mockResolvedValue(overview);
    vi.mocked(rerunAnalysis).mockResolvedValue();
    renderPage();

    fireEvent.click(await screen.findByRole("button", { name: "Re-run" }));

    await waitFor(() => expect(rerunAnalysis).toHaveBeenCalledWith("pair-1"));
    expect(await screen.findByText("Analysis queued.")).toBeInTheDocument();
  });

  it("refreshes every 30 seconds", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.mocked(getPipelineOverview).mockResolvedValue(overview);
    renderPage();
    await screen.findByText("Captures created");
    const calls = vi.mocked(getPipelineOverview).mock.calls.length;

    await act(async () => {
      vi.advanceTimersByTime(30_000);
    });

    await waitFor(() =>
      expect(vi.mocked(getPipelineOverview).mock.calls.length).toBe(calls + 1),
    );
  });

  it("tells non-staff users the page is staff only", async () => {
    vi.mocked(getPipelineOverview).mockRejectedValue(
      Object.assign(new Error("403"), { response: { status: 403, data: {} } }),
    );
    renderPage();

    expect(await screen.findByText("Staff only")).toBeInTheDocument();
  });
});

describe("PipelineRunPage", () => {
  it("shows the step timeline with the label reading and SKU trace", async () => {
    const field = (value: string | null, confidence = 0.9) => ({ value, confidence, evidence: "e" });
    const run = {
      id: "run-1",
      sneaker_pair: "pair-1",
      sneaker_pair_id: "KKX-PAIR-00000001",
      result: {
        brand: field("Nike"), model: field("Dunk Low"), sku: field("DD1391-100"),
        size: field("US 10"), colorway: field(null, 0), condition: field("Good", 0.7),
        materials: [], visible_text: [], candidate_matches: [],
        overall_assessment: "", limitations: ["Authenticity is not assessed"],
      },
      regions: [],
      prompt_version: "fdc-v2",
      provider: "openai",
      model_name: "vision-1",
      vlm_used: true,
      vlm_error: "",
      duration_ms: 4200,
      created_at: "2026-10-09T10:00:00Z",
      debug: {
        stages: [
          { stage: "quality_check", status: "warning", duration_ms: 120,
            output: { failed_views: ["sole"], issues: { sole: ["blurry (sharpness 10 < 100)"] } } },
          { stage: "label_reader", status: "ok", duration_ms: 900,
            output: { ocr_available: true,
                      barcodes: [{ code: "0195193123459", checksum_valid: true }],
                      sku_candidates: [{ sku: "DD1391-100", brand_hint: "Nike/Jordan" }],
                      sizes: { US: 10 }, size_consistency: "partial" } },
          { stage: "vision_model", status: "ok", duration_ms: 3000,
            output: { provider: "openai", model: "vision-1" } },
          { stage: "fusion", status: "ok", duration_ms: 5,
            output: { sku: "DD1391-100", sku_source: "barcode", catalog_hit: true,
                      sku_trace: ["barcode 123 failed checksum"] } },
        ],
      },
      raw_response: { brand: { value: "Nike" } },
      job_status: "completed",
      status: "completed",
      is_test: false,
      notes: [],
      stages: [],
      qc_ok: false, barcode_decoded: true, sku_source: "barcode",
      catalog_hit: true, size_found: true, size_consistent: false,
    } as PipelineRunDetail;
    vi.mocked(getPipelineRun).mockResolvedValue(run);

    render(
      <MemoryRouter initialEntries={["/pipeline-monitor/runs/run-1"]}>
        <Routes>
          <Route path="/pipeline-monitor/runs/:runId" element={<PipelineRunPage />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByText("Quality check")).toBeInTheDocument();
    expect(getPipelineRun).toHaveBeenCalledWith("run-1");
    expect(screen.getByText("Warning")).toBeInTheDocument();
    expect(screen.getByText("0195193123459")).toBeInTheDocument();
    expect(screen.getAllByText("DD1391-100").length).toBeGreaterThan(0);
    expect(screen.getByText("barcode 123 failed checksum")).toBeInTheDocument();
    expect(screen.getByText("3.0 s")).toBeInTheDocument();
    expect(screen.getByText("Vision model raw JSON")).toBeInTheDocument();
  });
});
