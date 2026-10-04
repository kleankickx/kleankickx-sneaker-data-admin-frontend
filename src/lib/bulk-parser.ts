/*
 * Bulk upload filename parser.
 *
 * Turns a set of dropped/selected files into pairs of angle-tagged
 * images. Pure functions, except parseDroppedItems, which only reads
 * FileSystemEntry objects from a drop.
 *
 * Pair key resolution:
 *   1. The folder path, but only when the file's innermost folder looks
 *      like a single pair (see isPairFolder).
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

/* A folder holding at most this many files is treated as one pair. */
const MAX_FILES_PER_PAIR_FOLDER = REQUIRED_ANGLES.length;

/* OS metadata files that show up in folder drops and are never images. */
const IGNORED_FILENAMES = new Set(["thumbs.db", "desktop.ini"]);

/* ============================================================
   NAME HELPERS
   ============================================================ */

function basename(path: string): string {
  const index = path.lastIndexOf("/");
  return index === -1 ? path : path.slice(index + 1);
}

/* Everything before the last "/", or null for a root-level file. */
function folderPath(path: string): string | null {
  const index = path.lastIndexOf("/");
  return index > 0 ? path.slice(0, index) : null;
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

/* ============================================================
   CLASSIFICATION
   ============================================================ */

function hasExplicitPairKey(name: string): boolean {
  const base = stem(basename(name));
  return KKX_PAIR_PATTERN.test(base) || PAIR_NUMBER_PATTERN.test(base);
}

/**
 * Decide whether a folder is one pair's worth of images or just a
 * wrapper around loose files. `names` are the files directly inside
 * it. When in doubt this says no, so files fall back to their names.
 */
export function isPairFolder(folder: string, names: string[]): boolean {
  // A folder named like a pair always is one.
  if (hasExplicitPairKey(basename(folder))) return true;

  // Files naming their own pair ("pair-2-top.jpg") carry the truth;
  // the folder is a wrapper such as "iPhone Export".
  if (names.some(hasExplicitPairKey)) return false;

  // At most one pair's worth of files.
  if (names.length <= MAX_FILES_PER_PAIR_FOLDER) return true;

  // More than one pair's worth: only a pair folder if the names carry
  // angles ("overview.jpg") but nothing that could key them per file.
  const parsed = names.map((name) => {
    const angle = detectAngle(name);
    return { angle, key: detectPairKeyFromName(name, angle) };
  });

  return (
    parsed.some((p) => p.angle !== null) &&
    parsed.every((p) => p.key === null)
  );
}

export interface ClassifiedPath {
  relativePath: string;
  pairKey: string | null;
  angle: Angle | null;
}

/**
 * Resolve angle and pair key for every path, in input order. Folder
 * decisions use the innermost folder of each file; when a folder
 * counts as a pair, its full path is the key.
 */
export function classifyPaths(paths: string[]): ClassifiedPath[] {
  const folderContents = new Map<string, string[]>();
  for (const path of paths) {
    const folder = folderPath(path);
    if (folder === null) continue;

    const names = folderContents.get(folder);
    if (names) names.push(basename(path));
    else folderContents.set(folder, [basename(path)]);
  }

  const pairFolders = new Set(
    [...folderContents]
      .filter(([folder, names]) => isPairFolder(folder, names))
      .map(([folder]) => folder),
  );

  return paths.map((relativePath) => {
    const angle = detectAngle(relativePath);
    const folder = folderPath(relativePath);
    const pairKey =
      folder !== null && pairFolders.has(folder)
        ? folder
        : detectPairKeyFromName(relativePath, angle);

    return { relativePath, pairKey, angle };
  });
}

export function classifyFiles(
  inputs: Array<{ file: File; relativePath: string }>,
): ParseResult {
  const groups = new Map<string, ParsedFile[]>();
  const unassigned: ParsedFile[] = [];

  const classified = classifyPaths(inputs.map((i) => i.relativePath));

  inputs.forEach(({ file }, index) => {
    const { relativePath, pairKey, angle } = classified[index];
    const parsed: ParsedFile = { file, relativePath, pairKey, angle };

    if (pairKey === null) {
      unassigned.push(parsed);
      return;
    }

    const group = groups.get(pairKey);
    if (group) group.push(parsed);
    else groups.set(pairKey, [parsed]);
  });

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
   * Read every entry BEFORE the first await. The browser empties
   * dataTransfer.items as soon as the drop handler yields, so any item
   * read after an await (e.g. inside walkEntry) silently comes back
   * empty and files are lost with no error. Do not merge this loop
   * into the async walk below.
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
