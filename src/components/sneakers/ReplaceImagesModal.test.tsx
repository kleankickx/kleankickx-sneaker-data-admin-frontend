// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  completeImageReplacement,
  getUploadConfig,
  startImageReplacement,
} from "../../lib/api";
import { uploadToSlot } from "../../lib/direct-upload";
import type { CaptureImage, SneakerPair } from "../../lib/types";
import ReplaceImagesModal from "./ReplaceImagesModal";

vi.mock("../../lib/api", () => ({
  completeImageReplacement: vi.fn(),
  getUploadConfig: vi.fn(),
  startImageReplacement: vi.fn(),
}));
vi.mock("../../lib/direct-upload", () => ({ uploadToSlot: vi.fn() }));

const ANGLES = ["front", "top", "lateral", "medial", "sole", "label"];

function image(angle: string): CaptureImage {
  return {
    id: `old-${angle}`,
    idempotency_key: "k",
    angle,
    content_type: "image/jpeg",
    status: "uploaded",
    storage_key: `old/${angle}`,
    image_url: `https://img.test/${angle}.jpg`,
    original_filename: `${angle}.jpg`,
    captured_at: null,
    created_at: "2026-10-07T10:00:00Z",
    updated_at: "2026-10-07T10:00:00Z",
  };
}

function makePair(status = "received"): SneakerPair {
  return {
    id: "pair-uuid",
    pair_id: "KKX-PAIR-00000042",
    batch: "batch-uuid",
    brand: "Nike",
    model: null,
    sku: null,
    size: null,
    condition: "unknown",
    status,
    capture_sessions: [
      {
        id: "s1",
        is_ready: true,
        images: ANGLES.map(image),
        created_at: "",
        updated_at: "",
      },
    ],
    created_at: "",
    updated_at: "",
  };
}

function file(name: string, size = 10): File {
  return new File([new Uint8Array(size)], name);
}

let onReplaced: ReturnType<typeof vi.fn<(count: number, finished: boolean) => void>>;

function renderModal(status = "received") {
  onReplaced = vi.fn<(count: number, finished: boolean) => void>();
  return render(
    <ReplaceImagesModal
      pair={makePair(status)}
      onClose={() => {}}
      onReplaced={onReplaced}
    />,
  );
}

function pick(angle: string, picked: File) {
  fireEvent.click(
    screen.getByRole("button", { name: `Choose new ${angle} photo` }),
  );
  fireEvent.change(
    document.querySelector('input[type="file"][aria-hidden="true"]')!,
    { target: { files: [picked] } },
  );
}

const tile = (angle: string) => screen.getByRole("listitem", { name: angle });
const replaceButton = () =>
  screen.getByRole("button", { name: /^(Replace \d|Replace photos|Try again)/ });

function slotFor(angle: string) {
  return {
    angle,
    image_id: `new-${angle}`,
    upload: { upload_url: "https://upload.test/", fields: { public_id: angle } },
  };
}

