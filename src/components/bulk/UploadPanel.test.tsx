// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";

import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  cancelBulkUpload,
  retryAllFailed,
  retryPair,
} from "../../lib/bulk-upload-driver";
import {
  useBulkUpload,
  type JobPhase,
  type QueueItem,
} from "../../lib/bulk-upload-store";
import UploadPanel from "./UploadPanel";

vi.mock("../../lib/bulk-upload-driver", () => ({
  cancelBulkUpload: vi.fn(),
  retryAllFailed: vi.fn(async () => {}),
  retryPair: vi.fn(async () => {}),
}));

const ANGLES = ["overview", "top", "left", "right", "sole", "label"];

function pairItems(
  pairId: string,
  pairLabel: string,
  status: (angle: string) => Partial<QueueItem> = () => ({}),
): QueueItem[] {
  return ANGLES.map((angle) => ({
    id: `${pairId}:${angle}`,
    pairId,
    pairLabel,
    angle,
    file: new File(["x"], `${angle}.jpg`),
    status: "queued",
    progress: 0,
    attempts: 0,
    imageId: `img-${pairId}-${angle}`,
    ...status(angle),
  }));
}

function setJob(phase: JobPhase, items: QueueItem[]) {
  act(() => {
    useBulkUpload.setState({ phase, items, batchId: "batch-1" });
  });
}

const panel = () =>
  screen.queryByRole("region", { name: "Bulk upload progress" });

/* The expand/collapse toggle is the only button with aria-expanded. */
const header = () => {
  const button = panel()?.querySelector("button[aria-expanded]");
  if (!button) throw new Error("Header toggle not found.");
  return button;
};

