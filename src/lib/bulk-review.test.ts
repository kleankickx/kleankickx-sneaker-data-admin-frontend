import { describe, expect, it } from "vitest";

import { REQUIRED_ANGLES, classifyFiles, type Angle } from "./bulk-parser";
import {
  addEmptyPair,
  assignFile,
  buildReviewState,
  buildRunInput,
  pairIssues,
  removePair,
  startBlocker,
  unassignPairFile,
  type ReviewPair,
  type ReviewState,
} from "./bulk-review";
import { contentTypeForName, formatFileSize } from "./image-types";

function idGen() {
  let n = 0;
  return () => `id-${++n}`;
}

function file(name: string, size = 10): File {
  return new File([new Uint8Array(size)], name);
}

function parse(...paths: string[]) {
  return classifyFiles(
    paths.map((relativePath) => ({
      file: file(relativePath.split("/").pop()!),
      relativePath,
    })),
  );
}

function fullPair(key: string, ext = "jpg"): string[] {
  return REQUIRED_ANGLES.map((angle) => `${key}/${angle}.${ext}`);
}

const filled = (pair: ReviewPair) =>
  REQUIRED_ANGLES.filter((a) => pair.files[a]);

describe("image types", () => {
  it.each([
    ["shoe.heic", "image/heic"],
    ["shoe.HEIF", "image/heic"],
    ["shoe.JPG", "image/jpeg"],
    ["shoe.jpeg", "image/jpeg"],
    ["shoe.png", "image/png"],
    ["shoe.webp", "image/webp"],
    ["clip.mov", null],
    ["notes.pdf", null],
    ["no-extension", null],
  ])("%s -> %s", (name, expected) => {
    expect(contentTypeForName(name)).toBe(expected);
  });

  it("formats sizes 1024-based", () => {
    expect(formatFileSize(10 * 1024 * 1024)).toBe("10 MB");
    expect(formatFileSize(13_002_342)).toBe("12.4 MB");
    expect(formatFileSize(2048)).toBe("2 KB");
  });
});

describe("buildReviewState", () => {
  it("makes one row per parsed pair with files by angle", () => {
    const state = buildReviewState(
      parse(...fullPair("pair-2"), ...fullPair("pair-10")),
      idGen(),
    );

    expect(state.pairs.map((p) => p.displayKey)).toEqual([
      "pair-2",
      "pair-10",
    ]);
    expect(filled(state.pairs[0])).toEqual([...REQUIRED_ANGLES]);
    expect(state.unassigned).toEqual([]);
    expect(state.pairs[0]).toMatchObject({
      brand: "",
      condition: "unknown",
    });
  });

  it("moves duplicate and angle-less files to unassigned", () => {
    const state = buildReviewState(
      parse(
        ...fullPair("pair-1"),
        "pair-1/top-2.jpg",
        "pair-1/IMG_1.HEIC",
        "IMG_2.HEIC",
      ),
      idGen(),
    );

    expect(filled(state.pairs[0])).toHaveLength(6);
    expect(
      state.unassigned.map((u) => [u.relativePath, u.reason ?? null]),
    ).toEqual([
      ["IMG_2.HEIC", null],
      ["pair-1/top-2.jpg", "Duplicate top for pair-1"],
      ["pair-1/IMG_1.HEIC", null],
    ]);
  });
});

