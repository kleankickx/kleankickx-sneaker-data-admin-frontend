/*
 * Review-screen state for bulk upload: pairs being assembled from parsed
 * files, plus leftovers the operator must assign or discard. Pure
 * functions returning new state; BulkUploadModal owns the instance.
 */

import type { BulkPairPayload } from "./api";
import type { RunBulkUploadInput } from "./bulk-upload-driver";
import {
  REQUIRED_ANGLES,
  type Angle,
  type ParseResult,
  type ParsedFile,
} from "./bulk-parser";
import { DEFAULT_CONDITION } from "./conditions";
import { contentTypeForName, formatFileSize } from "./image-types";

export interface ReviewPair {
  /** Local row identity; client_ref is only assigned at Start. */
  rowId: string;
  /** Parser's pair key, display only ("" for pairs added by hand). */
  displayKey: string;
  brand: string;
  model: string;
  sku: string;
  size: string;
  condition: string;
  files: Partial<Record<Angle, File>>;
}

export type UnassignedFile = ParsedFile & {
  /** Local identity for list keys and actions. */
  id: string;
  /** Why the modal (not the parser) put it here. */
  reason?: string;
};

export interface ReviewState {
  pairs: ReviewPair[];
  unassigned: UnassignedFile[];
}

/* Server-side maxLength for each metadata field. */
export const METADATA_MAX_LENGTH = {
  brand: 100,
  model: 255,
  sku: 100,
  size: 20,
} as const;

export type MetadataField = keyof typeof METADATA_MAX_LENGTH;

export type NewId = () => string;

export const EMPTY_REVIEW: ReviewState = { pairs: [], unassigned: [] };

function emptyPair(rowId: string, displayKey = ""): ReviewPair {
  return {
    rowId,
    displayKey,
    brand: "",
    model: "",
    sku: "",
    size: "",
    condition: DEFAULT_CONDITION,
    files: {},
  };
}

function unassignedFrom(
  file: File,
  newId: NewId,
  reason?: string,
  angle: Angle | null = null,
  relativePath = file.name,
): UnassignedFile {
  return {
    id: newId(),
    file,
    relativePath,
    pairKey: null,
    angle,
    ...(reason ? { reason } : {}),
  };
}

/* ============================================================
   BUILD
   ============================================================ */

/**
 * One review row per parsed pair, in the parser's order. Files without
 * an angle, and a second file for an angle already filled, move to
 * unassigned.
 */
export function buildReviewState(
  result: ParseResult,
  newId: NewId,
): ReviewState {
  const unassigned: UnassignedFile[] = result.unassigned.map((f) => ({
    ...f,
    id: newId(),
  }));

  const pairs = result.pairs.map((parsed) => {
    const pair = emptyPair(newId(), parsed.key);

    for (const parsedFile of parsed.files) {
      const { angle } = parsedFile;

      if (angle === null) {
        unassigned.push({ ...parsedFile, id: newId() });
      } else if (pair.files[angle]) {
        unassigned.push({
          ...parsedFile,
          id: newId(),
          reason: `Duplicate ${angle} for ${parsed.key}`,
        });
      } else {
        pair.files[angle] = parsedFile.file;
      }
    }

    return pair;
  });

  return { pairs, unassigned };
}

/* ============================================================
   EDITS
   ============================================================ */

function mapPair(
  state: ReviewState,
  rowId: string,
  fn: (pair: ReviewPair) => ReviewPair,
): ReviewPair[] {
  return state.pairs.map((p) => (p.rowId === rowId ? fn(p) : p));
}

export function addEmptyPair(state: ReviewState, rowId: string): ReviewState {
  return { ...state, pairs: [...state.pairs, emptyPair(rowId)] };
}

export function removePair(
  state: ReviewState,
  rowId: string,
  newId: NewId,
): ReviewState {
  const pair = state.pairs.find((p) => p.rowId === rowId);
  if (!pair) return state;

  const freed = REQUIRED_ANGLES.flatMap((angle) => {
    const file = pair.files[angle];
    return file ? [unassignedFrom(file, newId, undefined, angle)] : [];
  });

  return {
    pairs: state.pairs.filter((p) => p.rowId !== rowId),
    unassigned: [...state.unassigned, ...freed],
  };
}

export function updatePairMetadata(
  state: ReviewState,
  rowId: string,
  field: MetadataField | "condition",
  value: string,
): ReviewState {
  return {
    ...state,
    pairs: mapPair(state, rowId, (p) => ({ ...p, [field]: value })),
  };
}

/** Put a picked file in a slot; a replaced file is dropped. */
export function setPairFile(
  state: ReviewState,
  rowId: string,
  angle: Angle,
  file: File,
): ReviewState {
  return {
    ...state,
    pairs: mapPair(state, rowId, (p) => ({
      ...p,
      files: { ...p.files, [angle]: file },
    })),
  };
}

