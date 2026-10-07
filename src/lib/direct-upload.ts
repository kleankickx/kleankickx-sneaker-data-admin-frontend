/*
 * Upload one file straight to storage using a signed slot from the API
 * (multipart POST with the slot's fields plus the file).
 */

export interface UploadSlot {
  upload_url: string;
  fields: Record<string, string | number>;
}

export function uploadToSlot(
  slot: UploadSlot,
  file: File,
  {
    onProgress,
    signal,
  }: { onProgress?: (pct: number) => void; signal?: AbortSignal } = {},
): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException("Aborted", "AbortError"));
      return;
    }

    const xhr = new XMLHttpRequest();
    const onAbort = () => xhr.abort();
    const settle = (fn: () => void) => {
      signal?.removeEventListener("abort", onAbort);
      fn();
    };

    xhr.open("POST", slot.upload_url);
    signal?.addEventListener("abort", onAbort);

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) {
        onProgress?.(Math.round((event.loaded / event.total) * 100));
      }
    };
    xhr.onload = () =>
      settle(() => {
        if (xhr.status >= 200 && xhr.status < 300) resolve();
        else reject(new Error(`Upload failed (${xhr.status})`));
      });
    xhr.onabort = () =>
      settle(() => reject(new DOMException("Aborted", "AbortError")));
    xhr.onerror = () => settle(() => reject(new Error("Network error")));
    xhr.ontimeout = () => settle(() => reject(new Error("Upload timed out")));

    const formData = new FormData();
    formData.append("file", file);
    for (const [key, value] of Object.entries(slot.fields)) {
      formData.append(key, String(value));
    }
    xhr.send(formData);
  });
}
