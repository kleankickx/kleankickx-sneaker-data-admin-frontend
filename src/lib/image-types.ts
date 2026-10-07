/*
 * Capture image types, decided by file extension. Browsers often report
 * an empty File.type for HEIC (Chrome on Windows), so the extension is
 * the reliable signal.
 *
 * The server's GET /config/ is the source of truth; the local map below
 * is used only until (or unless) that config loads, so intake and the
 * upload payload keep working when the endpoint is slow or down.
 */

import type { UploadConfig } from "./api";

export type ContentTypeMap = Readonly<Record<string, string>>;

export const FALLBACK_CONTENT_TYPES: ContentTypeMap = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  heic: "image/heic",
  heif: "image/heic",
};

/**
 * The config's extension map, limited to its allowed content types.
 * Falls back to the local map when there is no usable config.
 */
export function contentTypesFromConfig(
  config: Pick<
    UploadConfig,
    "extension_to_content_type" | "allowed_content_types"
  > | null,
): ContentTypeMap {
  if (!config?.extension_to_content_type) return FALLBACK_CONTENT_TYPES;

  const allowed = new Set(config.allowed_content_types);
  const entries = Object.entries(config.extension_to_content_type)
    .filter(([, type]) => allowed.has(type))
    .map(([ext, type]) => [ext.toLowerCase(), type]);

  return entries.length > 0
    ? Object.fromEntries(entries)
    : FALLBACK_CONTENT_TYPES;
}

/** For <input accept>: the supported extensions. */
export function acceptFor(types: ContentTypeMap): string {
  return Object.keys(types)
    .map((ext) => `.${ext}`)
    .join(",");
}

/** Content type for a filename, or null if the type is unsupported. */
export function contentTypeForName(
  name: string,
  types: ContentTypeMap = FALLBACK_CONTENT_TYPES,
): string | null {
  const dot = name.lastIndexOf(".");
  if (dot === -1) return null;
  return types[name.slice(dot + 1).toLowerCase()] ?? null;
}

/** "12.4 MB", 1024-based to match the server's byte limit. */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;

  const [value, unit] =
    bytes < 1024 * 1024
      ? [bytes / 1024, "KB"]
      : [bytes / 1024 / 1024, "MB"];

  return `${Number(value.toFixed(1))} ${unit}`;
}
