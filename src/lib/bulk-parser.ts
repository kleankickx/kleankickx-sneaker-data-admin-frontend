/*
 * Bulk upload filename parser.
 *
 * Turns a set of dropped/selected files into pairs of angle-tagged
 * images. Pure functions, except parseDroppedItems, which only reads
 * FileSystemEntry objects from a drop.
 *
 * Pair key resolution:
 *   1. Folder path (everything before the last "/") when present.
 *   2. Otherwise the filename: KKX-PAIR-n, then pair-n, then the stem
 *      with the angle removed.
 */

export const REQUIRED_ANGLES = [
  "overview",
  "top",
  "left",
  "right",
  "sole",
  "label",
] as const;

export type Angle = (typeof REQUIRED_ANGLES)[number];

export interface ParsedFile {
  file: File;
  /** Path relative to the dropped root, e.g. "pair-001/overview.jpg". */
  relativePath: string;
  /** Detected pair key, or null if the parser couldn't determine one. */
  pairKey: string | null;
  /** Detected angle, or null if no angle was recognized. */
  angle: Angle | null;
}

export interface ParsedPair {
  key: string;
  files: ParsedFile[];
}

export interface ParseResult {
  pairs: ParsedPair[];
  unassigned: ParsedFile[];
}

/* ============================================================
   PATTERNS
   Kept as data so they can be tuned against real operator
   filenames (see scripts/validate-parser.ts).
   ============================================================ */

/*
 * One angle word bounded by non-letters or string edges. "overview"
 * also accepts a separator in the middle ("over-view", "over_view").
 */
const ANGLE_PATTERN =
  /(?<![a-z])(overview|over[\s_-]view|top|left|right|sole|label)(?![a-z])/gi;

const KKX_PAIR_PATTERN = /KKX-PAIR-\d+/i;

/* "pair" not preceded by a letter, so "repair-5" is not pair-5. */
const PAIR_NUMBER_PATTERN = /(?<![a-z])pair[\s_-]*(\d+)/i;

/* OS metadata files that show up in folder drops and are never images. */
const IGNORED_FILENAMES = new Set(["thumbs.db", "desktop.ini"]);

/* ============================================================
   NAME HELPERS
   ============================================================ */

function basename(path: string): string {
  const index = path.lastIndexOf("/");
  return index === -1 ? path : path.slice(index + 1);
}

function stem(name: string): string {
  const index = name.lastIndexOf(".");
  return index > 0 ? name.slice(0, index) : name;
}

function normalizeAngle(match: string): Angle {
  const lower = match.toLowerCase();
  return (lower.startsWith("over") ? "overview" : lower) as Angle;
}

export function isIgnoredFile(name: string): boolean {
  const base = basename(name).toLowerCase();
  return base.startsWith(".") || IGNORED_FILENAMES.has(base);
}

/* ============================================================
   DETECTION
   ============================================================ */

/**
 * Detect the capture angle from a filename. Returns null when no angle
 * word is present, or when two different angles appear (ambiguous, so
 * the operator assigns it by hand).
 */
export function detectAngle(name: string): Angle | null {
  const matches = stem(basename(name)).match(ANGLE_PATTERN);
  if (!matches) return null;

  const angles = new Set(matches.map(normalizeAngle));
  return angles.size === 1 ? [...angles][0] : null;
}

/**
 * Derive a pair key from a filename alone (no folder information).
 */
export function detectPairKeyFromName(
  name: string,
  angle: Angle | null,
): string | null {
  const base = stem(basename(name));

  const kkx = base.match(KKX_PAIR_PATTERN);
  if (kkx) return kkx[0].toUpperCase();

  const pair = base.match(PAIR_NUMBER_PATTERN);
  if (pair) return `pair-${pair[1].replace(/^0+(?=\d)/, "")}`;

  if (angle === null) return null;

  const key = base
    .replace(
      new RegExp(`[\\s_-]*${ANGLE_PATTERN.source}[\\s_-]*`, "gi"),
      "-",
    )
    .replace(/[\s_]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-+|-+$/g, "");

  return key === "" ? null : key;
}

