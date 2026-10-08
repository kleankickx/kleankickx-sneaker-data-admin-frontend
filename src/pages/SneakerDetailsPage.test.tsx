// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  api,
  getLatestAiJob,
  getLatestAnalysisRun,
  getReviewQueueNeighbors,
  getSneaker,
  getVerificationEligibility,
} from "../lib/api";
import type { AnalysisRun, CaptureImage, SneakerPair } from "../lib/types";
import SneakerDetailsPage from "./SneakerDetailsPage";

vi.mock("../lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../lib/api")>()),
  getSneaker: vi.fn(),
  getLatestAiJob: vi.fn(),
  getLatestAnalysisRun: vi.fn(),
  getReviewQueueNeighbors: vi.fn(),
  getVerificationEligibility: vi.fn(),
}));

function image(angle: string): CaptureImage {
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
  };
}

const pair: SneakerPair = {
  id: "pair-uuid",
  pair_id: "KKX-PAIR-00000006",
  batch: "batch-uuid",
  brand: "Nike",
  model: "Air Max 95",
  sku: "",
  size: "42",
  condition: "good",
  status: "received",
  capture_sessions: [
    {
      id: "session",
      is_ready: false,
      images: [image("front"), image("sole"), image("overview")],
      created_at: "2026-10-07T10:00:00Z",
      updated_at: "2026-10-07T10:00:00Z",
    },
  ],
  created_at: "2026-10-07T10:00:00Z",
  updated_at: "2026-10-07T10:00:00Z",
};