/** Take a file out of its slot and move it to unassigned. */
export function unassignPairFile(
  state: ReviewState,
  rowId: string,
  angle: Angle,
  newId: NewId,
): ReviewState {
  const file = state.pairs.find((p) => p.rowId === rowId)?.files[angle];
  if (!file) return state;

  return {
    pairs: mapPair(state, rowId, (p) => {
      const files = { ...p.files };
      delete files[angle];
      return { ...p, files };
    }),
    unassigned: [
      ...state.unassigned,
      unassignedFrom(file, newId, undefined, angle),
    ],
  };
}

/**
 * Move an unassigned file into a slot. A file already in the slot is
 * displaced to unassigned.
 */
export function assignFile(
  state: ReviewState,
  unassignedId: string,
  rowId: string,
  angle: Angle,
  newId: NewId,
): ReviewState {
  const entry = state.unassigned.find((u) => u.id === unassignedId);
  const pair = state.pairs.find((p) => p.rowId === rowId);
  if (!entry || !pair) return state;

  const displaced = pair.files[angle];
  const unassigned = state.unassigned.filter((u) => u.id !== unassignedId);
  if (displaced) {
    unassigned.push(
      unassignedFrom(displaced, newId, `Replaced as ${angle}`, angle),
    );
  }

  return {
    pairs: mapPair(state, rowId, (p) => ({
      ...p,
      files: { ...p.files, [angle]: entry.file },
    })),
    unassigned,
  };
}

export function discardUnassigned(
  state: ReviewState,
  unassignedId: string,
): ReviewState {
  return {
    ...state,
    unassigned: state.unassigned.filter((u) => u.id !== unassignedId),
  };
}

/* ============================================================
   VALIDATION
   ============================================================ */

export function missingAngles(pair: ReviewPair): Angle[] {
  return REQUIRED_ANGLES.filter((angle) => !pair.files[angle]);
}

/**
 * Problems that block Start for one pair. Size is checked only when
 * the server's limit is known.
 */
export function pairIssues(
  pair: ReviewPair,
  maxFileSize: number | null,
): string[] {
  const issues: string[] = [];

  const missing = missingAngles(pair);
  if (missing.length > 0) {
    issues.push(`Missing angles: ${missing.join(", ")}`);
  }

  for (const angle of REQUIRED_ANGLES) {
    const file = pair.files[angle];
    if (!file) continue;

    if (contentTypeForName(file.name) === null) {
      issues.push(`${angle} is not a supported image type`);
    }
    if (maxFileSize !== null && file.size > maxFileSize) {
      issues.push(
        `${angle} is ${formatFileSize(file.size)} — max is ${formatFileSize(maxFileSize)}`,
      );
    }
  }

  return issues;
}

/** Why Start is disabled, or null when the job can start. */
export function startBlocker(
  state: ReviewState,
  maxFileSize: number | null,
): string | null {
  if (state.pairs.length === 0) return "Add at least one pair.";

  const withIssues = state.pairs.filter(
    (p) => pairIssues(p, maxFileSize).length > 0,
  ).length;
  if (withIssues > 0) {
    return `${withIssues} ${withIssues === 1 ? "pair needs" : "pairs need"} attention.`;
  }

  if (state.unassigned.length > 0) {
    return "Assign or discard every unassigned file.";
  }

  return null;
}

/* ============================================================
   START
   ============================================================ */

/**
 * Driver input for the current rows. client_ref is assigned here, by
 * visible order, so the panel's "Pair N" matches the review screen.
 */
export function buildRunInput(
  state: ReviewState,
  batchId: string,
): RunBulkUploadInput {
  const pairs: BulkPairPayload[] = [];
  const files: RunBulkUploadInput["files"] = {};

  state.pairs.forEach((pair, index) => {
    const clientRef = `pair-${index}`;

    pairs.push({
      client_ref: clientRef,
      ...(pair.brand.trim() && { brand: pair.brand.trim() }),
      ...(pair.model.trim() && { model: pair.model.trim() }),
      ...(pair.sku.trim() && { sku: pair.sku.trim() }),
      ...(pair.size.trim() && { size: pair.size.trim() }),
      condition: pair.condition,
      uploads: REQUIRED_ANGLES.map((angle) => {
        const file = pair.files[angle];
        const contentType = file && contentTypeForName(file.name);
        if (!file || !contentType) {
          throw new Error(`Pair ${index + 1} is not ready (${angle}).`);
        }

        return {
          angle,
          file_size: file.size,
          content_type: contentType,
          original_filename: file.name,
        };
      }),
    });

    files[clientRef] = { ...pair.files };
  });

  return { batchId, pairs, files };
}
