/*
 * Capture image types, decided by file extension. Browsers often report
 * an empty File.type for HEIC (Chrome on Windows), so the extension is
 * the reliable signal. Content types match what the backend accepts.
 */

const CONTENT_TYPE_BY_EXTENSION: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  heic: "image/heic",
  heif: "image/heic",
};

/** For <input accept>: the supported extensions. */
export const IMAGE_ACCEPT = Object.keys(CONTENT_TYPE_BY_EXTENSION)
  .map((ext) => `.${ext}`)
  .join(",");

/** Content type for a filename, or null if the type is unsupported. */
export function contentTypeForName(name: string): string | null {
  const dot = name.lastIndexOf(".");
  if (dot === -1) return null;
  return CONTENT_TYPE_BY_EXTENSION[name.slice(dot + 1).toLowerCase()] ?? null;
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
