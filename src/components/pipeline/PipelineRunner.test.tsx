// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";

import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  getPipelineOptions,
  getPipelineRunState,
  listPipelineRuns,
  nextPipelineStep,
  promotePipelineRun,
  startPipelineRun,
  type PipelineRunState,
  type PipelineStage,
} from "../../lib/api";
import type { AnalysisResult, SneakerPair } from "../../lib/types";
import PipelineRunner from "./PipelineRunner";

vi.mock("../../lib/api", () => ({
  getPipelineOptions: vi.fn(),
  getPipelineRunState: vi.fn(),
  listPipelineRuns: vi.fn(),
  nextPipelineStep: vi.fn(),
  promotePipelineRun: vi.fn(),
  startPipelineRun: vi.fn(),
}));

const NAMES = [
  "Load photos", "Quality check", "Label reader", "Catalog lookup",
  "Vision model", "Fusion + validation", "Save + route",
];
const TEST_SWITCH = "Test run (doesn't replace the current result, review queue or catalog)";

const pair = {
  id: "pair-1",
  capture_sessions: [{
    id: "s", is_ready: true, created_at: "", updated_at: "",
    images: ["overview", "left", "right", "top", "sole", "label"].map((angle) => ({
      id: `${angle}-id`, angle, status: "uploaded", image_url: `https://img.test/${angle}.jpg`,
      created_at: "2026-10-09T10:00:00Z",
    })),
  }],
} as unknown as SneakerPair;

function result(model: string): AnalysisResult {
  const f = (value: string | null, confidence = 0.9) => ({ value, confidence, evidence: "" });
  return {
    brand: f("Nike"), model: f(model), sku: f("DD1391-100"), size: f("US 10"),
    colorway: f(null, 0), condition: f("Good", 0.7),
    materials: [], visible_text: [], candidate_matches: [],
    overall_assessment: "", limitations: [],
  };
}

function stages(statuses: PipelineStage["status"][], extra: Partial<Record<number, Partial<PipelineStage>>> = {}) {
  return statuses.map((status, i) => ({
    stage: i + 1, name: NAMES[i], status, summary: "", output: null, error: "",
    duration_ms: status === "done" ? 120 : null, started_at: null, finished_at: null,
    reused_from_run: null, ...extra[i + 1],
  }));
}

function runState(overrides: Partial<PipelineRunState> = {}): PipelineRunState {
  return {
    id: "run-2", sneaker_pair: "pair-1", sneaker_pair_id: "KKX-PAIR-00000001",
    status: "running", mode: "all", from_stage: 1, to_stage: 7, source_run: null,
    is_test: true, overrides: {}, prompt_version: "fdc-v2", provider: "", model_name: "",
    notes: [], error: "", requested_by: "ops", result: null,
    created_at: "2026-10-09T10:00:00Z", started_at: null, finished_at: null, duration_ms: null,
    stages: stages(["running", "waiting", "waiting", "waiting", "waiting", "waiting", "waiting"]),
    current: null,
    ...overrides,
  };
}

beforeEach(() => {
  vi.mocked(getPipelineOptions).mockReset().mockResolvedValue({
    stages: NAMES.map((name, i) => ({ stage: i + 1, name })),
    providers: [{ name: "openai", default_model: "vision-1", is_default: true },
                { name: "self_hosted", default_model: "qwen-vl", is_default: false }],
    prompt_versions: ["fdc-v1", "fdc-v2"],
    default_prompt_version: "fdc-v2",
    ocr_backends: ["tesseract", "none"],
  });
  vi.mocked(listPipelineRuns).mockReset().mockResolvedValue([{
    id: "run-1", status: "completed", mode: "all", is_test: false,
    prompt_version: "fdc-v2", model_name: "vision-1",
    created_at: "2026-10-08T10:00:00Z", finished_at: "2026-10-08T10:01:00Z",
    stage_statuses: {},
  }]);
  vi.mocked(startPipelineRun).mockReset();
  vi.mocked(getPipelineRunState).mockReset();
  vi.mocked(nextPipelineStep).mockReset();
  vi.mocked(promotePipelineRun).mockReset();
});
afterEach(cleanup);

const node = (n: number) => screen.getByRole("button", { name: new RegExp(`^${n}\\. ${NAMES[n - 1].replace("+", "\\+")}:`) });
const mode = (name: string) => fireEvent.click(screen.getByRole("radio", { name }));

async function renderRunner(props: Partial<Parameters<typeof PipelineRunner>[0]> = {}) {
  render(<PipelineRunner pairId="pair-1" pair={pair} {...props} />);
  await screen.findByRole("button", { name: /^4\. Catalog lookup:/ });
}

