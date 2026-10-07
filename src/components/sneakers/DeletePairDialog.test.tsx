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

import {
  deleteSneaker,
  getSneakerDeletionPreview,
  type PairDeletionPreview,
} from "../../lib/api";
import type { SneakerPair } from "../../lib/types";
import DeletePairDialog from "./DeletePairDialog";

vi.mock("../../lib/api", () => ({
  deleteSneaker: vi.fn(),
  getSneakerDeletionPreview: vi.fn(),
}));

const pair: SneakerPair = {
  id: "pair-uuid",
  pair_id: "KKX-PAIR-00000042",
  batch: "batch-uuid",
  brand: "Nike",
  model: "Air Max 90",
  sku: null,
  size: "42",
  condition: "a",
  status: "received",
  created_at: "2026-10-07T10:00:00Z",
  updated_at: "2026-10-07T10:00:00Z",
};

const preview: PairDeletionPreview = {
  capture_sessions: 1,
  images: 6,
  stored_files: 6,
  identifications: 1,
  materials: 0,
  ai_jobs: 1,
  is_verified: false,
};

const deleteButton = () => screen.getByRole("button", { name: "Delete pair" });

function renderDialog(onDeleted = vi.fn()) {
  render(
    <DeletePairDialog pair={pair} onClose={() => {}} onDeleted={onDeleted} />,
  );
  return onDeleted;
}

beforeEach(() => {
  vi.mocked(deleteSneaker).mockReset();
  vi.mocked(getSneakerDeletionPreview).mockReset().mockResolvedValue(preview);
});
afterEach(cleanup);

describe("DeletePairDialog", () => {
  it("lists what will be deleted, skipping empty parts", async () => {
    renderDialog();

    expect(
      screen.getByRole("heading", { name: "Delete KKX-PAIR-00000042?" }),
    ).toBeInTheDocument();
    expect(
      await screen.findByText(
        "6 photos (6 files removed from image storage)",
      ),
    ).toBeInTheDocument();
    expect(screen.getByText("1 identification")).toBeInTheDocument();
    expect(screen.getByText("1 AI identification job")).toBeInTheDocument();
    expect(screen.queryByText(/material/)).not.toBeInTheDocument();
  });

  it("deletes and reports the result", async () => {
    const result = { id: "pair-uuid", pair_id: "KKX-PAIR-00000042", deleted: preview };
    vi.mocked(deleteSneaker).mockResolvedValue(result);
    const onDeleted = renderDialog();

    await waitFor(() => expect(deleteButton()).toBeEnabled());
    fireEvent.click(deleteButton());

    await waitFor(() => expect(onDeleted).toHaveBeenCalledWith(result));
    expect(deleteSneaker).toHaveBeenCalledWith("pair-uuid");
  });

  it("requires acknowledgement for a verified pair", async () => {
    vi.mocked(getSneakerDeletionPreview).mockResolvedValue({
      ...preview,
      is_verified: true,
    });
    renderDialog();

    expect(
      await screen.findByText("This pair has already been verified."),
    ).toBeInTheDocument();
    expect(deleteButton()).toBeDisabled();

    fireEvent.click(
      screen.getByLabelText("I understand its verification will be lost."),
    );

    expect(deleteButton()).toBeEnabled();
  });

  it("still allows deleting when the preview can't load", async () => {
    vi.mocked(getSneakerDeletionPreview).mockRejectedValue(new Error("500"));
    renderDialog();

    expect(
      await screen.findByText(/Couldn't load the details/),
    ).toBeInTheDocument();
    expect(deleteButton()).toBeEnabled();
  });

  it("shows the server error and lets the user try again", async () => {
    vi.mocked(deleteSneaker).mockRejectedValue({
      response: { data: { error: { message: "Not found." } } },
    });
    const onDeleted = renderDialog();

    await waitFor(() => expect(deleteButton()).toBeEnabled());
    fireEvent.click(deleteButton());

    expect(await screen.findByRole("alert")).toHaveTextContent("Not found.");
    expect(deleteButton()).toBeEnabled();
    expect(onDeleted).not.toHaveBeenCalled();
  });
});
