// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  api,
  getLatestAiJob,
  getSneaker,
  getVerificationEligibility,
} from "../lib/api";
import type { CaptureImage, SneakerPair } from "../lib/types";
import SneakerDetailsPage from "./SneakerDetailsPage";

vi.mock("../lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../lib/api")>()),
  getSneaker: vi.fn(),
  getLatestAiJob: vi.fn(),
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
  condition: "b",
  status: "received",
  capture_sessions: [
    {
      id: "session",
      is_ready: false,
      images: [image("overview"), image("sole")],
      created_at: "2026-10-07T10:00:00Z",
      updated_at: "2026-10-07T10:00:00Z",
    },
  ],
  created_at: "2026-10-07T10:00:00Z",
  updated_at: "2026-10-07T10:00:00Z",
};

function renderPage() {
  render(
    <MemoryRouter initialEntries={["/sneakers/pair-uuid"]}>
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
    expect(
      await screen.findByText("Sneaker pair must be in verification status."),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Mark as verified" })).toBeDisabled();

    expect(getLatestAiJob).toHaveBeenCalledWith("pair-uuid");
    expect(post).not.toHaveBeenCalled();
  });

  it("switches the main photo when a thumbnail is chosen, including missing angles", async () => {
    vi.mocked(getSneaker).mockResolvedValue(pair);
    vi.mocked(getLatestAiJob).mockResolvedValue(null);
    vi.mocked(getVerificationEligibility).mockRejectedValue(new Error("x"));

    renderPage();

    expect(
      await screen.findByText("2 of 6 angles captured"),
    ).toBeInTheDocument();
    expect(
      screen.getByAltText("Overview view of KKX-PAIR-00000006"),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Sole" }));
    expect(
      screen.getByAltText("Sole view of KKX-PAIR-00000006"),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Left side (missing)" }));
    expect(screen.getByText("No left side photo")).toBeInTheDocument();
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
});
