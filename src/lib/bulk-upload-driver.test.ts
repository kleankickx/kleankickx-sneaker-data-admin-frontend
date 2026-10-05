import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import {
  completeCaptureImagesBulk,
  createPairsBulk,
  retryCaptureImage,
  type BulkPairPayload,
  type CreatePairsBulkResponse,
} from "./api";
import {
  UPLOAD_CONCURRENCY,
  cancelBulkUpload,
  retryAllFailed,
  retryItem,
  retryPair,
  runBulkUpload,
  type RunBulkUploadInput,
} from "./bulk-upload-driver";
import { useBulkUpload } from "./bulk-upload-store";

vi.mock("./api", () => ({
  createPairsBulk: vi.fn(),
  completeCaptureImagesBulk: vi.fn(),
  retryCaptureImage: vi.fn(),
}));

const ANGLES = ["overview", "top", "left", "right", "sole", "label"];

/* ------------------------------------------------------------------
   Fake XMLHttpRequest
   ------------------------------------------------------------------ */

type Outcome = number | "network" | "hang";

class FakeXHR {
  static inFlight = 0;
  static maxInFlight = 0;
  static sent: FakeXHR[] = [];
  /** Decide each request's outcome from its public_id field. */
  static outcome: (publicId: string) => Outcome = () => 200;

  url = "";
  status = 0;
  body: FormData | null = null;
  upload: { onprogress: ((e: ProgressEvent) => void) | null } = {
    onprogress: null,
  };
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onabort: (() => void) | null = null;
  ontimeout: (() => void) | null = null;
  private finished = false;

  open(_method: string, url: string) {
    this.url = url;
  }

  get publicId(): string {
    return String(this.body?.get("public_id"));
  }

  send(body: FormData) {
    this.body = body;
    FakeXHR.sent.push(this);
    FakeXHR.inFlight += 1;
    FakeXHR.maxInFlight = Math.max(FakeXHR.maxInFlight, FakeXHR.inFlight);

    const outcome = FakeXHR.outcome(this.publicId);
    if (outcome === "hang") return;

    setTimeout(() => {
      if (this.finished) return;
      this.finish();
      if (outcome === "network") {
        this.onerror?.();
        return;
      }
      this.upload.onprogress?.({
        lengthComputable: true,
        loaded: 1,
        total: 1,
      } as ProgressEvent);
      this.status = outcome;
      this.onload?.();
    }, 1);
  }

  abort() {
    if (this.finished) return;
    this.finish();
    this.onabort?.();
  }

  private finish() {
    this.finished = true;
    FakeXHR.inFlight -= 1;
  }

  static reset() {
    FakeXHR.inFlight = 0;
    FakeXHR.maxInFlight = 0;
    FakeXHR.sent = [];
    FakeXHR.outcome = () => 200;
  }
}

/* ------------------------------------------------------------------
   Fixtures
   ------------------------------------------------------------------ */

function makeInput(
  pairCount: number,
  angles: string[] = ANGLES,
): RunBulkUploadInput {
  const pairs: BulkPairPayload[] = [];
  const files: RunBulkUploadInput["files"] = {};

  for (let i = 0; i < pairCount; i++) {
    const ref = `pair-${i}`;
    pairs.push({
      client_ref: ref,
      brand: i === 0 ? "Nike" : undefined,
      model: i === 0 ? "Air Max 90" : undefined,
      uploads: angles.map((angle) => ({
        angle,
        file_size: 1,
        content_type: "image/jpeg",
      })),
    });
    files[ref] = Object.fromEntries(
      angles.map((angle) => [angle, new File(["x"], `${angle}.jpg`)]),
    );
  }

  return { batchId: "batch-1", pairs, files };
}

const imageId = (ref: string, angle: string) => `img-${ref}-${angle}`;

