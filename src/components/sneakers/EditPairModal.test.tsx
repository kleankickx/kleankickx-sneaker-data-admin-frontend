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

import { updateSneaker } from "../../lib/api";
import type { SneakerPair } from "../../lib/types";
import EditPairModal from "./EditPairModal";

vi.mock("../../lib/api", () => ({ updateSneaker: vi.fn() }));

const pair: SneakerPair = {
  id: "pair-uuid",
  pair_id: "KKX-PAIR-00000042",
  batch: "batch-uuid",
  brand: "Nike",
  model: "Air Max 90",
  sku: null,
  size: "42",
  condition: "like_new",
  status: "received",
  created_at: "2026-10-07T10:00:00Z",
  updated_at: "2026-10-07T10:00:00Z",
};

function renderModal(onSaved = vi.fn(), onClose = vi.fn()) {
  render(<EditPairModal pair={pair} onClose={onClose} onSaved={onSaved} />);
  return { onSaved, onClose };
}

const save = () => screen.getByRole("button", { name: "Save changes" });

/* Axios rejects with an Error carrying the response. */
function apiError(error: object): Error {
  return Object.assign(new Error("Request failed with status code 400"), {
    response: { status: 400, data: { success: false, error } },
  });
}

// Block body: a function returned from beforeEach runs as a teardown,
// and mockReset() returns the mock itself.
beforeEach(() => {
  vi.mocked(updateSneaker).mockReset();
});
afterEach(cleanup);

describe("EditPairModal", () => {
  it("renders nothing without a pair", () => {
    render(<EditPairModal pair={null} onClose={() => {}} onSaved={() => {}} />);

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("prefills the form and enforces the server's max lengths", () => {
    renderModal();

    expect(screen.getByLabelText("Brand")).toHaveValue("Nike");
    expect(screen.getByLabelText("SKU")).toHaveValue("");
    expect(screen.getByLabelText("Condition")).toHaveValue("like_new");
    expect(screen.getByLabelText("Size")).toHaveAttribute("maxLength", "50");
    expect(save()).toBeDisabled();
  });

  it("sends only the changed, trimmed fields", async () => {
    const updated = { ...pair, brand: "New Balance", condition: "good" };
    vi.mocked(updateSneaker).mockResolvedValue(updated);
    const { onSaved } = renderModal();

    fireEvent.change(screen.getByLabelText("Brand"), {
      target: { value: "  New Balance " },
    });
    fireEvent.change(screen.getByLabelText("Condition"), {
      target: { value: "good" },
    });
    fireEvent.click(save());

    await waitFor(() => expect(onSaved).toHaveBeenCalledWith(updated));
    expect(updateSneaker).toHaveBeenCalledWith("pair-uuid", {
      brand: "New Balance",
      condition: "good",
    });
  });

  it("shows server field errors next to the field", async () => {
    vi.mocked(updateSneaker).mockRejectedValue(
      apiError({
        message: "One or more fields are invalid.",
        fields: { size: ["Ensure this field has no more than 20 characters."] },
      }),
    );
    const { onSaved } = renderModal();

    fireEvent.change(screen.getByLabelText("Size"), {
      target: { value: "43" },
    });
    fireEvent.click(save());

    expect(
      await screen.findByText("Ensure this field has no more than 20 characters."),
    ).toBeInTheDocument();
    expect(onSaved).not.toHaveBeenCalled();
    expect(save()).toBeEnabled();
  });

  it("shows a non-field error as the main message", async () => {
    vi.mocked(updateSneaker).mockRejectedValue(
      apiError({
        message: "One or more fields are invalid.",
        fields: { non_field_errors: ["These fields can't be edited: ['status']"] },
      }),
    );
    renderModal();

    fireEvent.change(screen.getByLabelText("Model"), {
      target: { value: "Air Max 1" },
    });
    fireEvent.click(save());

    expect(
      await screen.findByRole("alert"),
    ).toHaveTextContent("These fields can't be edited: ['status']");
  });

  it("closes on Cancel and Escape", () => {
    const { onClose } = renderModal();

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });

    expect(onClose).toHaveBeenCalledTimes(2);
  });
});
