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
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type Mock,
} from "vitest";

import { getUploadConfig } from "../../lib/api";
import { REQUIRED_ANGLES } from "../../lib/bulk-parser";
import { runBulkUpload } from "../../lib/bulk-upload-driver";
import BulkUploadModal from "./BulkUploadModal";

const mocks = vi.hoisted(() => ({ phase: "idle" }));

vi.mock("../../lib/api", () => ({ getUploadConfig: vi.fn() }));
vi.mock("../../lib/bulk-upload-driver", () => ({
  runBulkUpload: vi.fn(async () => {}),
}));
vi.mock("../../lib/bulk-upload-store", () => ({
  useBulkUpload: (select: (s: { phase: string }) => unknown) =>
    select({ phase: mocks.phase }),
}));

function file(name: string, size = 10): File {
  return new File([new Uint8Array(size)], name);
}

function pairFiles(key: string, angles = [...REQUIRED_ANGLES], ext = "jpg") {
  return angles.map((angle) => file(`${key}-${angle}.${ext}`));
}

function chooseFiles(files: File[]) {
  fireEvent.change(screen.getByLabelText("Choose files"), {
    target: { files },
  });
}

const GUIDE_SEEN_KEY = "kkx.bulkUploadGuideSeen";

const startButton = () =>
  screen.getByRole("button", { name: "Start upload" });

let onClose: Mock<() => void>;

function renderModal() {
  onClose = vi.fn<() => void>();
  return render(
    <BulkUploadModal open batchId="batch-1" onClose={onClose} />,
  );
}

