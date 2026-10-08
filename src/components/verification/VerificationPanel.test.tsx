// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";

import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { createRef } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  completeVerification,
  identifySneaker,
  startIdentification,
  updateSneaker,
} from "../../lib/api";
import type { AnalysisField, SneakerPair } from "../../lib/types";
import type { AiSuggestion } from "../../lib/verification";
import VerificationPanel, { type VerificationPanelHandle } from "./VerificationPanel";

vi.mock("../../lib/api", () => ({
  updateSneaker: vi.fn(),
  completeVerification: vi.fn(),
  startIdentification: vi.fn(),
  identifySneaker: vi.fn(),
}));

const pair: SneakerPair = {
  id: "pair-uuid",
  pair_id: "KKX-PAIR-00000042",
  batch: "batch-uuid",
  brand: "Nike",
  model: "Air Max 95",
  sku: "",
  size: "42",
  colorway: "",
  condition: "good",
  status: "verification",
  materials: [],
  created_at: "2026-10-07T10:00:00Z",
  updated_at: "2026-10-07T10:00:00Z",
};

function field(value: string | null, confidence = 0.9, evidence = "seen"): AnalysisField {
  return { value, confidence, evidence };
}

const suggestion: AiSuggestion = {
  run: null,
  regions: [
    { material_type: "suede", location: "overlays" },
    { material_type: "rubber", location: "outsole" },
  ],
  result: {
    brand: field("Nike", 0.95),
    model: field("Air Max 90", 0.62, "Silhouette on lateral view"),
    sku: field("307960-003", 0.88),
    size: field(null, 0, "Label unreadable"),
    colorway: field("white/black", 0.6),
    condition: field("Fair", 0.7),
    materials: [],
    visible_text: [],
    candidate_matches: [],
    overall_assessment: "",
    limitations: [],
  },
};

function renderPanel(
  props: Partial<Parameters<typeof VerificationPanel>[0]> = {},
) {
  const onSaved = vi.fn();
  const onVerified = vi.fn();
  const onAdvanced = vi.fn();
  render(
    <VerificationPanel
      pair={pair}
      suggestion={suggestion}
      blockers={[]}
      checkingEligibility={false}
      onSaved={onSaved}
      onAdvanced={onAdvanced}
      onVerified={onVerified}
      {...props}
    />,
  );
  return { onSaved, onVerified, onAdvanced };
}

const button = (name: string) => screen.getByRole("button", { name });

/* The block under a field input: AI value, confidence, evidence. */
function fieldBlock(label: string) {
  return screen.getByLabelText(label).parentElement as HTMLElement;
}

// Block body: a function returned from beforeEach runs as a teardown.
beforeEach(() => {
  vi.mocked(updateSneaker).mockReset();
  vi.mocked(completeVerification).mockReset();
  vi.mocked(startIdentification).mockReset();
  vi.mocked(identifySneaker).mockReset();
});
afterEach(cleanup);

