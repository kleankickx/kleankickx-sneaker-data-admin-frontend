// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";

import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import ActivityWatcher from "../ActivityWatcher";
import { setWatchedBulkRuns, watchBulkRun, watchedBulkRuns } from "../../lib/activity";
import { listBulkRuns, type BulkRun } from "../../lib/bulk-runs";
import { toast } from "../../lib/toast";
import InfoTip from "./InfoTip";
import Toaster from "./Toaster";

vi.mock("../../lib/bulk-runs", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../lib/bulk-runs")>()),
  listBulkRuns: vi.fn(),
}));

function renderToaster(extra: React.ReactNode = null) {
  render(
    <MemoryRouter>
      <Routes>
        <Route path="/" element={<p>Home</p>} />
        <Route path="/pipeline-monitor/bulk/:id" element={<p>Bulk page</p>} />
      </Routes>
      <Toaster />
      {extra}
    </MemoryRouter>,
  );
}

afterEach(() => {
  cleanup();
  act(() => toast.reset());
  window.localStorage.clear();
  vi.clearAllMocks();
  vi.useRealTimers();
});

describe("toasts", () => {
  it("shows, auto-dismisses and closes notifications", () => {
    vi.useFakeTimers();
    renderToaster();

    act(() => {
      toast.success("Batch created.");
      toast.error("Couldn't save.", { title: "Export failed" });
    });
    expect(screen.getByRole("status")).toHaveTextContent("Batch created.");
    // Failures interrupt screen readers; successes don't.
    expect(screen.getByRole("alert")).toHaveTextContent("Export failedCouldn't save.");

    act(() => vi.advanceTimersByTime(4100));
    expect(screen.queryByText("Batch created.")).not.toBeInTheDocument();
    expect(screen.getByText("Couldn't save.")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Dismiss notification" }));
    expect(screen.queryByText("Couldn't save.")).not.toBeInTheDocument();
  });

  it("keeps a notification while it's hovered, and doesn't stack duplicates", () => {
    vi.useFakeTimers();
    renderToaster();

    act(() => {
      toast.success("Saved.");
      toast.success("Saved.");
    });
    expect(screen.getAllByText("Saved.")).toHaveLength(1);

    fireEvent.mouseEnter(screen.getByRole("status"));
    act(() => vi.advanceTimersByTime(10_000));
    expect(screen.getByText("Saved.")).toBeInTheDocument();

    fireEvent.mouseLeave(screen.getByRole("status"));
    act(() => vi.advanceTimersByTime(4100));
    expect(screen.queryByText("Saved.")).not.toBeInTheDocument();
  });

  it("follows an action link and dismisses itself", () => {
    renderToaster();
    act(() => {
      toast.info("Done.", { action: { label: "View", to: "/pipeline-monitor/bulk/b1" }, duration: 0 });
    });
    fireEvent.click(screen.getByRole("link", { name: "View" }));
    expect(screen.getByText("Bulk page")).toBeInTheDocument();
    expect(screen.queryByText("Done.")).not.toBeInTheDocument();
  });
});

describe("InfoTip", () => {
  it("explains on hover, focus and tap, and closes on Escape", () => {
    render(<InfoTip label="About image counts">Needs all 6 angles.</InfoTip>);
    const button = screen.getByRole("button", { name: "About image counts" });
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();

    fireEvent.focus(button);
    expect(screen.getByRole("tooltip")).toHaveTextContent("Needs all 6 angles.");
    expect(button).toHaveAccessibleDescription("Needs all 6 angles.");

    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();

    fireEvent.click(button);
    expect(screen.getByRole("tooltip")).toBeInTheDocument();
  });
});

function bulk(id: string, status: BulkRun["status"], extra: Partial<BulkRun> = {}): BulkRun {
  return {
    id, label: `BATCH-0007: ${id}`, status, pause_reason: "", source_batch: "b1", scope: "no_result",
    overrides: {}, is_test: false, to_stage: 7, created_by: "ops", created_at: "2026-10-13T10:00:00Z", finished_at: null,
    counts: { queued: 0, running: 0, succeeded: 3, needs_attention: 1, failed: 0, skipped: 0, cancelled: 0, total: 4, waiting_retry: 0 },
    ...extra,
  };
}

describe("ActivityWatcher", () => {
  it("announces watched bulk runs that finish or pause, and keeps waiting on the rest", async () => {
    setWatchedBulkRuns(["done", "paused", "running"]);
    vi.mocked(listBulkRuns).mockResolvedValue([
      bulk("done", "completed"),
      bulk("paused", "paused", { pause_reason: "Quota reached." }),
      bulk("running", "running"),
      bulk("someone-elses", "completed"),
    ]);
    renderToaster(<ActivityWatcher />);

    expect(await screen.findByText("Bulk run finished: BATCH-0007: done")).toBeInTheDocument();
    expect(screen.getByText("3 succeeded, 1 need a look")).toBeInTheDocument();
    expect(screen.getByText("Bulk run paused: BATCH-0007: paused")).toBeInTheDocument();
    expect(screen.getByText("Quota reached.")).toBeInTheDocument();
    expect(screen.queryByText(/someone-elses/)).not.toBeInTheDocument();
    expect(watchedBulkRuns()).toEqual(["running"]);
  });

  it("doesn't ask the server when nothing is being watched", () => {
    renderToaster(<ActivityWatcher />);
    expect(listBulkRuns).not.toHaveBeenCalled();
  });

  it("says when the connection drops and comes back", () => {
    renderToaster(<ActivityWatcher />);
    act(() => {
      window.dispatchEvent(new Event("offline"));
    });
    expect(screen.getByText("You're offline")).toBeInTheDocument();
    act(() => {
      window.dispatchEvent(new Event("online"));
    });
    expect(screen.queryByText("You're offline")).not.toBeInTheDocument();
    expect(screen.getByText("You're back online.")).toBeInTheDocument();
  });

  it("remembers each run once", () => {
    watchBulkRun("a");
    watchBulkRun("a");
    watchBulkRun("b");
    expect(watchedBulkRuns()).toEqual(["a", "b"]);
  });
});
