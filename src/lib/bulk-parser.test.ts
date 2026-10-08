import { describe, expect, it } from "vitest";

import {
  classifyFiles,
  detectAngle,
  isPairFolder,
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
    ["front.jpg", "front"],
    ["Top.JPG", "top"],
    ["lateral-side.jpg", "lateral"],
    ["medial.webp", "medial"],
    ["img-front-1.jpg", "front"],
    ["myfrontfile.jpg", null],
    ["sole.png", "sole"],
    ["label.jpeg", "label"],
    ["IMG_4823.HEIC", null],
    ["FRONT.jpg", "front"],
    ["frontal.jpg", null],
    ["pair-2-top-sole.jpg", null],
    ["pair-001/front.jpg", "front"],
    // Older names for the sides of the left shoe.
    ["left-side.jpg", "lateral"],
    ["right.webp", "medial"],
    ["pair-3-lateral-left.jpg", "lateral"],
    // Overview is not a bulk angle.
    ["overview.jpg", null],
  ])("%s -> %s", (name, expected) => {
    expect(detectAngle(name)).toBe(expected);
  });
});

describe("detectPairKeyFromName", () => {
  it.each([
    ["KKX-PAIR-00000042-front.jpg", "front", "KKX-PAIR-00000042"],
    ["kkx-pair-42-top.jpg", "top", "KKX-PAIR-42"],
    ["pair-2-top.jpeg", "top", "pair-2"],
    ["Pair_003_LEFT.HEIC", "lateral", "pair-3"],
    ["img-4823-front.JPG", "front", "img-4823"],
    ["IMG_4823.HEIC", null, null],
    ["pair-000-top.jpg", "top", "pair-0"],
    ["repair-5-top.jpg", "top", "repair-5"],
    ["front.jpg", "front", null],
    ["shoe 12 sole.jpg", "sole", "shoe-12"],
  ] as const)("%s (%s) -> %s", (name, angle, expected) => {
    expect(detectPairKeyFromName(name, angle)).toBe(expected);
  });
});

