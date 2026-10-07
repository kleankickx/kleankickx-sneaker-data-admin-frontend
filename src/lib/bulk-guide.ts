/*
 * Bulk upload guide state shared by the modal and the guide: which step
 * opens first, and whether this browser has already seen the guide.
 */

const SEEN_KEY = "kkx.bulkUploadGuideSeen";

/* Per-browser convenience only; storage may be unavailable. */
export function hasSeenBulkGuide(): boolean {
  try {
    return window.localStorage.getItem(SEEN_KEY) === "1";
  } catch {
    return false;
  }
}

export function markBulkGuideSeen(): void {
  try {
    window.localStorage.setItem(SEEN_KEY, "1");
  } catch {
    // Not remembering is fine; the guide just shows again next time.
  }
}

export const GUIDE_STEP = {
  photos: 0,
  folders: 1,
  names: 2,
  types: 3,
  review: 4,
  upload: 5,
} as const;
