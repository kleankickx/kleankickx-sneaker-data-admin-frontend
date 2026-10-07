// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { completeVerification, updateSneaker } from "../../lib/api";
import type { SneakerIdentification, SneakerPair } from "../../lib/types";
import VerificationPanel from "./VerificationPanel";

vi.mock("../../lib/api", () => ({
  updateSneaker: vi.fn(),
  completeVerification: vi.fn(),
}));

const pair: SneakerPair = {
  id: "pair-uuid",
  pair_id: "KKX-PAIR-00000042",
  batch: "batch-uuid",
  brand: "Nike",
  model: "Air Max 95",
  sku: "",
  size: "42",
  condition: "b",
  status: "verification",
  created_at: "2026-10-07T10:00:00Z",
  updated_at: "2026-10-07T10:00:00Z",
};

const suggestion: SneakerIdentification = {
  id: "ident",
  sneaker_pair: "pair-uuid",
  brand: "Nike",
  model: "Air Max 90",
  sku: "307960-003",
  size: "",
  source: "ai",
  confidence: "0.8700",
  created_at: "2026-10-07T10:00:00Z",
  updated_at: "2026-10-07T10:00:00Z",
};

function renderPanel(
  props: Partial<Parameters<typeof VerificationPanel>[0]> = {},
) {
  const onSaved = vi.fn();
  const onVerified = vi.fn();
  render(
    <VerificationPanel
      pair={pair}
      suggestion={suggestion}
      blockers={[]}
      checkingEligibility={false}
      onSaved={onSaved}
      onVerified={onVerified}
      {...props}
    />,
  );
  return { onSaved, onVerified };
}

const button = (name: string) => screen.getByRole("button", { name });

// Block body: a function returned from beforeEach runs as a teardown.
beforeEach(() => {
  vi.mocked(updateSneaker).mockReset();
  vi.mocked(completeVerification).mockReset();
});
afterEach(cleanup);

describe("VerificationPanel", () => {
  it("prefills the pair's values and shows AI suggestions beside them", () => {
    renderPanel();

    expect(screen.getByLabelText("Model")).toHaveValue("Air Max 95");
    expect(screen.getByText("Air Max 90")).toBeInTheDocument();
    // Brand already agrees with the AI.
    expect(screen.getByText("· matches")).toBeInTheDocument();
    expect(button("Save changes")).toBeDisabled();
  });

  it("applies a suggestion only when the verifier chooses it", async () => {
    const updated = { ...pair, model: "Air Max 90" };
    vi.mocked(updateSneaker).mockResolvedValue(updated);
    const { onSaved } = renderPanel();

    // Model and SKU each offer "Use"; model comes first.
    fireEvent.click(screen.getAllByRole("button", { name: "Use" })[0]);
    expect(screen.getByLabelText("Model")).toHaveValue("Air Max 90");
    expect(screen.getByText("Unsaved")).toBeInTheDocument();

    fireEvent.click(button("Save changes"));

    await waitFor(() => expect(onSaved).toHaveBeenCalledWith(updated));
    expect(updateSneaker).toHaveBeenCalledWith("pair-uuid", {
      model: "Air Max 90",
    });
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

  it("verifies with every value, including unsaved edits, after confirming", async () => {
    const verified = { ...pair, status: "verified", size: "43" };
    vi.mocked(completeVerification).mockResolvedValue(verified);
    const { onVerified } = renderPanel();

    fireEvent.change(screen.getByLabelText("Size"), {
      target: { value: " 43 " },
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
      condition: "b",
    });
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
    expect(screen.queryByRole("button", { name: "Mark as verified" })).toBeNull();
    expect(screen.getByText("This pair has been verified.")).toBeInTheDocument();
  });
});