describe("classifyFiles", () => {
  it("groups files by folder", () => {
    const result = classifyFiles(
      inputs(
        "pair-002/front.jpg",
        "pair-001/front.jpg",
        "pair-001/top.jpg",
      ),
    );

    expect(summarize(result)).toEqual({
      pairs: [
        {
          key: "pair-001",
          paths: ["pair-001/front.jpg", "pair-001/top.jpg"],
        },
        { key: "pair-002", paths: ["pair-002/front.jpg"] },
      ],
      unassigned: [],
    });
    expect(result.pairs[0].files.map((f) => f.angle)).toEqual([
      "front",
      "top",
    ]);
  });

  it("uses the full folder path as the key", () => {
    const result = classifyFiles(
      inputs("intake-2026-10-04/pair-1/front.jpg"),
    );

    expect(result.pairs.map((p) => p.key)).toEqual([
      "intake-2026-10-04/pair-1",
    ]);
  });

  it("judges the innermost folder when nested", () => {
    const result = classifyFiles(
      inputs(
        "intake-2026-10-04/pair-001/front.jpg",
        "intake-2026-10-04/pair-002/front.jpg",
      ),
    );

    expect(result.pairs.map((p) => p.key)).toEqual([
      "intake-2026-10-04/pair-001",
      "intake-2026-10-04/pair-002",
    ]);
  });

  it("ignores a wrapper folder when files name their own pair", () => {
    const result = classifyFiles(
      inputs("iPhone Export/pair-2-top.jpg", "iPhone Export/pair-3-top.jpg"),
    );

    expect(summarize(result)).toEqual({
      pairs: [
        { key: "pair-2", paths: ["iPhone Export/pair-2-top.jpg"] },
        { key: "pair-3", paths: ["iPhone Export/pair-3-top.jpg"] },
      ],
      unassigned: [],
    });
  });

  it("treats a folder of six angle-named files as one pair", () => {
    const result = classifyFiles(
      inputs(
        ...["front", "top", "lateral", "medial", "sole", "label"].map(
          (angle) => `Bulk Intake/${angle}.jpg`,
        ),
      ),
    );

    expect(result.pairs).toHaveLength(1);
    expect(result.pairs[0].key).toBe("Bulk Intake");
    expect(result.pairs[0].files.map((f) => f.angle)).toEqual([
      "front",
      "top",
      "lateral",
      "medial",
      "sole",
      "label",
    ]);
  });

  it("sends 8+ files with no angle or pair info to unassigned", () => {
    // A pair folder holds the six angles plus an optional overview.
    const paths = Array.from(
      { length: 8 },
      (_, i) => `Bulk Intake/IMG_${1000 + i}.HEIC`,
    );

    const result = classifyFiles(inputs(...paths));

    expect(result.pairs).toEqual([]);
    expect(result.unassigned.map((f) => f.relativePath)).toEqual(paths);
  });

  it("keeps a folder of 7+ angle-only names together", () => {
    const result = classifyFiles(
      inputs(
        ...["front", "top", "lateral", "medial", "sole", "label"].map(
          (angle) => `Shoe A/${angle}.jpg`,
        ),
        "Shoe A/IMG_0001.HEIC",
      ),
    );

    expect(result.pairs.map((p) => [p.key, p.files.length])).toEqual([
      ["Shoe A", 7],
    ]);
  });

  it("splits a large export of img-N-angle files by filename", () => {
    const paths = ["img-1", "img-2"].flatMap((key) =>
      ["front", "top", "lateral", "medial"].map(
        (angle) => `Export/${key}-${angle}.jpg`,
      ),
    );

    const result = classifyFiles(inputs(...paths));

    expect(result.pairs.map((p) => [p.key, p.files.length])).toEqual([
      ["img-1", 4],
      ["img-2", 4],
    ]);
  });

  it("mixes folder and filename grouping, keeping unknowns", () => {
    const result = classifyFiles(
      inputs("pair-001/front.jpg", "pair-002-top.jpg", "IMG_9999.HEIC"),
    );

    expect(summarize(result)).toEqual({
      pairs: [
        { key: "pair-001", paths: ["pair-001/front.jpg"] },
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
    // 150 angle-less files: too many for one pair, so unassigned.
    const many = Array.from({ length: 150 }, (_, i) =>
      fileEntry(`IMG_${i}.HEIC`),
    );

    const result = await parseDroppedItems(
      dataTransfer([
        {
          entry: dirEntry("intake", [
            dirEntry("pair-001", [
              fileEntry("front.jpg"),
              fileEntry(".DS_Store"),
            ]),
            dirEntry("bulk", many, 100),
          ]),
        },
        { entry: fileEntry("pair-7-sole.jpg") },
      ]),
    );

    expect(result.pairs.map((p) => [p.key, p.files.length])).toEqual([
      ["intake/pair-001", 1],
      ["pair-7", 1],
    ]);
    expect(result.pairs[0].files[0].relativePath).toBe(
      "intake/pair-001/front.jpg",
    );
    expect(result.unassigned).toHaveLength(150);
    expect(result.unassigned[149].relativePath).toBe(
      "intake/bulk/IMG_149.HEIC",
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

describe("isPairFolder", () => {
  it.each([
    ["pair-12", ["IMG_1.HEIC"], true],
    ["KKX-PAIR-00000042", ["a.jpg"], true],
    ["Sneaker pair 7", ["a.jpg"], true],
    ["repair7", Array(8).fill("IMG_1.HEIC"), false],
    ["Export", ["pair-1-top.jpg"], false],
    ["Export", ["IMG_1.HEIC", "IMG_2.HEIC"], true],
  ] as const)("%s %j -> %s", (folder, names, expected) => {
    expect(isPairFolder(folder, [...names])).toBe(expected);
  });
});
