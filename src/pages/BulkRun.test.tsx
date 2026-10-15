// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";

import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import BulkRunModal from "../components/pipeline/BulkRunModal";
import { getPipelineOptions } from "../lib/api";
import {
  deleteBulkRun,
  getBulkRun,
  previewBulkRun,
  retryBulkRun,
  startBulkRun,
  type BulkItem,
  type BulkRun,
} from "../lib/bulk-runs";
import Toaster from "../components/ui/Toaster";
import { watchedBulkRuns } from "../lib/activity";
import { toast } from "../lib/toast";
import BulkRunPage from "./BulkRunPage";

vi.mock("../lib/bulk-runs", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../lib/bulk-runs")>()),
  previewBulkRun: vi.fn(),
  startBulkRun: vi.fn(),
  getBulkRun: vi.fn(),
  retryBulkRun: vi.fn(),
  cancelBulkRun: vi.fn(),
  deleteBulkRun: vi.fn(),
  resumeBulkRun: vi.fn(),
}));

vi.mock("../lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../lib/api")>()),
  getPipelineOptions: vi.fn(),
}));

vi.mock("../lib/auth-context", () => ({
  useAuth: () => ({ can: () => true }),
}));

const RUN: BulkRun = {
  id: "bulk-1", label: "BATCH-0007: 4 pairs", status: "paused",
  pause_reason: "The vision provider's quota or billing limit was reached: insufficient_quota.",
  source_batch: "b1", scope: "no_result", overrides: { prompt_version: "fdc-v2" }, is_test: false, to_stage: 7,
  created_by: "ops", created_at: "2026-10-13T10:00:00Z", finished_at: null,
  counts: { queued: 1, running: 0, succeeded: 1, needs_attention: 1, failed: 1, skipped: 0, cancelled: 0, total: 4, waiting_retry: 0 },
};

function item(id: string, status: BulkItem["status"], extra: Partial<BulkItem> = {}): BulkItem {
  return {
    id, sneaker_pair: `p-${id}`, sneaker_pair_id: `KKX-PAIR-${id}`, brand: "", model: "", status,
    error: "", error_kind: "", attempts: 1, next_attempt_at: null, started_at: null, finished_at: null,
    run: `run-${id}`, run_status: "completed", duration_ms: 4200, result: null, summary: "", ...extra,
  };
}

const ITEMS = [
  item("1", "succeeded", { result: { brand: { value: "Nike", confidence: 0.95 }, model: { value: "Dunk Low", confidence: 0.6 }, sku: null, size: null } }),
  item("2", "needs_attention", { error: "bad JSON from the model", error_kind: "vision" }),
  item("3", "failed", { error: "Vision model rate limited (openai): 429", error_kind: "rate_limited", attempts: 4 }),
  item("4", "queued", { attempts: 0, run: null }),
];

beforeEach(() => {
  vi.mocked(getPipelineOptions).mockResolvedValue({
    stages: [], providers: [{ name: "openai", default_model: "gpt", is_default: true }],
    prompt_versions: ["fdc-v1", "fdc-v2"], default_prompt_version: "fdc-v2", ocr_backends: ["tesseract"],
  });
  vi.mocked(previewBulkRun).mockImplementation(async ({ scope }) => ({
    pairs: scope === "all" ? 10 : 3, will_run: scope === "all" ? 8 : 2,
    skipped: scope === "all" ? [{ reason: "No uploaded photos.", pairs: 2 }] : [{ reason: "No uploaded photos.", pairs: 1 }],
    max_pairs: 500, concurrency: 2, scopes: [],
  }));
  vi.mocked(getBulkRun).mockResolvedValue({ run: RUN, items: ITEMS, count: 4 });
  vi.mocked(retryBulkRun).mockResolvedValue({ ...RUN, status: "running", queued: 2 });
});

afterEach(() => {
  cleanup();
  toast.reset();
  window.localStorage.clear();
  vi.clearAllMocks();
});