/** Fake create response; `omit` drops slots like "pair-0:top". */
function fakeCreate(omit: string[] = []) {
  return async (
    _batchId: string,
    body: { pairs: BulkPairPayload[] },
  ): Promise<CreatePairsBulkResponse> => ({
    pairs: body.pairs.map((pair) => ({
      client_ref: pair.client_ref,
      pair: {} as CreatePairsBulkResponse["pairs"][0]["pair"],
      capture_session_id: "session",
      upload_slots: pair.uploads
        .filter((u) => !omit.includes(`${pair.client_ref}:${u.angle}`))
        .map((u) => ({
          angle: u.angle,
          image_id: imageId(pair.client_ref, u.angle),
          upload: {
            upload_url: "https://upload.test/original",
            fields: {
              public_id: `${pair.client_ref}:${u.angle}`,
              timestamp: 123,
            },
          },
        })),
    })),
  });
}

const store = () => useBulkUpload.getState();
const item = (id: string) => store().items.find((i) => i.id === id)!;
const statuses = () =>
  Object.fromEntries(store().items.map((i) => [i.id, i.status]));

/* ------------------------------------------------------------------ */

beforeEach(() => {
  FakeXHR.reset();
  vi.stubGlobal("XMLHttpRequest", FakeXHR);
  vi.spyOn(console, "debug").mockImplementation(() => {});

  vi.mocked(createPairsBulk).mockReset().mockImplementation(fakeCreate());
  vi.mocked(completeCaptureImagesBulk)
    .mockReset()
    .mockImplementation(async (ids) => ({
      completed: ids.length,
      failed: [],
    }));
  vi.mocked(retryCaptureImage).mockReset();

  store().reset();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("runBulkUpload", () => {
  it("uploads and completes every item on the happy path", async () => {
    await runBulkUpload(makeInput(2));

    expect(store().phase).toBe("done");
    expect(store().batchId).toBe("batch-1");
    expect(store().items).toHaveLength(12);
    expect(new Set(Object.values(statuses()))).toEqual(new Set(["done"]));
    expect(store().items.every((i) => i.progress === 100)).toBe(true);

    expect(FakeXHR.sent).toHaveLength(12);
    const sent = FakeXHR.sent[0].body!;
    expect(sent.get("file")).toBeInstanceOf(File);
    expect(sent.get("timestamp")).toBe("123");

    expect(completeCaptureImagesBulk).toHaveBeenCalledTimes(1);
    expect(vi.mocked(completeCaptureImagesBulk).mock.calls[0][0]).toHaveLength(
      12,
    );
  });

  it("labels pairs with brand and model, else client_ref", async () => {
    await runBulkUpload(makeInput(2));

    expect(item("pair-0:top").pairLabel).toBe("Nike Air Max 90");
    expect(item("pair-1:top").pairLabel).toBe("pair-1");
  });

  it("marks only the failing upload failed", async () => {
    FakeXHR.outcome = (id) => (id === "pair-1:sole" ? 500 : 200);

    await runBulkUpload(makeInput(2));

    expect(store().phase).toBe("failed");
    expect(item("pair-1:sole")).toMatchObject({
      status: "failed",
      error: "Upload failed (500)",
      attempts: 1,
    });
    expect(
      store().items.filter((i) => i.status === "done"),
    ).toHaveLength(11);
    expect(
      vi.mocked(completeCaptureImagesBulk).mock.calls[0][0],
    ).not.toContain(imageId("pair-1", "sole"));
  });

  it("reports network errors per item", async () => {
    FakeXHR.outcome = (id) => (id === "pair-0:top" ? "network" : 200);

    await runBulkUpload(makeInput(1));

    expect(item("pair-0:top")).toMatchObject({
      status: "failed",
      error: "Network error",
    });
  });

  it("fails the job and uploads nothing when bulk create fails", async () => {
    const error = Object.assign(new Error("Request failed"), {
      response: { data: { error: { message: "Batch is closed." } } },
    });
    vi.mocked(createPairsBulk).mockRejectedValue(error);

    await expect(runBulkUpload(makeInput(2))).rejects.toBe(error);

    expect(store().phase).toBe("failed");
    expect(FakeXHR.sent).toHaveLength(0);
    expect(completeCaptureImagesBulk).not.toHaveBeenCalled();
    expect(item("pair-0:top").error).toBe(
      "Pair could not be created: Batch is closed.",
    );
  });

  it("rejects before creating anything when a file is missing", async () => {
    const input = makeInput(1);
    delete input.files["pair-0"]!.label;

    await expect(runBulkUpload(input)).rejects.toThrow(
      "No file for pair-0 / label.",
    );
    expect(createPairsBulk).not.toHaveBeenCalled();
    expect(store().phase).toBe("idle");
  });

  it("fails an item whose slot is missing from the response", async () => {
    vi.mocked(createPairsBulk).mockImplementation(
      fakeCreate(["pair-0:left"]),
    );

    await runBulkUpload(makeInput(1));

    expect(item("pair-0:left")).toMatchObject({
      status: "failed",
      error: "No upload slot returned.",
    });
    expect(FakeXHR.sent).toHaveLength(5);
    expect(store().phase).toBe("failed");
  });

  it("fails items that bulk complete reports as failed", async () => {
    vi.mocked(completeCaptureImagesBulk).mockImplementation(async (ids) => ({
      completed: ids.length - 1,
      failed: [{ image_id: imageId("pair-0", "label"), error: "Image not found." }],
    }));

    await runBulkUpload(makeInput(1));

    expect(item("pair-0:label")).toMatchObject({
      status: "failed",
      error: "Image not found.",
    });
    expect(item("pair-0:top").status).toBe("done");
    expect(store().phase).toBe("failed");
  });

  it("fails the chunk when bulk complete itself errors", async () => {
    vi.mocked(completeCaptureImagesBulk).mockRejectedValue(
      new Error("timeout"),
    );

    await runBulkUpload(makeInput(1));

    expect(item("pair-0:top")).toMatchObject({
      status: "failed",
      error: "Could not confirm upload: timeout",
    });
    expect(store().phase).toBe("failed");
  });

  it("never exceeds the upload concurrency limit", async () => {
    await runBulkUpload(makeInput(5));

    expect(FakeXHR.sent).toHaveLength(30);
    expect(FakeXHR.maxInFlight).toBe(UPLOAD_CONCURRENCY);
  });

  it("splits create requests into chunks of 50 pairs", async () => {
    await runBulkUpload(makeInput(51, ["top"]));

    const calls = vi.mocked(createPairsBulk).mock.calls;
    expect(calls.map(([, body]) => body.pairs.length)).toEqual([50, 1]);
    expect(store().phase).toBe("done");
  });

  it("still uploads earlier chunks when a later create fails", async () => {
    vi.mocked(createPairsBulk)
      .mockImplementationOnce(fakeCreate())
      .mockRejectedValueOnce(new Error("boom"));

    await runBulkUpload(makeInput(51, ["top"]));

    expect(item("pair-0:top").status).toBe("done");
    expect(item("pair-50:top")).toMatchObject({
      status: "failed",
      error: "Pair could not be created: boom",
    });
    expect(store().phase).toBe("failed");
  });

  it("stops on cancel and leaves unfinished items retryable", async () => {
    FakeXHR.outcome = () => "hang";

    const run = runBulkUpload(makeInput(2));
    await vi.waitFor(() =>
      expect(FakeXHR.inFlight).toBe(UPLOAD_CONCURRENCY),
    );

    cancelBulkUpload();
    await expect(run).resolves.toBeUndefined();

    // No new uploads started after the abort.
    expect(FakeXHR.sent).toHaveLength(UPLOAD_CONCURRENCY);
    expect(FakeXHR.inFlight).toBe(0);
    expect(completeCaptureImagesBulk).not.toHaveBeenCalled();
    expect(new Set(Object.values(statuses()))).toEqual(new Set(["failed"]));
    expect(item("pair-0:top").error).toBe("Upload cancelled.");
    expect(store().phase).toBe("failed");
  });
});

describe("retry", () => {
  async function runWithFailures(failing: string[]) {
    FakeXHR.outcome = (id) => (failing.includes(id) ? 500 : 200);
    await runBulkUpload(makeInput(2));
    FakeXHR.outcome = () => 200;
    FakeXHR.sent = [];
    vi.mocked(completeCaptureImagesBulk).mockClear();
  }

  it("retryItem re-uploads with a fresh slot and completes", async () => {
    await runWithFailures(["pair-0:top"]);
    vi.mocked(retryCaptureImage).mockResolvedValue({
      image: {} as never,
      upload: {
        upload_url: "https://upload.test/fresh",
        fields: { public_id: "pair-0:top", timestamp: 456 },
      },
    });

    await retryItem("pair-0:top");

    expect(retryCaptureImage).toHaveBeenCalledWith(imageId("pair-0", "top"));
    expect(FakeXHR.sent.map((x) => x.url)).toEqual([
      "https://upload.test/fresh",
    ]);
    expect(completeCaptureImagesBulk).toHaveBeenCalledWith([
      imageId("pair-0", "top"),
    ]);
    expect(item("pair-0:top")).toMatchObject({
      status: "done",
      error: undefined,
      uploadUrl: "https://upload.test/fresh",
      uploadFields: { public_id: "pair-0:top", timestamp: 456 },
    });
    expect(store().phase).toBe("done");
  });

  it("reuses the original slot when the server refuses a retry", async () => {
    await runWithFailures(["pair-0:top"]);
    vi.mocked(retryCaptureImage).mockRejectedValue({
      response: {
        status: 400,
        data: { error: { message: "cannot be retried" } },
      },
    });

    await retryItem("pair-0:top");

    expect(FakeXHR.sent.map((x) => x.url)).toEqual([
      "https://upload.test/original",
    ]);
    expect(item("pair-0:top").status).toBe("done");
    expect(store().phase).toBe("done");
  });

  it("fails the item again when the retry upload fails", async () => {
    await runWithFailures(["pair-0:top"]);
    vi.mocked(retryCaptureImage).mockRejectedValue({
      response: { status: 400 },
    });
    FakeXHR.outcome = () => 502;

    await retryItem("pair-0:top");

    expect(item("pair-0:top")).toMatchObject({
      status: "failed",
      error: "Upload failed (502)",
      attempts: 2,
    });
    expect(store().phase).toBe("failed");
  });

  it("retryItem rejects an item that is not a failed upload", async () => {
    await runBulkUpload(makeInput(1));

    await expect(retryItem("pair-0:top")).rejects.toThrow(
      "not a retryable failed upload",
    );
  });

  it("retryPair retries only that pair's failures", async () => {
    await runWithFailures(["pair-0:top", "pair-0:sole", "pair-1:left"]);
    vi.mocked(retryCaptureImage).mockRejectedValue({
      response: { status: 400 },
    });

    await retryPair("pair-0");

    expect(FakeXHR.sent.map((x) => x.publicId)).toEqual([
      "pair-0:top",
      "pair-0:sole",
    ]);
    expect(item("pair-1:left").status).toBe("failed");
    expect(store().phase).toBe("failed");
  });

  it("retryAllFailed retries every failure, three at a time", async () => {
    await runWithFailures([
      "pair-0:top",
      "pair-0:sole",
      "pair-1:left",
      "pair-1:right",
      "pair-1:label",
    ]);
    vi.mocked(retryCaptureImage).mockRejectedValue({
      response: { status: 400 },
    });
    FakeXHR.maxInFlight = 0;

    await retryAllFailed();

    expect(FakeXHR.sent).toHaveLength(5);
    expect(FakeXHR.maxInFlight).toBeLessThanOrEqual(3);
    expect(store().items.every((i) => i.status === "done")).toBe(true);
    expect(store().phase).toBe("done");
  });
});
