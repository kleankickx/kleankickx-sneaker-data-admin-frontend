import { useEffect, useState } from "react";

import {
  deleteSneaker,
  getSneakerDeletionPreview,
  type DeletePairResponse,
  type PairDeletionPreview,
} from "../../lib/api";
import type { SneakerPair } from "../../lib/types";

function errorMessage(error: unknown, fallback: string): string {
  const e = error as {
    response?: { data?: { error?: { message?: string } } };
    message?: string;
  };
  return e?.response?.data?.error?.message || e?.message || fallback;
}

function plural(count: number, one: string, many = `${one}s`): string {
  return `${count} ${count === 1 ? one : many}`;
}

/* Only the non-zero parts of what will be deleted. */
function previewLines(preview: PairDeletionPreview): string[] {
  const lines: string[] = [];

  if (preview.images > 0) {
    lines.push(
      `${plural(preview.images, "photo")}` +
        (preview.stored_files > 0
          ? ` (${plural(preview.stored_files, "file")} removed from image storage)`
          : ""),
    );
  }
  if (preview.capture_sessions > 0) {
    lines.push(plural(preview.capture_sessions, "capture session"));
  }
  if (preview.identifications > 0) {
    lines.push(plural(preview.identifications, "identification"));
  }
  if (preview.materials > 0) {
    lines.push(plural(preview.materials, "material record"));
  }
  if (preview.ai_jobs > 0) {
    lines.push(plural(preview.ai_jobs, "AI identification job"));
  }

  return lines;
}

function DeletePairContent({
  pair,
  onClose,
  onDeleted,
}: {
  pair: SneakerPair;
  onClose: () => void;
  onDeleted: (result: DeletePairResponse) => void;
}) {
  const [preview, setPreview] = useState<PairDeletionPreview | null>(null);
  const [previewFailed, setPreviewFailed] = useState(false);
  const [acknowledged, setAcknowledged] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    getSneakerDeletionPreview(pair.id).then(
      (loaded) => {
        if (active) setPreview(loaded);
      },
      () => {
        if (active) setPreviewFailed(true);
      },
    );
    return () => {
      active = false;
    };
  }, [pair.id]);

  const verified =
    preview?.is_verified ?? pair.status.toLowerCase() === "verified";
  const loading = !preview && !previewFailed;
  const canDelete = !loading && !deleting && (!verified || acknowledged);
  const label = pair.pair_id ?? pair.id;
  const name = [pair.brand, pair.model].filter(Boolean).join(" ");

  async function handleDelete() {
    if (!canDelete) return;
    setDeleting(true);
    setError(null);
    try {
      onDeleted(await deleteSneaker(pair.id));
    } catch (err) {
      setError(errorMessage(err, "Could not delete this pair."));
      setDeleting(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="delete-pair-title"
      aria-describedby="delete-pair-description"
      onKeyDown={(event) => {
        if (event.key === "Escape" && !deleting) onClose();
      }}
    >
      <div className="w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="space-y-4 px-6 py-5">
          <div className="flex gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-red-100 text-red-600">
              <span className="material-symbols-outlined text-[20px]">
                delete
              </span>
            </span>
            <div className="min-w-0">
              <h2
                id="delete-pair-title"
                className="text-lg font-semibold text-gray-900"
              >
                Delete {label}?
              </h2>
              {name && <p className="truncate text-sm text-gray-500">{name}</p>}
            </div>
          </div>

          <div id="delete-pair-description" className="space-y-2 text-sm text-gray-700">
            <p>
              This permanently deletes the pair and everything recorded for
              it. It can't be undone.
            </p>

            {loading && (
              <p className="text-gray-500">Checking what will be deleted…</p>
            )}
            {preview && previewLines(preview).length > 0 && (
              <ul className="list-disc space-y-0.5 pl-5">
                {previewLines(preview).map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            )}
            {previewFailed && (
              <p className="text-gray-500">
                Couldn't load the details of what will be deleted. Deleting
                still removes all of the pair's photos and records.
              </p>
            )}
          </div>

          {verified && !loading && (
            <div className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
              <p className="font-medium">This pair has already been verified.</p>
              <label className="mt-2 flex items-start gap-2">
                <input
                  type="checkbox"
                  checked={acknowledged}
                  onChange={(event) => setAcknowledged(event.target.checked)}
                  className="mt-0.5"
                />
                <span>I understand its verification will be lost.</span>
              </label>
            </div>
          )}

          {error && (
            <p role="alert" className="text-sm text-red-700">
              {error}
            </p>
          )}
        </div>

        <div className="flex justify-end gap-3 border-t border-gray-200 px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            disabled={deleting}
            className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50 disabled:opacity-40"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleDelete}
            disabled={!canDelete}
            className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {deleting ? "Deleting…" : "Delete pair"}
          </button>
        </div>
      </div>
    </div>
  );
}

/** Confirm and delete a pair. Open by passing a pair; close with null. */
export default function DeletePairDialog({
  pair,
  onClose,
  onDeleted,
}: {
  pair: SneakerPair | null;
  onClose: () => void;
  onDeleted: (result: DeletePairResponse) => void;
}) {
  if (!pair) return null;
  return (
    <DeletePairContent
      key={pair.id}
      pair={pair}
      onClose={onClose}
      onDeleted={onDeleted}
    />
  );
}