describe("PipelineRunner", () => {
  it("shows the flow and runs up to the selected stage with overrides", async () => {
    vi.mocked(startPipelineRun).mockResolvedValue(runState({ status: "stopped", mode: "to", to_stage: 3 }));
    await renderRunner();

    mode("Up to stage");
    fireEvent.click(node(3));
    fireEvent.click(screen.getByRole("button", { name: "Advanced" }));
    fireEvent.change(screen.getByLabelText("Provider"), { target: { value: "self_hosted" } });
    expect(screen.getByLabelText("Model")).toHaveAttribute("placeholder", "qwen-vl");
    fireEvent.change(screen.getByLabelText("Prompt version"), { target: { value: "fdc-v1" } });
    fireEvent.click(screen.getByRole("button", { name: "Run stages 1–3" }));

    await waitFor(() => expect(startPipelineRun).toHaveBeenCalledWith({
      sneaker_pair: "pair-1", mode: "to", stage: 3, is_test: true,
      overrides: { provider: "self_hosted", prompt_version: "fdc-v1" },
    }));
  });

  it("re-runs from a stage reusing the chosen earlier run", async () => {
    vi.mocked(startPipelineRun).mockResolvedValue(runState({ status: "completed" }));
    await renderRunner();

    mode("From stage");
    expect(screen.getByRole("button", { name: "Re-run from 1 · Photos" })).toBeDisabled();
    fireEvent.click(node(5));
    fireEvent.click(screen.getByLabelText(TEST_SWITCH));
    fireEvent.click(screen.getByRole("button", { name: "Re-run from 5 · Vision" }));

    await waitFor(() => expect(startPipelineRun).toHaveBeenCalledWith(expect.objectContaining({
      mode: "from", stage: 5, source_run: "run-1", is_test: false,
    })));
  });

  it("polls a running run and follows the live stage", async () => {
    vi.mocked(startPipelineRun).mockResolvedValue(runState());
    vi.mocked(getPipelineRunState).mockResolvedValue(runState({
      status: "completed",
      stages: stages(Array(7).fill("done"), {
        4: { summary: "catalog hit: Nike Dunk Low (DD1391-100)" },
        7: { summary: "Test run saved; not routed", output: { test_run: true, low_fields: [] } },
      }),
    }));
    await renderRunner();

    fireEvent.click(screen.getByRole("button", { name: "Run all stages" }));
    expect(await screen.findByRole("button", { name: /^1\. Load photos: Running/ })).toBeInTheDocument();

    // The panel polls every 1.5 s; the inspector moves to the last stage.
    expect(await screen.findByText("Test run saved", {}, { timeout: 4000 })).toBeInTheDocument();
    expect(node(4)).toHaveAccessibleName(/Done$/);
    fireEvent.click(node(4));
    expect(screen.getByText("catalog hit: Nike Dunk Low (DD1391-100)")).toBeInTheDocument();
  });

  it("steps one stage at a time", async () => {
    vi.mocked(startPipelineRun).mockResolvedValue(runState({
      status: "waiting", mode: "step",
      stages: stages(["done", "waiting", "waiting", "waiting", "waiting", "waiting", "waiting"]),
    }));
    vi.mocked(nextPipelineStep).mockResolvedValue(runState({ status: "queued", mode: "step" }));
    await renderRunner();

    mode("Step");
    fireEvent.click(screen.getByRole("button", { name: "Step through" }));
    fireEvent.click(await screen.findByRole("button", { name: /Next/ }));

    await waitFor(() => expect(nextPipelineStep).toHaveBeenCalledWith("run-2"));
    expect(startPipelineRun).toHaveBeenCalledWith(expect.objectContaining({ mode: "step" }));
  });

  it("shows the label being read: scan state, barcode, SKU, sizes and a preprocessed view", async () => {
    vi.mocked(getPipelineRunState).mockResolvedValue(runState({
      status: "completed",
      stages: stages(Array(7).fill("done"), {
        3: {
          summary: "barcode 0195193123459, SKU DD1391-100, US 10",
          output: {
            barcodes: [{ code: "0195193123459", format: "EAN-13", checksum_valid: true }],
            sku_candidates: [{ sku: "DD1391-100", brand_hint: "Nike/Jordan", how: "pattern" }],
            sizes: { US: 10, UK: 9, EUR: 44 },
            size_consistency: "consistent",
            visible_text: ["NIKE", "MADE IN VIETNAM"],
            ocr_backend: "tesseract",
            ocr_available: true,
          },
        },
      }),
    }));
    await renderRunner({ initialRunId: "run-2" });
    fireEvent.click(await screen.findByRole("button", { name: /^3\. Label reader: Done/ }));

    expect(screen.getByText("Scanned")).toBeInTheDocument();
    expect(screen.getByText("0195193123459")).toBeInTheDocument();
    expect(screen.getByText("Checksum ok")).toBeInTheDocument();
    expect(screen.getByText("DD1391-100")).toBeInTheDocument();
    expect(screen.getByText("consistent")).toBeInTheDocument();
    expect(screen.getByText("MADE IN VIETNAM")).toBeInTheDocument();

    const label = screen.getByAltText("Label photo");
    expect(label).toHaveAttribute("src", "https://img.test/label.jpg");
    fireEvent.click(screen.getByRole("button", { name: "Preprocessed" }));
    expect(label.getAttribute("style")).toContain("grayscale(1)");
  });

  it("marks quality check verdicts on each photo", async () => {
    vi.mocked(getPipelineRunState).mockResolvedValue(runState({
      status: "completed",
      stages: stages(Array(7).fill("done"), {
        2: {
          output: {
            views: {
              lateral: { ok: true, issues: [], metrics: { sharpness: 240, brightness: 120 } },
              sole: { ok: false, issues: ["blurry (sharpness 40 < 100)"], metrics: { sharpness: 40 } },
            },
            missing_views: ["front"],
          },
        },
      }),
    }));
    await renderRunner({ initialRunId: "run-2" });
    fireEvent.click(await screen.findByRole("button", { name: /^2\. Quality check:/ }));

    expect(screen.getByText("Pass")).toBeInTheDocument();
    expect(screen.getByText("Fail")).toBeInTheDocument();
    expect(screen.getByText("blurry (sharpness 40 < 100)")).toBeInTheDocument();
    // We never capture front, so it isn't shown as missing.
    expect(screen.queryByText("Missing")).not.toBeInTheDocument();
  });

  it("compares a finished test run with the current result and can use it", async () => {
    const onResultChanged = vi.fn();
    const finished = runState({
      status: "completed",
      result: result("Dunk Low"),
      stages: stages(Array(7).fill("done")),
      notes: ["Photos changed since the source run; ran stages 1–4 again first."],
      current: {
        run_id: "run-1", is_this_run: false, prompt_version: "fdc-v1",
        model_name: "vision-1", finished_at: null, result: result("Air Force 1"),
      },
    });
    vi.mocked(getPipelineRunState).mockResolvedValue(finished);
    vi.mocked(promotePipelineRun).mockResolvedValue({
      ...finished, is_test: false, current: { ...finished.current!, is_this_run: true },
    });
    await renderRunner({ initialRunId: "run-2", onResultChanged });

    // The run's badge, besides the "Test run" switch.
    expect(await screen.findAllByText("Test run")).toHaveLength(2);
    expect(screen.getByText(/Photos changed since the source run/)).toBeInTheDocument();
    expect(screen.getByText("Result vs current (1 field differs)")).toBeInTheDocument();
    const row = screen.getByText("Dunk Low").closest("tr") as HTMLElement;
    expect(row).toHaveClass("bg-amber-50/70");
    expect(within(row).getByText("Air Force 1")).toBeInTheDocument();
    expect(onResultChanged).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: /Use this result/ }));

    await waitFor(() => expect(promotePipelineRun).toHaveBeenCalledWith("run-2"));
    expect(onResultChanged).toHaveBeenCalledTimes(1);
  });

  it("tells the page when a real run finishes", async () => {
    const onResultChanged = vi.fn();
    vi.mocked(startPipelineRun).mockResolvedValue(runState({
      is_test: false, status: "completed", stages: stages(Array(7).fill("done")),
    }));
    await renderRunner({ onResultChanged });

    fireEvent.click(screen.getByLabelText(TEST_SWITCH));
    fireEvent.click(screen.getByRole("button", { name: "Run all stages" }));

    await waitFor(() => expect(onResultChanged).toHaveBeenCalledTimes(1));
  });

  it("keeps the vision model's raw JSON collapsible", async () => {
    vi.mocked(getPipelineRunState).mockResolvedValue(runState({
      status: "completed",
      stages: stages(Array(7).fill("done"), {
        5: {
          summary: "vision-1: Nike",
          output: {
            provider: "openai", model: "vision-1", prompt_version: "fdc-v2",
            output: { brand: { value: "Nike", confidence: 0.95, evidence: "" } },
            raw: { brand: { value: "Nike" } },
          },
        },
      }),
    }));
    await renderRunner({ initialRunId: "run-2" });
    fireEvent.click(await screen.findByRole("button", { name: /^5\. Vision model:/ }));

    expect(screen.getByText("vision-1: Nike")).toBeInTheDocument();
    expect(screen.getByText("Vision model raw JSON")).toBeInTheDocument();
    expect(screen.getByText("0.95")).toBeInTheDocument();
  });
});
