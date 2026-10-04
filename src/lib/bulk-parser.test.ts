import { describe, expect, it } from "vitest";

import {
  classifyFiles,
  detectAngle,
  detectPairKeyFromName,
  parseDroppedItems,
} from "./bulk-parser";

function file(name: string): File {
  return new File(["x"], name, { type: "image/jpeg" });
}

function inputs(...paths: string[]) {
  return paths.map((relativePath) => ({
    file: file(relativePath.split("/").pop()!),
    relativePath,
  }));
}

function summarize(result: ReturnType<typeof classifyFiles>) {
  return {
    pairs: result.pairs.map((p) => ({
      key: p.key,
      paths: p.files.map((f) => f.relativePath),
    })),
    unassigned: result.unassigned.map((f) => f.relativePath),
  };
}

describe("detectAngle", () => {
  it.each([
    ["overview.jpg", "overview"],
    ["Top.JPG", "top"],
    ["left-side.jpg", "left"],
    ["img-overview-1.jpg", "overview"],
    ["myoverviewfile.jpg", null],
    ["sole.png", "sole"],
    ["label.jpeg", "label"],
    ["right.webp", "right"],
    ["IMG_4823.HEIC", null],
    ["OVERVIEW.jpg", "overview"],
    ["over-view.jpg", "overview"],
    ["overviewing.jpg", null],
    ["pair-2-top-left.jpg", null],
    ["pair-001/overview.jpg", "overview"],
  ])("%s -> %s", (name, expected) => {
    expect(detectAngle(name)).toBe(expected);
  });
});

describe("detectPairKeyFromName", () => {
  it.each([
    ["KKX-PAIR-00000042-overview.jpg", "overview", "KKX-PAIR-00000042"],
    ["kkx-pair-42-top.jpg", "top", "KKX-PAIR-42"],
    ["pair-2-top.jpeg", "top", "pair-2"],
    ["Pair_003_LEFT.HEIC", "left", "pair-3"],
    ["img-4823-overview.JPG", "overview", "img-4823"],
    ["IMG_4823.HEIC", null, null],
    ["pair-000-top.jpg", "top", "pair-0"],
    ["repair-5-top.jpg", "top", "repair-5"],
    ["overview.jpg", "overview", null],
    ["shoe 12 sole.jpg", "sole", "shoe-12"],
  ] as const)("%s (%s) -> %s", (name, angle, expected) => {
    expect(detectPairKeyFromName(name, angle)).toBe(expected);
  });
});

describe("classifyFiles", () => {
  it("groups files by folder", () => {
    const result = classifyFiles(
      inputs(
        "pair-002/overview.jpg",
        "pair-001/overview.jpg",
        "pair-001/top.jpg",
      ),
    );

    expect(summarize(result)).toEqual({
      pairs: [
        {
          key: "pair-001",
          paths: ["pair-001/overview.jpg", "pair-001/top.jpg"],
        },
        { key: "pair-002", paths: ["pair-002/overview.jpg"] },
      ],
      unassigned: [],
    });
    expect(result.pairs[0].files.map((f) => f.angle)).toEqual([
      "overview",
      "top",
    ]);
  });

  it("uses the full folder path as the key", () => {
    const result = classifyFiles(
      inputs("intake-2026-10-04/pair-1/overview.jpg"),
    );

    expect(result.pairs.map((p) => p.key)).toEqual([
      "intake-2026-10-04/pair-1",
    ]);
  });

  it("mixes folder and filename grouping, keeping unknowns", () => {
    const result = classifyFiles(
      inputs("pair-001/overview.jpg", "pair-002-top.jpg", "IMG_9999.HEIC"),
    );

    expect(summarize(result)).toEqual({
      pairs: [
        { key: "pair-001", paths: ["pair-001/overview.jpg"] },
        { key: "pair-2", paths: ["pair-002-top.jpg"] },
      ],
      unassigned: ["IMG_9999.HEIC"],
    });
    expect(result.unassigned[0]).toMatchObject({
      pairKey: null,
      angle: null,
    });
  });

  it("keeps a file with a pair but no angle inside its pair", () => {
    const result = classifyFiles(inputs("pair-001/IMG_1234.HEIC"));

    expect(result.pairs[0].files[0]).toMatchObject({
      pairKey: "pair-001",
      angle: null,
    });
    expect(result.unassigned).toEqual([]);
  });

  it("sorts pair keys numerically", () => {
    const result = classifyFiles(
      inputs("pair-2-top.jpg", "pair-10-top.jpg", "pair-1-top.jpg"),
    );

    expect(result.pairs.map((p) => p.key)).toEqual([
      "pair-1",
      "pair-2",
      "pair-10",
    ]);
  });

  it("returns empty buckets for no files", () => {
    expect(classifyFiles([])).toEqual({ pairs: [], unassigned: [] });
  });
});

/* ------------------------------------------------------------------
   parseDroppedItems — duck-typed fakes for the FileSystemEntry API,
   which neither Node nor jsdom implement.
   ------------------------------------------------------------------ */

function fileEntry(name: string) {
  return {
    name,
    isFile: true,
    isDirectory: false,
    file: (resolve: (f: File) => void) => resolve(file(name)),
  };
}

function dirEntry(name: string, children: unknown[], pageSize = 100) {
  return {
    name,
    isFile: false,
    isDirectory: true,
    createReader: () => {
      let offset = 0;
      return {
        readEntries: (resolve: (entries: unknown[]) => void) => {
          const page = children.slice(offset, offset + pageSize);
          offset += page.length;
          resolve(page);
        },
      };
    },
  };
}

function dataTransfer(
  items: Array<{ entry?: unknown; file?: File }>,
  files: File[] = [],
) {
  return {
    items: items.map(({ entry, file: f }) => ({
      kind: "file",
      webkitGetAsEntry: () => entry ?? null,
      getAsFile: () => f ?? null,
    })),
    files,
  } as unknown as DataTransfer;
}

describe("parseDroppedItems", () => {
  it("walks nested folders and paginated readEntries", async () => {
    const many = Array.from({ length: 150 }, (_, i) =>
      fileEntry(`IMG_${i}.HEIC`),
    );

    const result = await parseDroppedItems(
      dataTransfer([
        {
          entry: dirEntry("intake", [
            dirEntry("pair-001", [
              fileEntry("overview.jpg"),
              fileEntry(".DS_Store"),
            ]),
            dirEntry("bulk", many, 100),
          ]),
        },
        { entry: fileEntry("pair-7-sole.jpg") },
      ]),
    );

    expect(result.pairs.map((p) => [p.key, p.files.length])).toEqual([
      ["intake/bulk", 150],
      ["intake/pair-001", 1],
      ["pair-7", 1],
    ]);
    expect(result.pairs[1].files[0].relativePath).toBe(
      "intake/pair-001/overview.jpg",
    );
  });

  it("falls back to dataTransfer.files without entry support", async () => {
    const result = await parseDroppedItems(
      dataTransfer([], [file("pair-1-top.jpg"), file("IMG_1.HEIC")]),
    );

    expect(summarize(result)).toEqual({
      pairs: [{ key: "pair-1", paths: ["pair-1-top.jpg"] }],
      unassigned: ["IMG_1.HEIC"],
    });
  });
});