beforeEach(() => {
  useBulkUpload.getState().reset();
  vi.clearAllMocks();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("UploadPanel", () => {
  it("renders nothing when idle", () => {
    render(<UploadPanel />);

    expect(panel()).not.toBeInTheDocument();
  });

  it("is minimized by default while uploading", () => {
    setJob("uploading", [
      ...pairItems("pair-0", "Nike Air Max 90", () => ({ status: "done" })),
      ...pairItems("pair-1", "pair-1"),
    ]);
    render(<UploadPanel />);

    expect(panel()).toBeInTheDocument();
    expect(screen.getByText("Uploading 2 pairs")).toBeInTheDocument();
    expect(header()).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText(/Pair 1 —/)).not.toBeInTheDocument();
    expect(
      screen.getByRole("progressbar", { name: "Overall upload progress" }),
    ).toHaveAttribute("aria-valuenow", "50");
  });

  it("counts in-flight progress in the overall bar", () => {
    setJob(
      "uploading",
      pairItems("pair-0", "pair-0", (angle) =>
        angle === "overview"
          ? { status: "uploading", progress: 60 }
          : { status: "queued" },
      ),
    );
    render(<UploadPanel />);

    expect(
      screen.getByRole("progressbar", { name: "Overall upload progress" }),
    ).toHaveAttribute("aria-valuenow", "10");
  });

  it("toggles open from the header button", () => {
    setJob("uploading", pairItems("pair-0", "pair-0"));
    render(<UploadPanel />);

    fireEvent.click(header());

    expect(header()).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("Pair 1 — pair-0")).toBeInTheDocument();
  });

  it("expands automatically when the job fails", () => {
    setJob("uploading", pairItems("pair-0", "pair-0"));
    render(<UploadPanel />);
    expect(header()).toHaveAttribute("aria-expanded", "false");

    setJob(
      "failed",
      pairItems("pair-0", "pair-0", (angle) =>
        angle === "top"
          ? { status: "failed", error: "Upload failed (500)" }
          : { status: "done" },
      ),
    );

    expect(header()).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText(/Upload failed \(500\)/)).toBeInTheDocument();
  });

  it("renders a row per pair with its status", () => {
    setJob("failed", [
      ...pairItems("pair-0", "Nike Air Max 90", () => ({ status: "done" })),
      ...pairItems("pair-1", "Adidas Samba", (angle) =>
        angle === "top"
          ? { status: "uploading", progress: 62 }
          : { status: "queued" },
      ),
      ...pairItems("pair-2", "New Balance 574", (angle) =>
        angle === "top"
          ? { status: "failed", error: "Upload failed (500)" }
          : { status: "done" },
      ),
    ]);
    render(<UploadPanel />);

    const rows = within(panel()!).getAllByRole("listitem").filter((li) =>
      /^Pair \d/.test(li.textContent ?? ""),
    );
    expect(rows.map((r) => r.querySelector("p")?.textContent)).toEqual([
      "Pair 1 — Nike Air Max 90",
      "Pair 2 — Adidas Samba",
      "Pair 3 — New Balance 574",
    ]);
    expect(within(rows[0]).getByText("✓ done")).toBeInTheDocument();
    expect(within(rows[1]).getByText("uploading")).toBeInTheDocument();
    expect(within(rows[2]).getByText("failed")).toBeInTheDocument();
    expect(screen.getByText(/11 \/ 18 images/)).toBeInTheDocument();
  });

  it("retries a single pair", () => {
    setJob("failed", [
      ...pairItems("pair-0", "pair-0", () => ({ status: "done" })),
      ...pairItems("pair-1", "pair-1", (angle) =>
        angle === "sole"
          ? { status: "failed", error: "Network error" }
          : { status: "done" },
      ),
    ]);
    render(<UploadPanel />);

    fireEvent.click(screen.getByRole("button", { name: "Retry pair 2" }));

    expect(retryPair).toHaveBeenCalledWith("pair-1");
    // Only one failing pair, so no "Retry all failed".
    expect(
      screen.queryByRole("button", { name: "Retry all failed" }),
    ).not.toBeInTheDocument();
  });

  it("retries all failures across pairs", () => {
    const failTop = (angle: string): Partial<QueueItem> =>
      angle === "top"
        ? { status: "failed", error: "Network error" }
        : { status: "done" };
    setJob("failed", [
      ...pairItems("pair-0", "pair-0", failTop),
      ...pairItems("pair-1", "pair-1", failTop),
    ]);
    render(<UploadPanel />);

    fireEvent.click(screen.getByRole("button", { name: "Retry all failed" }));

    expect(retryAllFailed).toHaveBeenCalledTimes(1);
  });

  it("hides retry for failures without an uploaded image id", () => {
    setJob(
      "failed",
      pairItems("pair-0", "pair-0", () => ({
        status: "failed",
        imageId: undefined,
        error: "Pair could not be created: Batch is closed.",
      })),
    );
    render(<UploadPanel />);

    expect(
      screen.queryByRole("button", { name: /Retry/ }),
    ).not.toBeInTheDocument();
  });

  it("cancels a running upload", () => {
    setJob("uploading", pairItems("pair-0", "pair-0"));
    render(<UploadPanel />);

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(cancelBulkUpload).toHaveBeenCalledTimes(1);
  });

  it("offers no cancel once the job has failed, but can be dismissed", () => {
    setJob(
      "failed",
      pairItems("pair-0", "pair-0", () => ({ status: "failed" })),
    );
    render(<UploadPanel />);

    expect(
      screen.queryByRole("button", { name: "Cancel" }),
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));

    expect(useBulkUpload.getState().phase).toBe("idle");
    expect(panel()).not.toBeInTheDocument();
  });

  it("shows done for three seconds, then clears", () => {
    vi.useFakeTimers();
    setJob("done", pairItems("pair-0", "pair-0", () => ({ status: "done" })));
    render(<UploadPanel />);

    expect(screen.getByText("Uploaded 1 pair")).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(2999);
    });
    expect(panel()).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(useBulkUpload.getState().phase).toBe("idle");
    expect(panel()).not.toBeInTheDocument();
  });
});
