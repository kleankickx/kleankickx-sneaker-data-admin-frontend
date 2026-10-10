// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { api, downloadBatchExport, getBatchSummary, type BatchSummary } from "../../lib/api";
import BatchSummaryPanel from "./BatchSummaryPanel";

vi.mock("../../lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../lib/api")>();
  return { ...actual, getBatchSummary: vi.fn() };
});

const SUMMARY: BatchSummary = {
  batch_id: "BATCH-0007",
  name: "October intake",
  expected_quantity: 120,
  total_pairs: 100,
  complete_pairs: 70,
  pairs_without_images: 5,
  required_images: 6,
  total_images: 520,
  by_image_count: [
    { images: 6, pairs: 70, percent: 70 },
    { images: 5, pairs: 15, percent: 15 },
    { images: 4, pairs: 0, percent: 0 },
    { images: 3, pairs: 4, percent: 4 },
    { images: 2, pairs: 6, percent: 6 },
    { images: 1, pairs: 0, percent: 0 },
    { images: 0, pairs: 5, percent: 5 },
  ],
  missing_by_angle: [
    { angle: "overview", pairs: 5 },
    { angle: "top", pairs: 9 },
    { angle: "left", pairs: 10 },
    { angle: "right", pairs: 12 },
    { angle: "sole", pairs: 25 },
    { angle: "label", pairs: 20 },
  ],
  by_status: [{ status: "received", label: "Received", pairs: 100 }],
  by_condition: [{ condition: "Good", pairs: 60 }, { condition: "Not set", pairs: 40 }],
  with_sku: 42,
  with_brand_and_model: 80,
};

describe("BatchSummaryPanel", () => {
  beforeEach(() => vi.mocked(getBatchSummary).mockResolvedValue(SUMMARY));
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("shows pairs by number of images and what's missing", async () => {
    render(<BatchSummaryPanel batchId="b1" version={0} selected={null} onSelect={() => {}} />);

    expect(await screen.findByText("Batch summary")).toBeInTheDocument();
    expect(screen.getByText("of 120 expected")).toBeInTheDocument();
    expect(screen.getByText("70% of pairs")).toBeInTheDocument();          // all 6 images
    expect(screen.getByText("Missing some").nextSibling).toHaveTextContent("25");   // 15 + 4 + 6
    expect(screen.getByRole("button", { name: "5 of 6 images: 15 pairs" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "4 of 6 images: 0 pairs" })).toBeDisabled();
    expect(screen.getByText("sole").nextSibling).toHaveTextContent("25");
    expect(screen.getByText("Not set")).toBeInTheDocument();
  });

  it("picks an image count, and picking it again clears it", async () => {
    const onSelect = vi.fn();
    const { rerender } = render(<BatchSummaryPanel batchId="b1" version={0} selected={null} onSelect={onSelect} />);

    fireEvent.click(await screen.findByRole("button", { name: "2 of 6 images: 6 pairs" }));
    expect(onSelect).toHaveBeenLastCalledWith(2);

    rerender(<BatchSummaryPanel batchId="b1" version={0} selected={2} onSelect={onSelect} />);
    const row = screen.getByRole("button", { name: "2 of 6 images: 6 pairs" });
    expect(row).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(row);
    expect(onSelect).toHaveBeenLastCalledWith(null);
  });

  it("reloads when the version changes", async () => {
    const { rerender } = render(<BatchSummaryPanel batchId="b1" version={0} selected={null} onSelect={() => {}} />);
    await screen.findByText("Batch summary");
    rerender(<BatchSummaryPanel batchId="b1" version={1} selected={null} onSelect={() => {}} />);
    await vi.waitFor(() => expect(getBatchSummary).toHaveBeenCalledTimes(2));
  });
});

describe("downloadBatchExport", () => {
  it("requests the file with the filters and saves it under the server's name", async () => {
    const get = vi.spyOn(api, "get").mockResolvedValue({
      data: new Blob(["x"]),
      headers: { "content-disposition": 'attachment; filename="BATCH-0007-pairs-20261010-1200.xlsx"' },
    });
    URL.createObjectURL = vi.fn(() => "blob:test");
    URL.revokeObjectURL = vi.fn();
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});

    const name = await downloadBatchExport("b1", "xlsx", { images: "6", brand: "Nike" });

    expect(get).toHaveBeenCalledWith("/batches/b1/export/", expect.objectContaining({
      params: { file: "xlsx", images: "6", brand: "Nike" },
      responseType: "blob",
    }));
    expect(name).toBe("BATCH-0007-pairs-20261010-1200.xlsx");
    expect(click).toHaveBeenCalled();
    get.mockRestore();
    click.mockRestore();
  });
});