describe("editing", () => {
  function state(): ReviewState {
    return buildReviewState(
      parse(...fullPair("pair-1").slice(0, 5), "IMG_9.HEIC"),
      idGen(),
    );
  }

  it("assigns an unassigned file into a slot", () => {
    const s = state();
    const next = assignFile(
      s,
      s.unassigned[0].id,
      s.pairs[0].rowId,
      "label",
      idGen(),
    );

    expect(next.pairs[0].files.label?.name).toBe("IMG_9.HEIC");
    expect(next.unassigned).toEqual([]);
  });

  it("displaces the occupant when assigning into a filled slot", () => {
    const s = state();
    const next = assignFile(
      s,
      s.unassigned[0].id,
      s.pairs[0].rowId,
      "top",
      () => "new",
    );

    expect(next.pairs[0].files.top?.name).toBe("IMG_9.HEIC");
    expect(next.unassigned).toEqual([
      expect.objectContaining({
        id: "new",
        angle: "top",
        reason: "Replaced as top",
      }),
    ]);
    expect(next.unassigned[0].file.name).toBe("top.jpg");
  });

  it("removing a pair frees its files", () => {
    const s = state();
    const next = removePair(s, s.pairs[0].rowId, idGen());

    expect(next.pairs).toEqual([]);
    expect(next.unassigned).toHaveLength(6);
  });

  it("removing a tile moves its file to unassigned", () => {
    const s = state();
    const next = unassignPairFile(s, s.pairs[0].rowId, "sole", idGen());

    expect(next.pairs[0].files.sole).toBeUndefined();
    expect(next.unassigned.at(-1)).toMatchObject({ angle: "sole" });
  });
});

describe("validation", () => {
  function pairWith(angles: Angle[], size = 10): ReviewPair {
    const s = addEmptyPair({ pairs: [], unassigned: [] }, "row");
    for (const angle of angles) s.pairs[0].files[angle] = file(`${angle}.jpg`, size);
    return s.pairs[0];
  }

  it("lists missing angles", () => {
    expect(pairIssues(pairWith(["overview", "top", "left", "right"]), null)).toEqual([
      "Missing angles: sole, label",
    ]);
  });

  it("checks size only when the limit is known", () => {
    const pair = pairWith([...REQUIRED_ANGLES], 200);

    expect(pairIssues(pair, null)).toEqual([]);
    expect(pairIssues(pair, 100)).toContain("overview is 200 B — max is 100 B");
    expect(pairIssues(pair, 100)).toHaveLength(6);
  });

  it("startBlocker explains the first problem", () => {
    const ok = buildReviewState(parse(...fullPair("pair-1")), idGen());

    expect(startBlocker({ pairs: [], unassigned: [] }, null)).toBe(
      "Add at least one pair.",
    );
    expect(startBlocker(ok, null)).toBeNull();
    expect(
      startBlocker(
        buildReviewState(parse(...fullPair("pair-1").slice(1)), idGen()),
        null,
      ),
    ).toBe("1 pair needs attention.");
    expect(
      startBlocker(
        buildReviewState(parse(...fullPair("pair-1"), "IMG_1.HEIC"), idGen()),
        null,
      ),
    ).toBe("Assign or discard every unassigned file.");
  });
});

describe("buildRunInput", () => {
  it("numbers client refs by visible order after edits", () => {
    const ids = idGen();
    let s = buildReviewState(
      parse(...fullPair("a"), ...fullPair("b"), ...fullPair("c", "HEIC")),
      ids,
    );
    s = removePair(s, s.pairs[1].rowId, ids);
    s = { ...s, unassigned: [] };
    s.pairs[0] = { ...s.pairs[0], brand: "  Nike ", sku: "" };

    const input = buildRunInput(s, "batch-1");

    expect(input.batchId).toBe("batch-1");
    expect(input.pairs.map((p) => p.client_ref)).toEqual(["pair-0", "pair-1"]);
    expect(input.pairs[0]).toMatchObject({ brand: "Nike", condition: "unknown" });
    expect(input.pairs[0]).not.toHaveProperty("sku");
    expect(input.pairs[1].uploads.map((u) => u.angle)).toEqual([
      ...REQUIRED_ANGLES,
    ]);
    expect(input.pairs[1].uploads[0]).toEqual({
      angle: "overview",
      file_size: 10,
      content_type: "image/heic",
      original_filename: "overview.HEIC",
    });
    expect(Object.keys(input.files)).toEqual(["pair-0", "pair-1"]);
    expect(input.files["pair-1"]?.label?.name).toBe("label.HEIC");
  });
});