/**
 * Pair key for a path: the folder path when there is one, otherwise
 * whatever the filename yields.
 */
export function detectPairKeyFromPath(
  relativePath: string,
  angle: Angle | null,
): string | null {
  const index = relativePath.lastIndexOf("/");
  if (index > 0) return relativePath.slice(0, index);

  return detectPairKeyFromName(relativePath, angle);
}

/* ============================================================
   CLASSIFICATION
   ============================================================ */

export function classifyFiles(
  inputs: Array<{ file: File; relativePath: string }>,
): ParseResult {
  const groups = new Map<string, ParsedFile[]>();
  const unassigned: ParsedFile[] = [];

  for (const { file, relativePath } of inputs) {
    const angle = detectAngle(relativePath);
    const pairKey = detectPairKeyFromPath(relativePath, angle);
    const parsed: ParsedFile = { file, relativePath, pairKey, angle };

    if (pairKey === null) {
      unassigned.push(parsed);
      continue;
    }

    const group = groups.get(pairKey);
    if (group) group.push(parsed);
    else groups.set(pairKey, [parsed]);
  }

  const pairs = [...groups.entries()]
    .map(([key, files]) => ({ key, files }))
    .sort((a, b) =>
      a.key.localeCompare(b.key, undefined, { numeric: true }),
    );

  return { pairs, unassigned };
}

/* ============================================================
   DROP HANDLING
   ============================================================ */

type DroppedInput = { file: File; relativePath: string };

function entryFile(entry: FileSystemFileEntry): Promise<File> {
  return new Promise((resolve, reject) => entry.file(resolve, reject));
}

/* readEntries returns at most ~100 entries per call; read until empty. */
async function readAllEntries(
  directory: FileSystemDirectoryEntry,
): Promise<FileSystemEntry[]> {
  const reader = directory.createReader();
  const all: FileSystemEntry[] = [];

  for (;;) {
    const batch = await new Promise<FileSystemEntry[]>((resolve, reject) =>
      reader.readEntries(resolve, reject),
    );
    if (batch.length === 0) return all;
    all.push(...batch);
  }
}

async function walkEntry(
  entry: FileSystemEntry,
  parentPath: string,
  out: DroppedInput[],
): Promise<void> {
  const relativePath = parentPath
    ? `${parentPath}/${entry.name}`
    : entry.name;

  if (isIgnoredFile(entry.name)) return;

  if (entry.isFile) {
    const file = await entryFile(entry as FileSystemFileEntry);
    out.push({ file, relativePath });
    return;
  }

  if (entry.isDirectory) {
    const children = await readAllEntries(
      entry as FileSystemDirectoryEntry,
    );
    for (const child of children) {
      await walkEntry(child, relativePath, out);
    }
  }
}

/**
 * Collect every file from a drop, walking dropped folders, and
 * classify them.
 */
export async function parseDroppedItems(
  dataTransfer: DataTransfer,
): Promise<ParseResult> {
  /*
   * Entries must be read synchronously: the DataTransferItemList is
   * emptied once the drop event handler yields.
   */
  const entries: FileSystemEntry[] = [];
  const looseFiles: File[] = [];

  for (const item of Array.from(dataTransfer.items ?? [])) {
    if (item.kind !== "file") continue;

    const entry =
      typeof item.webkitGetAsEntry === "function"
        ? item.webkitGetAsEntry()
        : null;

    if (entry) {
      entries.push(entry);
    } else {
      const file = item.getAsFile();
      if (file) looseFiles.push(file);
    }
  }

  const inputs: DroppedInput[] = [];

  if (entries.length === 0 && looseFiles.length === 0) {
    for (const file of Array.from(dataTransfer.files ?? [])) {
      if (!isIgnoredFile(file.name)) {
        inputs.push({ file, relativePath: file.name });
      }
    }
    return classifyFiles(inputs);
  }

  for (const entry of entries) {
    await walkEntry(entry, "", inputs);
  }

  for (const file of looseFiles) {
    if (!isIgnoredFile(file.name)) {
      inputs.push({ file, relativePath: file.name });
    }
  }

  return classifyFiles(inputs);
}
