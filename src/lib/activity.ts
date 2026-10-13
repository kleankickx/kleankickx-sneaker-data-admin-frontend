/** Bulk runs this browser is waiting to hear back about (see ActivityWatcher). */

const STORAGE_KEY = "kkx.watchedBulkRuns";

export function watchedBulkRuns(): string[] {
  try {
    const value = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || "[]");
    return Array.isArray(value) ? value.filter((v) => typeof v === "string") : [];
  } catch {
    return [];
  }
}

export function setWatchedBulkRuns(ids: string[]) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(ids));
  } catch {
    // Private mode / storage blocked: we just won't notify.
  }
}

/** Notify when this bulk run finishes, pauses or is cancelled. */
export function watchBulkRun(id: string) {
  setWatchedBulkRuns([...new Set([...watchedBulkRuns(), id])]);
}
