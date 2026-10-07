import { beforeEach, describe, expect, it } from "vitest";

import { useBulkUpload, type QueueItem } from "./bulk-upload-store";

function item(id: string, patch: Partial<QueueItem> = {}): QueueItem {
  return {
    id,
    pairId: id.split(":")[0],
    angle: id.split(":")[1],
    file: new File(["x"], `${id}.jpg`),
    status: "queued",
    progress: 0,
    attempts: 0,
    ...patch,
  };
}

const store = () => useBulkUpload.getState();

describe("useBulkUpload", () => {
  beforeEach(() => store().reset());

  it("starts idle and empty", () => {
    expect(store()).toMatchObject({
      items: [],
      phase: "idle",
      batchId: null,
    });
  });

  it("setItems replaces the queue", () => {
    store().setItems([item("pair-0:top")]);
    store().setItems([item("pair-1:sole"), item("pair-1:label")]);

    expect(store().items.map((i) => i.id)).toEqual([
      "pair-1:sole",
      "pair-1:label",
    ]);
  });

  it("updateItem patches only the matching item", () => {
    store().setItems([item("pair-0:top"), item("pair-0:sole")]);

    store().updateItem("pair-0:top", {
      status: "uploading",
      progress: 40,
    });

    expect(store().items).toEqual([
      expect.objectContaining({
        id: "pair-0:top",
        status: "uploading",
        progress: 40,
        attempts: 0,
      }),
      expect.objectContaining({
        id: "pair-0:sole",
        status: "queued",
        progress: 0,
      }),
    ]);
  });

  it("updateItem with an unknown id changes nothing", () => {
    store().setItems([item("pair-0:top")]);
    const before = store().items[0];

    store().updateItem("missing:top", { status: "failed" });

    expect(store().items[0]).toEqual(before);
  });

  it("setPhase and setBatchId update their fields", () => {
    store().setBatchId("batch-1");
    store().setPhase("uploading");

    expect(store()).toMatchObject({
      batchId: "batch-1",
      phase: "uploading",
    });
  });

  it("reset clears items, phase and batchId", () => {
    store().setItems([item("pair-0:top")]);
    store().setBatchId("batch-1");
    store().setPhase("failed");

    store().reset();

    expect(store()).toMatchObject({
      items: [],
      phase: "idle",
      batchId: null,
    });
  });
});
