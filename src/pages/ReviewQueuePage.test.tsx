// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";

import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { getReviewQueue } from "../lib/api";
import ReviewQueuePage from "./ReviewQueuePage";

vi.mock("../lib/api", () => ({ getReviewQueue: vi.fn() }));

afterEach(cleanup);

describe("ReviewQueuePage", () => {
  it("lists pairs with their low-confidence fields, linking into the queue", async () => {
    vi.mocked(getReviewQueue).mockResolvedValue({
      results: [
        {
          run_id: "run-1",
          sneaker_pair: "pair-uuid",
          sneaker_pair_id: "KKX-PAIR-00000007",
          status: "verification",
          brand: "Nike",
          model: "Dunk Low",
          low_fields: ["sku", "condition"],
          created_at: "2026-10-07T10:00:00Z",
        },
      ],
      meta: { count: 1, next: null, previous: null },
    });

    render(
      <MemoryRouter>
        <ReviewQueuePage />
      </MemoryRouter>,
    );

    const link = await screen.findByRole("link", { name: /KKX-PAIR-00000007/ });
    expect(link).toHaveAttribute("href", "/sneakers/pair-uuid?from=queue");
    expect(screen.getByText("SKU")).toBeInTheDocument();
    expect(screen.getByText("Condition")).toBeInTheDocument();
    expect(screen.getByText("1 to review")).toBeInTheDocument();
    expect(getReviewQueue).toHaveBeenCalledWith(1, 25);
  });

  it("says so when the queue is empty", async () => {
    vi.mocked(getReviewQueue).mockResolvedValue({
      results: [],
      meta: { count: 0, next: null, previous: null },
    });

    render(
      <MemoryRouter>
        <ReviewQueuePage />
      </MemoryRouter>,
    );

    expect(
      await screen.findByText(/Nothing to review/),
    ).toBeInTheDocument();
  });
});