beforeEach(() => {
  vi.mocked(getUploadConfig).mockReset().mockRejectedValue(new Error("404"));
  vi.mocked(startImageReplacement)
    .mockReset()
    .mockImplementation(async (_id, uploads) => uploads.map((u) => slotFor(u.angle)));
  vi.mocked(uploadToSlot).mockReset().mockResolvedValue(undefined);
  vi.mocked(completeImageReplacement)
    .mockReset()
    .mockImplementation(async (_id, ids) => ({
      replaced: ids.map((id) => ({ image_id: id, angle: id.slice(4) })),
      failed: [],
    }));
  vi.stubGlobal(
    "URL",
    Object.assign(URL, {
      createObjectURL: vi.fn(() => "blob:preview"),
      revokeObjectURL: vi.fn(),
    }),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("ReplaceImagesModal", () => {
  it("shows the current photo for every angle", () => {
    renderModal();

    for (const angle of ANGLES) {
      expect(
        within(tile(angle)).getByAltText(`Current ${angle} photo`),
      ).toHaveAttribute("src", `https://img.test/${angle}.jpg`);
    }
    expect(replaceButton()).toBeDisabled();
  });

  it("refuses verified pairs", () => {
    renderModal("verified");

    expect(
      screen.getByText(
        "This pair has been verified, so its photos can't be changed.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Replace/ })).toBeNull();
  });

  it("marks picked photos as new and can undo them", () => {
    renderModal();

    pick("top", file("new-top.jpg"));

    expect(within(tile("top")).getByText("New")).toBeInTheDocument();
    expect(replaceButton()).toHaveTextContent("Replace 1 photo");

    fireEvent.click(within(tile("top")).getByRole("button", { name: "Undo" }));

    expect(within(tile("top")).queryByText("New")).toBeNull();
    expect(replaceButton()).toBeDisabled();
  });

  it("rejects unsupported and oversized files", async () => {
    vi.mocked(getUploadConfig).mockResolvedValue({
      max_capture_image_size: 100,
      allowed_content_types: ["image/jpeg"],
      required_angles: ANGLES,
      extension_to_content_type: { jpg: "image/jpeg" },
    });
    renderModal();
    await waitFor(() => expect(getUploadConfig).toHaveBeenCalled());
    await Promise.resolve();

    pick("top", file("top.gif"));
    expect(within(tile("top")).getByRole("alert")).toHaveTextContent(
      "Unsupported file type",
    );

    pick("sole", file("sole.jpg", 200));
    expect(within(tile("sole")).getByRole("alert")).toHaveTextContent(
      "200 B is over the 100 B limit.",
    );
    expect(replaceButton()).toBeDisabled();
  });

  it("uploads, confirms and reports the replacement", async () => {
    renderModal();
    pick("top", file("top.HEIC"));
    pick("sole", file("sole.jpg"));

    fireEvent.click(replaceButton());

    await waitFor(() => expect(onReplaced).toHaveBeenCalledWith(2, true));
    expect(startImageReplacement).toHaveBeenCalledWith("pair-uuid", [
      {
        angle: "top",
        file_size: 10,
        content_type: "image/heic",
        original_filename: "top.HEIC",
      },
      {
        angle: "sole",
        file_size: 10,
        content_type: "image/jpeg",
        original_filename: "sole.jpg",
      },
    ]);
    expect(uploadToSlot).toHaveBeenCalledTimes(2);
    expect(completeImageReplacement).toHaveBeenCalledWith(
      "pair-uuid",
      expect.arrayContaining(["new-top", "new-sole"]),
    );
    expect(within(tile("top")).getByText("Replaced")).toBeInTheDocument();
  });

  it("keeps failed angles picked and retries only those", async () => {
    vi.mocked(uploadToSlot).mockImplementation(async (slot) => {
      if (slot.fields.public_id === "sole") throw new Error("Network error");
    });
    renderModal();
    pick("top", file("top.jpg"));
    pick("sole", file("sole.jpg"));

    fireEvent.click(replaceButton());

    await waitFor(() => expect(onReplaced).toHaveBeenCalledWith(1, false));
    expect(completeImageReplacement).toHaveBeenCalledWith("pair-uuid", ["new-top"]);
    expect(within(tile("sole")).getByRole("alert")).toHaveTextContent(
      "Network error",
    );
    expect(replaceButton()).toHaveTextContent("Try again");

    vi.mocked(uploadToSlot).mockResolvedValue(undefined);
    fireEvent.click(replaceButton());

    await waitFor(() => expect(onReplaced).toHaveBeenLastCalledWith(1, true));
    expect(vi.mocked(startImageReplacement).mock.calls[1][1].map((u) => u.angle)).toEqual(["sole"]);
  });

  it("shows why the server refused to confirm", async () => {
    vi.mocked(completeImageReplacement).mockResolvedValue({
      replaced: [],
      failed: [{ image_id: "new-top", error: "Uploaded object is not an image." }],
    });
    renderModal();
    pick("top", file("top.jpg"));

    fireEvent.click(replaceButton());

    expect(
      await within(tile("top")).findByText("Uploaded object is not an image."),
    ).toBeInTheDocument();
    expect(within(tile("top")).getByText("New")).toBeInTheDocument();
    expect(onReplaced).not.toHaveBeenCalled();
  });

  it("reports a failed start without uploading", async () => {
    vi.mocked(startImageReplacement).mockRejectedValue(
      Object.assign(new Error("Request failed"), {
        response: {
          data: { error: { message: "Images of a verified pair can't be changed." } },
        },
      }),
    );
    renderModal();
    pick("top", file("top.jpg"));

    fireEvent.click(replaceButton());

    expect(await screen.findByText("Images of a verified pair can't be changed.")).toBeInTheDocument();
    expect(uploadToSlot).not.toHaveBeenCalled();
    expect(replaceButton()).toBeEnabled();
  });
});