beforeEach(() => {
  mocks.phase = "idle";
  vi.mocked(getUploadConfig).mockReset().mockRejectedValue(new Error("404"));
  vi.mocked(runBulkUpload).mockClear();
  vi.spyOn(console, "debug").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.stubGlobal(
    "URL",
    Object.assign(URL, {
      createObjectURL: vi.fn(() => "blob:preview"),
      revokeObjectURL: vi.fn(),
    }),
  );
  vi.spyOn(window, "confirm").mockReturnValue(true);
  // Most tests are about the upload flow, not the first-visit guide.
  window.localStorage.setItem(GUIDE_SEEN_KEY, "1");
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("BulkUploadModal", () => {
  it("renders nothing when closed", () => {
    render(<BulkUploadModal open={false} batchId="b" onClose={() => {}} />);

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("moves to review with one row and six filled tiles", () => {
    renderModal();
    chooseFiles(pairFiles("pair-1"));

    const row = screen.getByRole("listitem", { name: "Pair 1" });
    expect(within(row).getByText("pair-1")).toBeInTheDocument();
    for (const angle of REQUIRED_ANGLES) {
      expect(
        within(row).getByRole("button", { name: `Replace ${angle}` }),
      ).toBeInTheDocument();
    }
    expect(startButton()).toBeEnabled();
  });

  it("flags a pair with five files and disables Start", () => {
    renderModal();
    chooseFiles(pairFiles("pair-1", REQUIRED_ANGLES.slice(0, 5)));

    expect(screen.getByText("Missing angles: label")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Add label" }),
    ).toBeInTheDocument();
    expect(startButton()).toBeDisabled();
    expect(screen.getByText("1 pair needs attention.")).toBeInTheDocument();
  });

  it("blocks Start on unassigned files until discarded", () => {
    renderModal();
    chooseFiles([...pairFiles("pair-1"), file("IMG_4823.HEIC")]);

    expect(screen.getByText("Unassigned (1)")).toBeInTheDocument();
    expect(startButton()).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: "Discard" }));

    expect(screen.queryByText(/Unassigned/)).not.toBeInTheDocument();
    expect(startButton()).toBeEnabled();
  });

  it("assigns an unassigned file to a pair's empty slot", () => {
    renderModal();
    chooseFiles([
      ...pairFiles("pair-1", REQUIRED_ANGLES.slice(0, 5)),
      file("IMG_4823.HEIC"),
    ]);

    const assign = screen.getByRole("button", { name: "Assign" });
    expect(assign).toBeDisabled();

    fireEvent.change(
      screen.getByRole("combobox", { name: "Pair for IMG_4823.HEIC" }),
      { target: { value: screen.getByRole("option", { name: /^Pair 1/ }).getAttribute("value") } },
    );
    fireEvent.change(
      screen.getByRole("combobox", { name: "Angle for IMG_4823.HEIC" }),
      { target: { value: "label" } },
    );
    fireEvent.click(assign);

    expect(screen.queryByText(/Missing angles/)).not.toBeInTheDocument();
    expect(startButton()).toBeEnabled();
  });

  it("supports loose files with no pairs via Add pair", () => {
    renderModal();
    chooseFiles([file("IMG_1.HEIC"), file("IMG_2.HEIC")]);

    expect(screen.getByText("Unassigned (2)")).toBeInTheDocument();
    expect(
      screen.getByText("Add a pair, then assign these files to it."),
    ).toBeInTheDocument();
    expect(screen.getByText("Add at least one pair.")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Add pair" }));

    expect(
      screen.getByRole("listitem", { name: "Pair 1" }),
    ).toBeInTheDocument();
  });

  it("starts the job with the expected input and closes", () => {
    renderModal();
    chooseFiles([
      ...pairFiles("pair-1"),
      ...pairFiles("pair-2", [...REQUIRED_ANGLES], "HEIC"),
    ]);
    fireEvent.change(screen.getAllByLabelText("Brand")[0], {
      target: { value: "Nike" },
    });

    fireEvent.click(startButton());

    expect(runBulkUpload).toHaveBeenCalledTimes(1);
    const input = vi.mocked(runBulkUpload).mock.calls[0][0];
    expect(input.batchId).toBe("batch-1");
    expect(input.pairs.map((p) => p.client_ref)).toEqual(["pair-0", "pair-1"]);
    expect(input.pairs[0].brand).toBe("Nike");
    for (const pair of input.pairs) {
      expect(pair.uploads.map((u) => u.angle)).toEqual([...REQUIRED_ANGLES]);
    }
    expect(input.pairs[1].uploads[0]).toMatchObject({
      content_type: "image/heic",
      original_filename: "pair-2-overview.HEIC",
    });
    expect(input.files["pair-0"]?.top?.name).toBe("pair-1-top.jpg");
    expect(input.files["pair-1"]?.top?.name).toBe("pair-2-top.HEIC");
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("disables Start while another job is uploading", () => {
    mocks.phase = "uploading";
    renderModal();
    chooseFiles(pairFiles("pair-1"));

    expect(startButton()).toBeDisabled();
    expect(
      screen.getByText("Another bulk upload is still running."),
    ).toBeInTheDocument();
  });

  it("flags oversized files once config has loaded", async () => {
    vi.mocked(getUploadConfig).mockResolvedValue({
      max_capture_image_size: 100,
      allowed_content_types: ["image/jpeg"],
      required_angles: [...REQUIRED_ANGLES],
      extension_to_content_type: { jpg: "image/jpeg" },
    });
    renderModal();
    chooseFiles([
      ...pairFiles("pair-1", REQUIRED_ANGLES.slice(1)),
      file("pair-1-overview.jpg", 200),
    ]);

    expect(
      await screen.findByText("overview is 200 B — max is 100 B"),
    ).toBeInTheDocument();
    expect(startButton()).toBeDisabled();
  });

  it("skips size checks and warns once when config is unavailable", async () => {
    vi.resetModules();
    const { default: FreshModal } = await import("./BulkUploadModal");

    const first = render(
      <FreshModal open batchId="batch-1" onClose={() => {}} />,
    );
    await waitFor(() => expect(console.warn).toHaveBeenCalledTimes(1));
    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining("upload config unavailable"),
    );

    // 50 MB reported size without allocating it.
    const huge = pairFiles("pair-1").map((f) =>
      Object.defineProperty(f, "size", { value: 50_000_000 }),
    );
    chooseFiles(huge);
    expect(screen.queryByText(/max is/)).not.toBeInTheDocument();
    expect(startButton()).toBeEnabled();

    first.unmount();
    render(<FreshModal open batchId="batch-1" onClose={() => {}} />);
    await Promise.resolve();
    await Promise.resolve();
    expect(console.warn).toHaveBeenCalledTimes(1);
  });

  it("warns once per session when server angles differ", async () => {
    vi.resetModules();
    const { default: FreshModal } = await import("./BulkUploadModal");
    vi.mocked(getUploadConfig).mockResolvedValue({
      max_capture_image_size: 10_485_760,
      allowed_content_types: ["image/jpeg"],
      required_angles: [...REQUIRED_ANGLES, "heel"],
      extension_to_content_type: { jpg: "image/jpeg" },
    });

    const first = render(
      <FreshModal open batchId="batch-1" onClose={() => {}} />,
    );
    await waitFor(() => expect(console.warn).toHaveBeenCalledTimes(1));
    chooseFiles(pairFiles("pair-1"));
    first.unmount();

    render(<FreshModal open batchId="batch-1" onClose={() => {}} />);
    await waitFor(() => expect(getUploadConfig).toHaveBeenCalledTimes(2));
    await Promise.resolve();

    expect(console.warn).toHaveBeenCalledTimes(1);
    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining("required_angles"),
    );
  });

  it("uses the config's type map once it loads", async () => {
    vi.mocked(getUploadConfig).mockResolvedValue({
      max_capture_image_size: 10_485_760,
      allowed_content_types: ["image/jpeg"],
      required_angles: [...REQUIRED_ANGLES],
      extension_to_content_type: { jpg: "image/jpeg", png: "image/png" },
    });
    renderModal();

    await waitFor(() =>
      expect(screen.getByLabelText("Choose files")).toHaveAttribute(
        "accept",
        ".jpg",
      ),
    );
    chooseFiles(pairFiles("pair-1", [...REQUIRED_ANGLES], "png"));

    expect(
      screen.getByText("6 files skipped (unsupported type)"),
    ).toBeInTheDocument();
    expect(console.warn).not.toHaveBeenCalled();
  });

  it("skips unsupported types and reports an empty result", () => {
    renderModal();
    chooseFiles([file("clip.mov"), file("notes.pdf")]);

    expect(
      screen.getByText(
        "No usable images found. Drop a folder or choose files to start.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText("2 files skipped (unsupported type)"),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Start upload" })).toBeNull();
  });

  it("rejects an unsupported file picked for a tile", () => {
    const { container } = renderModal();
    chooseFiles(pairFiles("pair-1", REQUIRED_ANGLES.slice(0, 5)));

    fireEvent.click(screen.getByRole("button", { name: "Add label" }));
    const tileInput = container.querySelector(
      'input[type="file"][aria-hidden="true"]',
    )!;
    fireEvent.change(tileInput, { target: { files: [file("label.gif")] } });

    expect(
      screen.getByText("Unsupported file type. Use JPEG, PNG, WebP or HEIC."),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Add label" }),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Add label" }));
    fireEvent.change(tileInput, { target: { files: [file("label.jpg")] } });

    expect(
      screen.queryByText(/Unsupported file type/),
    ).not.toBeInTheDocument();
    expect(startButton()).toBeEnabled();
  });

  it("asks before discarding reviewed pairs on cancel", () => {
    vi.mocked(window.confirm).mockReturnValue(false);
    renderModal();
    chooseFiles(pairFiles("pair-1"));

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(window.confirm).toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("keeps review state when going back to intake", () => {
    renderModal();
    chooseFiles(pairFiles("pair-1"));

    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    fireEvent.click(screen.getByRole("button", { name: "Back to review" }));

    expect(
      screen.getByRole("listitem", { name: "Pair 1" }),
    ).toBeInTheDocument();
  });
});

describe("BulkUploadModal guide", () => {
  beforeEach(() => window.localStorage.removeItem(GUIDE_SEEN_KEY));

  const guideTitle = () =>
    screen.queryByRole("heading", { level: 3 })?.textContent;

  it("opens on first visit and walks through every step", () => {
    renderModal();

    expect(screen.getByText("Step 1 of 6")).toBeInTheDocument();
    expect(guideTitle()).toBe("Shoot six angles for every pair");
    expect(screen.queryByLabelText("Choose files")).not.toBeInTheDocument();

    for (let step = 2; step <= 6; step++) {
      fireEvent.click(screen.getByRole("button", { name: "Next" }));
      expect(screen.getByText(`Step ${step} of 6`)).toBeInTheDocument();
    }
    expect(guideTitle()).toBe("Uploading and tracking progress");

    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(screen.getByText("Step 5 of 6")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    fireEvent.click(screen.getByRole("button", { name: "Got it" }));

    expect(screen.getByLabelText("Choose files")).toBeInTheDocument();
    expect(window.localStorage.getItem(GUIDE_SEEN_KEY)).toBe("1");
  });

  it("is not shown again once skipped", () => {
    const first = renderModal();
    fireEvent.click(screen.getByRole("button", { name: "Skip guide" }));
    first.unmount();

    renderModal();

    expect(screen.queryByText(/Step \d of 6/)).not.toBeInTheDocument();
    expect(screen.getByLabelText("Choose files")).toBeInTheDocument();
  });

  it("reopens from How it works and closes on Escape without closing the modal", () => {
    window.localStorage.setItem(GUIDE_SEEN_KEY, "1");
    renderModal();

    fireEvent.click(screen.getByRole("button", { name: "How it works" }));
    expect(guideTitle()).toBe("Shoot six angles for every pair");

    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });

    expect(guideTitle()).toBeUndefined();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("links to the folder step from intake and the review step from Unassigned", () => {
    window.localStorage.setItem(GUIDE_SEEN_KEY, "1");
    renderModal();

    fireEvent.click(
      screen.getByRole("button", { name: "How should I organise my files?" }),
    );
    expect(guideTitle()).toBe("Easiest: one folder per pair");
    fireEvent.click(screen.getByRole("button", { name: "Skip guide" }));

    chooseFiles([...pairFiles("pair-1"), file("IMG_1.HEIC")]);
    fireEvent.click(screen.getByRole("button", { name: "How assigning works" }));

    expect(guideTitle()).toBe("Review and fix before uploading");
    fireEvent.click(screen.getByRole("button", { name: "Skip guide" }));
    // Review state survives a trip through the guide.
    expect(screen.getByText("Unassigned (1)")).toBeInTheDocument();
  });

  it("states the server's size limit once config has loaded", async () => {
    vi.mocked(getUploadConfig).mockResolvedValue({
      max_capture_image_size: 10_485_760,
      allowed_content_types: ["image/jpeg"],
      required_angles: [...REQUIRED_ANGLES],
      extension_to_content_type: { jpg: "image/jpeg" },
    });
    renderModal();
    await waitFor(() => expect(getUploadConfig).toHaveBeenCalled());

    for (let i = 0; i < 3; i++) {
      fireEvent.click(screen.getByRole("button", { name: "Next" }));
    }

    expect(
      await screen.findByText(/up to 10 MB per photo/),
    ).toBeInTheDocument();
  });

  it("still works when browser storage is unavailable", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });

    renderModal();
    expect(screen.getByText("Step 1 of 6")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Skip guide" }));
    expect(screen.getByLabelText("Choose files")).toBeInTheDocument();
  });
});
