/*
 * Bulk upload queue state.
 *
 * Lives at module level (no React provider) so the upload keeps running
 * and stays visible across route changes. Pure state transitions only;
 * all side effects belong in bulk-upload-driver.ts.
 */

import { create } from "zustand";

export type QueueStatus =
  | "queued"
  | "uploading"
  | "uploaded"
  | "completing"
  | "done"
  | "failed";

export interface QueueItem {
  id: string; // `${clientRef}:${angle}`
  pairId: string; // clientRef
  /** "Nike Air Max 90", or the clientRef when brand/model are empty. */
  pairLabel?: string;
  angle: string; // one of REQUIRED_ANGLES
  file: File;
  status: QueueStatus;
  progress: number; // 0-100
  imageId?: string;
  uploadUrl?: string;
  uploadFields?: Record<string, string | number>;
  error?: string;
  attempts: number;
}

export type JobPhase =
  | "idle"
  | "preparing"
  | "uploading"
  | "completing"
  | "done"
  | "failed";

interface Store {
  items: QueueItem[];
  phase: JobPhase;
  batchId: string | null;

  setItems: (items: QueueItem[]) => void;
  setBatchId: (id: string | null) => void;
  setPhase: (phase: JobPhase) => void;
  updateItem: (id: string, patch: Partial<QueueItem>) => void;
  reset: () => void;
}

export const useBulkUpload = create<Store>((set) => ({
  items: [],
  phase: "idle",
  batchId: null,
  setItems: (items) => set({ items }),
  setBatchId: (batchId) => set({ batchId }),
  setPhase: (phase) => set({ phase }),
  updateItem: (id, patch) =>
    set((state) => ({
      items: state.items.map((i) =>
        i.id === id ? { ...i, ...patch } : i,
      ),
    })),
  reset: () => set({ items: [], phase: "idle", batchId: null }),
}));