describe("starting a bulk run", () => {
  it("counts the pairs for each choice and starts with the overrides", async () => {
    vi.mocked(startBulkRun).mockResolvedValue({ ...RUN, id: "bulk-9", status: "running" });
    render(
      <MemoryRouter initialEntries={["/batches/b1"]}>
        <Routes>
          <Route path="/batches/b1" element={<BulkRunModal batchId="b1" batchLabel="BATCH-0007" onClose={() => {}} />} />
          <Route path="/pipeline-monitor/bulk/:id" element={<p>Bulk page</p>} />
        </Routes>
        <Toaster />
      </MemoryRouter>,
    );

    expect(await screen.findByText(/2 pairs will run/)).toBeInTheDocument();
    expect(screen.getByText("1 skipped: No uploaded photos.")).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText(/Every pair in the batch/));
    expect(await screen.findByText(/8 pairs will run/)).toBeInTheDocument();
    expect(previewBulkRun).toHaveBeenLastCalledWith({ batch: "b1", scope: "all" });

    fireEvent.click(screen.getByLabelText(/Test run/));
    fireEvent.change(await screen.findByLabelText("Prompt version"), { target: { value: "fdc-v1" } });
    fireEvent.click(screen.getByRole("button", { name: "Run 8 pairs" }));

    await waitFor(() => expect(startBulkRun).toHaveBeenCalledWith({
      batch: "b1", scope: "all", is_test: true, overrides: { prompt_version: "fdc-v1" },
    }));
    expect(await screen.findByText("Bulk page")).toBeInTheDocument();
    // You hear about it when it finishes, wherever you are.
    expect(screen.getByText(/Bulk run started/)).toBeInTheDocument();
    expect(watchedBulkRuns()).toEqual(["bulk-9"]);
  });

  it("runs the selected pairs up to the label reader only", async () => {
    vi.mocked(getPipelineOptions).mockResolvedValue({
      stages: ["Load photos", "Quality check", "Label reader", "Catalog lookup", "Vision model",
        "Fusion + validation", "Save + route"].map((name, i) => ({ stage: i + 1, name })),
      providers: [{ name: "openai", default_model: "gpt", is_default: true }],
      prompt_versions: ["fdc-v2"], default_prompt_version: "fdc-v2", ocr_backends: ["tesseract", "none"],
    });
    vi.mocked(startBulkRun).mockResolvedValue({ ...RUN, id: "bulk-10", status: "running", to_stage: 3 });
    render(
      <MemoryRouter initialEntries={["/batches/b1"]}>
        <Routes>
          <Route path="/batches/b1" element={
            <BulkRunModal batchId="b1" batchLabel="BATCH-0007" pairIds={["p-1", "p-2"]} onClose={() => {}} />
          } />
          <Route path="/pipeline-monitor/bulk/:id" element={<p>Bulk page</p>} />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByText(/2 selected pairs/)).toBeInTheDocument();
    // Picked pairs: no choosing by scope
    expect(screen.queryByText("Which pairs")).not.toBeInTheDocument();
    await waitFor(() => expect(previewBulkRun).toHaveBeenCalledWith({ pairs: ["p-1", "p-2"] }));

    fireEvent.change(await screen.findByLabelText(/Run up to/), { target: { value: "3" } });
    expect(screen.getByText(/Nothing is saved to the pairs. No vision model calls./)).toBeInTheDocument();
    // Test runs and vision settings don't apply when stopping at the labels
    expect(screen.queryByLabelText(/Test run/)).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Prompt version")).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("OCR"), { target: { value: "none" } });
    fireEvent.click(await screen.findByRole("button", { name: "Run 2 pairs" }));

    await waitFor(() => expect(startBulkRun).toHaveBeenCalledWith({
      pairs: ["p-1", "p-2"], is_test: false, overrides: { ocr_backend: "none" }, to_stage: 3,
    }));
  });
});

describe("a bulk run", () => {
  function renderPage() {
    render(
      <MemoryRouter initialEntries={["/pipeline-monitor/bulk/bulk-1"]}>
        <Routes>
          <Route path="/pipeline-monitor/bulk/:bulkId" element={<BulkRunPage />} />
        </Routes>
        <Toaster />
      </MemoryRouter>,
    );
  }

  it("shows the outcome of every pair and why it paused", async () => {
    renderPage();

    expect(await screen.findByText(/Paused: nothing more is being sent/)).toBeInTheDocument();
    expect(screen.getByText(/insufficient_quota/)).toBeInTheDocument();
    expect(screen.getByText("3 of 4 pairs done")).toBeInTheDocument();
    const rows = screen.getAllByRole("row");
    expect(within(rows[1]).getByText("Succeeded")).toBeInTheDocument();
    expect(within(rows[1]).getByText("Dunk Low")).toBeInTheDocument();
    expect(within(rows[2]).getByText("No vision model result")).toBeInTheDocument();
    expect(within(rows[3]).getByText("Rate limited")).toBeInTheDocument();
    expect(within(rows[3]).getByText("4 attempts")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Resume" })).toBeInTheDocument();
  });

  it("deletes a finished bulk run, not a paused one", async () => {
    renderPage();
    await screen.findByText(/Paused: nothing more is being sent/);
    expect(screen.queryByRole("button", { name: "Delete" })).not.toBeInTheDocument();
    cleanup();

    vi.mocked(getBulkRun).mockResolvedValue({ run: { ...RUN, status: "completed", pause_reason: "" }, items: ITEMS, count: 4 });
    vi.mocked(deleteBulkRun).mockResolvedValue();
    render(
      <MemoryRouter initialEntries={["/pipeline-monitor/bulk/bulk-1"]}>
        <Routes>
          <Route path="/pipeline-monitor/bulk/:bulkId" element={<BulkRunPage />} />
          <Route path="/pipeline-monitor" element={<p>Monitor</p>} />
        </Routes>
      </MemoryRouter>,
    );
    fireEvent.click(await screen.findByRole("button", { name: "Delete" }));
    const dialog = await screen.findByRole("alertdialog", { name: "Delete this bulk run?" });
    // The safe choice has focus
    expect(within(dialog).getByRole("button", { name: "Cancel" })).toHaveFocus();
    fireEvent.click(within(dialog).getByRole("button", { name: "Delete bulk run" }));
    await waitFor(() => expect(deleteBulkRun).toHaveBeenCalledWith("bulk-1"));
    expect(await screen.findByText("Monitor")).toBeInTheDocument();
  });

  it("retries failed pairs, re-runs chosen ones and filters by status", async () => {
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "Retry failed (2)" }));
    await waitFor(() => expect(retryBulkRun).toHaveBeenCalledWith("bulk-1", { statuses: ["failed", "needs_attention"] }));
    expect(await screen.findByText("2 pairs queued again.")).toBeInTheDocument();
    expect(watchedBulkRuns()).toEqual(["bulk-1"]);

    fireEvent.click(screen.getByLabelText("Select KKX-PAIR-1"));
    fireEvent.click(screen.getByRole("button", { name: "Run selected again" }));
    await waitFor(() => expect(retryBulkRun).toHaveBeenLastCalledWith("bulk-1", { items: ["1"] }));

    fireEvent.click(screen.getByRole("button", { name: /Failed 1/ }));
    await waitFor(() => expect(getBulkRun).toHaveBeenLastCalledWith("bulk-1", { status: "failed", page: 1 }));
  });
});