function renderPage(entry = "/sneakers/pair-uuid") {
  render(
    <MemoryRouter initialEntries={[entry]}>
      <Routes>
        <Route path="/sneakers/:sneakerId" element={<SneakerDetailsPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

// Block body: a function returned from beforeEach runs as a teardown.
beforeEach(() => {
  vi.mocked(getSneaker).mockReset();
  vi.mocked(getLatestAiJob).mockReset();
  vi.mocked(getLatestAnalysisRun).mockReset().mockResolvedValue(null);
  vi.mocked(getReviewQueueNeighbors).mockReset();
  vi.mocked(getVerificationEligibility).mockReset();
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("SneakerDetailsPage", () => {
  it("loads the pair without requesting AI analysis or changing anything", async () => {
    const post = vi.spyOn(api, "post");
    vi.mocked(getSneaker).mockResolvedValue(pair);
    vi.mocked(getLatestAiJob).mockResolvedValue(null);
    vi.mocked(getVerificationEligibility).mockResolvedValue({
      sneaker_pair_id: "KKX-PAIR-00000006",
      eligible: false,
      checks: {
        status_ready: false,
        has_identification: false,
        has_ready_capture: false,
      },
      reasons: ["Sneaker pair must be in verification status."],
    });

    renderPage();

    expect(
      await screen.findByRole("heading", { name: "KKX-PAIR-00000006" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Nike Air Max 95")).toBeInTheDocument();
    expect(
      await screen.findByText("AI analysis not available yet"),
    ).toBeInTheDocument();
    // A received pair is offered the first workflow step, not verification.
    expect(
      screen.getByRole("button", { name: "Start identification" }),
    ).toBeEnabled();
    expect(
      screen.queryByRole("button", { name: "Mark as verified" }),
    ).not.toBeInTheDocument();

    expect(getLatestAiJob).toHaveBeenCalledWith("pair-uuid");
    expect(getLatestAnalysisRun).toHaveBeenCalledWith("pair-uuid");
    expect(getReviewQueueNeighbors).not.toHaveBeenCalled();
    expect(post).not.toHaveBeenCalled();
    // The first render in this file pays the cold import cost.
  }, 15_000);

  it("switches the main photo when a thumbnail is chosen, including missing angles", async () => {
    vi.mocked(getSneaker).mockResolvedValue(pair);
    vi.mocked(getLatestAiJob).mockResolvedValue(null);
    vi.mocked(getVerificationEligibility).mockRejectedValue(new Error("x"));

    renderPage();

    expect(
      await screen.findByText("2 of 6 angles captured"),
    ).toBeInTheDocument();
    expect(
      screen.getByAltText("Front view of KKX-PAIR-00000006"),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Sole" }));
    expect(
      screen.getByAltText("Sole view of KKX-PAIR-00000006"),
    ).toBeInTheDocument();

    // Overview is an extra view, after the six.
    fireEvent.click(screen.getByRole("button", { name: "Overview" }));
    expect(
      screen.getByAltText("Overview view of KKX-PAIR-00000006"),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Lateral side (missing)" }));
    expect(screen.getByText("No lateral side photo")).toBeInTheDocument();
  });

  it("shows a friendly error with retry and back when the pair can't load", async () => {
    vi.mocked(getSneaker).mockRejectedValueOnce(
      Object.assign(new Error("Request failed with status code 404"), {
        response: { status: 404, data: {} },
      }),
    );
    vi.mocked(getLatestAiJob).mockResolvedValue(null);
    vi.mocked(getVerificationEligibility).mockRejectedValue(new Error("x"));

    renderPage();

    expect(
      await screen.findByText(
        "This sneaker pair doesn't exist or has been deleted.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText(/status code/)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Go back/ })).toBeInTheDocument();

    vi.mocked(getSneaker).mockResolvedValue(pair);
    fireEvent.click(screen.getByRole("button", { name: /Try again/ }));

    expect(
      await screen.findByRole("heading", { name: "KKX-PAIR-00000006" }),
    ).toBeInTheDocument();
  });

  it("shows the latest analysis and applies a candidate match to the form", async () => {
    const field = (value: string | null, confidence = 0.9) => ({
      value,
      confidence,
      evidence: "seen",
    });
    const run: AnalysisRun = {
      id: "run",
      sneaker_pair: "pair-uuid",
      sneaker_pair_id: "KKX-PAIR-00000006",
      result: {
        brand: field("Nike"),
        model: field("Air Max 95", 0.6),
        sku: field(null, 0),
        size: field("US 9"),
        colorway: field("black/white", 0.6),
        condition: field("Good", 0.7),
        materials: [],
        visible_text: ["NIKE AIR"],
        candidate_matches: [
          { brand: "Nike", model: "Air Max 95 OG", sku: "AT2865-100",
            confidence: 0.7, reason: "Same brand/model in catalog" },
        ],
        overall_assessment: "Worn Air Max 95.",
        limitations: ["Missing front view"],
      },
      regions: [],
      prompt_version: "fdc-v1",
      provider: "openai",
      model_name: "vision-1",
      vlm_used: true,
      vlm_error: "",
      duration_ms: 10,
      created_at: "2026-10-07T10:00:00Z",
    };
    vi.mocked(getSneaker).mockResolvedValue({ ...pair, status: "verification" });
    vi.mocked(getLatestAiJob).mockResolvedValue(null);
    vi.mocked(getLatestAnalysisRun).mockResolvedValue(run);
    vi.mocked(getVerificationEligibility).mockRejectedValue(new Error("x"));

    renderPage();

    expect(await screen.findByText("Worn Air Max 95.")).toBeInTheDocument();
    expect(screen.getByText("NIKE AIR")).toBeInTheDocument();
    expect(screen.getByText("Missing front view")).toBeInTheDocument();
    expect(screen.getByText(/vision-1 · prompt fdc-v1/)).toBeInTheDocument();

    const candidates = screen.getByText("AT2865-100").closest("li") as HTMLElement;
    fireEvent.click(candidates.querySelector("button") as HTMLElement);

    expect(screen.getByLabelText("Model")).toHaveValue("Air Max 95 OG");
    expect(screen.getByLabelText("SKU")).toHaveValue("AT2865-100");
  });

  it("offers previous/next when opened from the review queue", async () => {
    vi.mocked(getSneaker).mockResolvedValue(pair);
    vi.mocked(getLatestAiJob).mockResolvedValue(null);
    vi.mocked(getVerificationEligibility).mockRejectedValue(new Error("x"));
    vi.mocked(getReviewQueueNeighbors).mockResolvedValue({
      position: 2,
      total: 5,
      previous: "prev-uuid",
      next: "next-uuid",
    });

    renderPage("/sneakers/pair-uuid?from=queue");

    expect(await screen.findByText("Review queue · 2 of 5")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Previous/ })).toHaveAttribute(
      "href",
      "/sneakers/prev-uuid?from=queue",
    );
    expect(screen.getByRole("link", { name: /Next/ })).toHaveAttribute(
      "href",
      "/sneakers/next-uuid?from=queue",
    );
  });
});