describe("VerificationPanel", () => {
  it("shows each field's AI value, confidence and evidence beside it", () => {
    renderPanel();

    expect(screen.getByLabelText("Model")).toHaveValue("Air Max 95");
    const model = within(fieldBlock("Model"));
    expect(model.getByText("Air Max 90")).toBeInTheDocument();
    expect(model.getByText("62%")).toHaveAttribute("title", "Below the review threshold");
    expect(model.getByText("Silhouette on lateral view")).toBeInTheDocument();

    // Brand already agrees with the AI.
    expect(within(fieldBlock("Brand")).getByText("· matches")).toBeInTheDocument();
    expect(within(fieldBlock("Size")).getByText(/AI: no value/)).toBeInTheDocument();
    expect(button("Save changes")).toBeDisabled();
  });

  it("applies a suggestion only when the verifier chooses it", async () => {
    const updated = { ...pair, model: "Air Max 90" };
    vi.mocked(updateSneaker).mockResolvedValue(updated);
    const { onSaved } = renderPanel();

    fireEvent.click(within(fieldBlock("Model")).getByRole("button", { name: "Use" }));
    expect(screen.getByLabelText("Model")).toHaveValue("Air Max 90");
    expect(screen.getByText("Unsaved")).toBeInTheDocument();

    fireEvent.click(button("Save changes"));

    await waitFor(() => expect(onSaved).toHaveBeenCalledWith(updated));
    expect(updateSneaker).toHaveBeenCalledWith("pair-uuid", {
      model: "Air Max 90",
    });
  });

  it("offers the AI's condition grade as a stored value", () => {
    renderPanel();

    const condition = within(fieldBlock("Condition"));
    // Shown by label ("Fair" is also a dropdown option), with confidence.
    expect(condition.getAllByText("Fair")).toHaveLength(2);
    expect(condition.getByText("70%")).toBeInTheDocument();
    fireEvent.click(condition.getByRole("button", { name: "Use" }));

    expect(screen.getByLabelText("Condition")).toHaveValue("fair");
  });

  it("can undo an edit back to the saved value", () => {
    renderPanel();

    fireEvent.change(screen.getByLabelText("Size"), {
      target: { value: "43" },
    });
    fireEvent.click(button("Undo"));

    expect(screen.getByLabelText("Size")).toHaveValue("42");
    expect(button("Save changes")).toBeDisabled();
  });

  it("verifies with every value, colorway and materials, after confirming", async () => {
    const verified = { ...pair, status: "verified", size: "43" };
    vi.mocked(completeVerification).mockResolvedValue(verified);
    const { onVerified } = renderPanel();

    fireEvent.change(screen.getByLabelText("Size"), {
      target: { value: " 43 " },
    });
    fireEvent.change(screen.getByLabelText("Colorway"), {
      target: { value: "Grey/White" },
    });
    fireEvent.click(button("Use AI materials (2)"));
    fireEvent.change(screen.getByLabelText("Region 1"), {
      target: { value: "upper" },
    });
    fireEvent.click(button("Mark as verified"));
    expect(completeVerification).not.toHaveBeenCalled();

    fireEvent.click(button("Confirm verification"));

    await waitFor(() => expect(onVerified).toHaveBeenCalledWith(verified));
    expect(completeVerification).toHaveBeenCalledTimes(1);
    expect(completeVerification).toHaveBeenCalledWith("pair-uuid", {
      brand: "Nike",
      model: "Air Max 95",
      sku: "",
      size: "43",
      colorway: "Grey/White",
      condition: "good",
      materials: [
        { material_type: "suede", location: "upper" },
        { material_type: "rubber", location: "outsole" },
      ],
    });
  });

  it("needs a 5-grade condition before verifying, and notes a legacy grade", () => {
    renderPanel({
      pair: { ...pair, condition: "unknown", legacy_condition: "b" },
    });

    expect(button("Mark as verified")).toBeDisabled();
    expect(screen.getByText("Choose a condition grade.")).toBeInTheDocument();
    expect(screen.getByText(/Earlier A–D grade: B/)).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Condition"), {
      target: { value: "like_new" },
    });
    expect(button("Mark as verified")).toBeEnabled();
  });

  it("edits materials by region", () => {
    renderPanel({
      pair: {
        ...pair,
        materials: [
          {
            id: "m1",
            sneaker_pair: "pair-uuid",
            material_type: "leather",
            location: "upper",
            percentage: null,
            confidence: null,
            source: "human",
            created_at: "",
            updated_at: "",
          },
        ],
      },
    });

    expect(screen.getByLabelText("Material 1")).toHaveValue("leather");
    expect(screen.getByLabelText("Region 1")).toHaveValue("upper");

    fireEvent.click(button("Add material"));
    expect(screen.getByLabelText("Material 2")).toBeInTheDocument();
    fireEvent.click(button("Remove material 1"));
    expect(screen.queryByLabelText("Material 2")).toBeNull();
    expect(screen.getByText("Materials are saved when you mark the pair verified.")).toBeInTheDocument();
  });

  it("applies a candidate match through its handle", () => {
    const ref = createRef<VerificationPanelHandle>();
    renderPanel({ ref });

    act(() => {
      ref.current?.applyCandidate({
        brand: "Nike",
        model: "Dunk Low",
        sku: "DD1391-100",
        confidence: 0.95,
        reason: "catalog",
      });
    });

    expect(screen.getByLabelText("Model")).toHaveValue("Dunk Low");
    expect(screen.getByLabelText("SKU")).toHaveValue("DD1391-100");
  });

  it("disables verification and lists the backend's reasons when blocked", () => {
    renderPanel({
      blockers: ["Sneaker pair must be in verification status."],
    });

    expect(button("Mark as verified")).toBeDisabled();
    expect(
      screen.getByText("Sneaker pair must be in verification status."),
    ).toBeInTheDocument();
  });

  it("shows the server's message, not Axios's, when verifying fails", async () => {
    vi.mocked(completeVerification).mockRejectedValue(
      Object.assign(new Error("Request failed with status code 400"), {
        response: {
          status: 400,
          data: {
            success: false,
            error: { message: "Only pairs in verification can be verified." },
          },
        },
      }),
    );
    renderPanel();

    fireEvent.click(button("Mark as verified"));
    fireEvent.click(button("Confirm verification"));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Only pairs in verification can be verified.",
    );
    expect(screen.queryByText(/status code/)).not.toBeInTheDocument();
  });

  it("uses a friendly message when the server can't be reached", async () => {
    vi.mocked(updateSneaker).mockRejectedValue(new Error("Network Error"));
    renderPanel();

    fireEvent.change(screen.getByLabelText("Brand"), {
      target: { value: "Adidas" },
    });
    fireEvent.click(button("Save changes"));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Could not save changes. Please try again.",
    );
  });

  it("is read-only once the pair is verified", () => {
    renderPanel({ pair: { ...pair, status: "verified" } });

    expect(screen.getByLabelText("Brand")).toBeDisabled();
    expect(screen.getByLabelText("Condition")).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Use" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Mark as verified" })).toBeNull();
    expect(screen.getByText("This pair has been verified.")).toBeInTheDocument();
  });

  it("offers Start identification for a received pair", async () => {
    const moved = { ...pair, status: "identification" };
    vi.mocked(startIdentification).mockResolvedValue(moved);
    const { onAdvanced } = renderPanel({ pair: { ...pair, status: "received" } });

    expect(screen.queryByRole("button", { name: "Mark as verified" })).toBeNull();
    fireEvent.click(button("Start identification"));

    await waitFor(() =>
      expect(onAdvanced).toHaveBeenCalledWith(moved, "Identification started."),
    );
    expect(startIdentification).toHaveBeenCalledWith("pair-uuid");
    expect(updateSneaker).not.toHaveBeenCalled();
  });

  it("saves edits, then confirms the identification", async () => {
    const moved = { ...pair, status: "verification", model: "Air Max 90" };
    vi.mocked(updateSneaker).mockResolvedValue(moved);
    vi.mocked(identifySneaker).mockResolvedValue(moved);
    const { onAdvanced } = renderPanel({
      pair: { ...pair, status: "identification" },
    });

    fireEvent.change(screen.getByLabelText("Model"), {
      target: { value: "Air Max 90" },
    });
    fireEvent.click(button("Confirm identification"));

    await waitFor(() => expect(onAdvanced).toHaveBeenCalled());
    expect(updateSneaker).toHaveBeenCalledWith("pair-uuid", {
      model: "Air Max 90",
    });
    expect(identifySneaker).toHaveBeenCalledWith("pair-uuid", {
      brand: "Nike",
      model: "Air Max 90",
      sku: "",
      size: "42",
    });
    expect(
      vi.mocked(updateSneaker).mock.invocationCallOrder[0],
    ).toBeLessThan(vi.mocked(identifySneaker).mock.invocationCallOrder[0]);
  });
});
