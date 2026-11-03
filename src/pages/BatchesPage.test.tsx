// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";

import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { getBatches } from "../lib/api";
import type { Batch } from "../lib/types";
import BatchesPage from "./BatchesPage";

vi.mock("../lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../lib/api")>()),
  getBatches: vi.fn(),
}));

function batch(fields: Partial<Batch>): Batch {
  return {
    id: "b1",
    batch_id: "KKX-BAT-00000001",
    name: "Intake",
    source: "warehouse",
    expected_quantity: 40,
    status: "open",
    received_at: null,
    created_at: "2026-11-03T09:00:00Z",
    updated_at: "2026-11-03T09:00:00Z",
    ...fields,
  };
}

describe("BatchesPage", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("shows batches without an expected quantity (KleanKickx order batches)", async () => {
    vi.mocked(getBatches).mockResolvedValue({
      results: [
        batch({}),
        batch({ id: "b2", batch_id: "KKX-BAT-00000002", name: "Orders – 2026-11-03",
                source: "kleankickx-orders", expected_quantity: null }),
      ],
      meta: { count: 2 },
    } as Awaited<ReturnType<typeof getBatches>>);

    render(<MemoryRouter><BatchesPage /></MemoryRouter>);

    const row = (await screen.findByText("Orders – 2026-11-03")).closest("tr")!;
    expect(within(row).getByText("—")).toBeInTheDocument();
    expect(screen.getByText("40")).toBeInTheDocument();

    // Sorting by quantity must not crash either.
    fireEvent.click(screen.getByRole("button", { name: /quantity/i }));
    expect(screen.getByText("Orders – 2026-11-03")).toBeInTheDocument();
  });
});
