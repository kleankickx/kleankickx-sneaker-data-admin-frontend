// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";

import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { getDashboardActivity } from "../../lib/api";
import RecentActivity from "./RecentActivity";

vi.mock("../../lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../lib/api")>()),
  getDashboardActivity: vi.fn(),
}));

const minutesAgo = (m: number) => new Date(Date.now() - m * 60_000).toISOString();

function renderPanel() {
  return render(<MemoryRouter><RecentActivity /></MemoryRouter>);
}

describe("RecentActivity", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("lists activity with links and relative times", async () => {
    vi.mocked(getDashboardActivity).mockResolvedValue([
      { type: "verified", at: minutesAgo(0), title: "KKX-PAIR-00000412 verified",
        detail: "by reviewer1 · Nike Air Jordan 1", link: { kind: "pair", id: "p1" } },
      { type: "order_pairs", at: minutesAgo(5), title: "2 pairs from KleanKickx order FrwMELkA",
        detail: "Added to Orders – 2026-11-03", link: { kind: "batch", id: "b1" } },
      { type: "batch_created", at: minutesAgo(60 * 50), title: "Batch “Warehouse” created", detail: "", link: null },
    ]);
    renderPanel();

    const verified = await screen.findByText("KKX-PAIR-00000412 verified");
    expect(verified.closest("a")).toHaveAttribute("href", "/sneakers/p1");
    expect(screen.getByText("2 pairs from KleanKickx order FrwMELkA").closest("a")).toHaveAttribute("href", "/batches/b1");
    expect(screen.getByText("by reviewer1 · Nike Air Jordan 1")).toBeInTheDocument();
    expect(screen.getByText("just now")).toBeInTheDocument();
    expect(screen.getByText("5 min ago")).toBeInTheDocument();
    expect(screen.getByText("2 days ago")).toBeInTheDocument();
  });

  it("shows an empty state", async () => {
    vi.mocked(getDashboardActivity).mockResolvedValue([]);
    renderPanel();
    expect(await screen.findByText("No activity yet")).toBeInTheDocument();
  });

  it("says when it couldn't load", async () => {
    vi.mocked(getDashboardActivity).mockRejectedValue(new Error("down"));
    renderPanel();
    expect(await screen.findByText("Recent activity couldn't be loaded.")).toBeInTheDocument();
  });
});
