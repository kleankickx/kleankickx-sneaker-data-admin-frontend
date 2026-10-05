import { useEffect, useState } from "react";

import {
  cancelBulkUpload,
  retryAllFailed,
  retryPair,
} from "../../lib/bulk-upload-driver";
import {
  useBulkUpload,
  type JobPhase,
  type QueueItem,
} from "../../lib/bulk-upload-store";

/* How long the "done" state stays visible before the panel clears. */
const DONE_DISMISS_MS = 3000;

type PairStatus = "done" | "failed" | "uploading" | "queued";

interface PairGroup {
  pairId: string;
  number: number;
  label: string;
  items: QueueItem[];
  status: PairStatus;
  retryable: boolean;
}

/* Statuses where the file has reached Cloudinary. */
const UPLOADED: ReadonlySet<QueueItem["status"]> = new Set([
  "uploaded",
  "completing",
  "done",
]);

const IN_FLIGHT: ReadonlySet<QueueItem["status"]> = new Set([
  "uploading",
  "uploaded",
  "completing",
]);

function MaterialIcon({
  name,
  className = "",
}: {
  name: string;
  className?: string;
}) {
  return (
    <span
      className={`material-symbols-outlined ${className}`}
      aria-hidden="true"
    >
      {name}
    </span>
  );
}

function groupByPair(items: QueueItem[]): PairGroup[] {
  const groups = new Map<string, QueueItem[]>();
  for (const item of items) {
    const group = groups.get(item.pairId);
    if (group) group.push(item);
    else groups.set(item.pairId, [item]);
  }

  return [...groups.entries()].map(([pairId, pairItems], index) => {
    let status: PairStatus = "queued";
    if (pairItems.every((i) => i.status === "done")) status = "done";
    else if (pairItems.some((i) => i.status === "failed")) status = "failed";
    else if (pairItems.some((i) => IN_FLIGHT.has(i.status))) {
      status = "uploading";
    }

    return {
      pairId,
      number: index + 1,
      label: pairItems[0].pairLabel ?? pairId,
      items: pairItems,
      status,
      retryable:
        status === "failed" &&
        !pairItems.some((i) => IN_FLIGHT.has(i.status)) &&
        pairItems.some((i) => i.status === "failed" && i.imageId),
    };
  });
}

/*
 * Overall progress, counting in-flight bytes so the bar moves during
 * the upload phase (items only reach "done" after complete-bulk).
 */
function overallPercent(items: QueueItem[]): number {
  if (items.length === 0) return 0;

  const total = items.reduce((sum, item) => {
    if (UPLOADED.has(item.status)) return sum + 100;
    if (item.status === "uploading") return sum + item.progress;
    return sum;
  }, 0);

  return Math.round(total / items.length);
}

function headline(phase: JobPhase, pairs: number, failed: number): string {
  const noun = `${pairs} ${pairs === 1 ? "pair" : "pairs"}`;

  switch (phase) {
    case "preparing":
      return `Preparing ${noun}…`;
    case "completing":
      return `Finishing ${noun}…`;
    case "done":
      return `Uploaded ${noun}`;
    case "failed":
      return `${noun} · ${failed} failed`;
    default:
      return `Uploading ${noun}`;
  }
}

function ProgressBar({
  value,
  label,
  className = "h-1.5",
}: {
  value: number;
  label: string;
  className?: string;
}) {
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuenow={value}
      aria-valuemin={0}
      aria-valuemax={100}
      className={`w-full overflow-hidden rounded-full bg-gray-200 ${className}`}
    >
      <div
        className="h-full rounded-full bg-gray-900 transition-[width] duration-300"
        style={{ width: `${value}%` }}
      />
    </div>
  );
}

function AngleStatus({ item }: { item: QueueItem }) {
  switch (item.status) {
    case "done":
      return (
        <span className="inline-flex items-center gap-0.5 text-gray-700">
          {item.angle}
          <MaterialIcon name="check" className="text-[14px] text-green-600" />
        </span>
      );
    case "failed":
      return (
        <span className="text-red-700">
          {item.angle}{" "}
          <MaterialIcon name="close" className="align-middle text-[14px]" />{" "}
          {item.error}
        </span>
      );
    case "uploading":
      return (
        <span className="inline-flex items-center gap-1 text-gray-700">
          {item.angle}
          <ProgressBar
            value={item.progress}
            label={`${item.angle} upload`}
            className="h-1 w-10"
          />
          <span className="tabular-nums text-gray-500">{item.progress}%</span>
        </span>
      );
    case "uploaded":
    case "completing":
      return (
        <span className="text-gray-700">
          {item.angle} <span className="text-gray-400">confirming</span>
        </span>
      );
    default:
      return (
        <span className="text-gray-500">
          {item.angle} <span className="text-gray-400">queued</span>
        </span>
      );
  }
}

const PAIR_STATUS_STYLE: Record<PairStatus, string> = {
  done: "text-green-700",
  failed: "text-red-700",
  uploading: "text-gray-700",
  queued: "text-gray-400",
};

function PairRow({ group }: { group: PairGroup }) {
  return (
    <li
      className={`rounded-lg border p-2.5 ${
        group.status === "failed"
          ? "border-red-200 bg-red-50/50"
          : "border-gray-200"
      }`}
    >
      <div className="flex items-baseline justify-between gap-2">
        <p className="truncate text-xs font-semibold text-gray-900">
          Pair {group.number} — {group.label}
        </p>
        <span
          className={`shrink-0 text-[11px] font-medium ${PAIR_STATUS_STYLE[group.status]}`}
        >
          {group.status === "done" ? "✓ done" : group.status}
        </span>
      </div>

      <ul className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-[11px]">
        {group.items.map((item) => (
          <li key={item.id}>
            <AngleStatus item={item} />
          </li>
        ))}
      </ul>

      {group.retryable && (
        <div className="mt-2 flex justify-end">
          <button
            type="button"
            onClick={() => void retryPair(group.pairId)}
            className="rounded-md border border-gray-300 bg-white px-2.5 py-1 text-[11px] font-medium text-gray-700 transition hover:bg-gray-50"
          >
            Retry pair {group.number}
          </button>
        </div>
      )}
    </li>
  );
}

export default function UploadPanel() {
  const items = useBulkUpload((s) => s.items);
  const phase = useBulkUpload((s) => s.phase);
  const reset = useBulkUpload((s) => s.reset);

  const [expanded, setExpanded] = useState(phase === "failed");
  const [seenPhase, setSeenPhase] = useState(phase);

  /* React to phase changes during render (no effect needed). */
  if (phase !== seenPhase) {
    setSeenPhase(phase);
    if (phase === "failed") setExpanded(true);
    if (phase === "preparing") setExpanded(false);
  }

  useEffect(() => {
    if (phase !== "done") return;
    const timer = window.setTimeout(reset, DONE_DISMISS_MS);
    return () => window.clearTimeout(timer);
  }, [phase, reset]);

  if (phase === "idle" && items.length === 0) return null;

  const groups = groupByPair(items);
  const failedCount = items.filter((i) => i.status === "failed").length;
  const uploadedCount = items.filter((i) => UPLOADED.has(i.status)).length;
  const percent = phase === "done" ? 100 : overallPercent(items);
  const running = phase === "uploading" || phase === "completing";
  const failedPairs = groups.filter((g) => g.retryable).length;

  const icon =
    phase === "done" ? (
      <MaterialIcon name="check_circle" className="text-[18px] text-green-600" />
    ) : phase === "failed" ? (
      <MaterialIcon name="error" className="text-[18px] text-red-600" />
    ) : (
      <MaterialIcon
        name="progress_activity"
        className="animate-spin text-[18px] text-gray-500"
      />
    );

  return (
    <section
      role="region"
      aria-label="Bulk upload progress"
      className="fixed bottom-4 right-4 z-40 w-[22rem] max-w-[calc(100vw-2rem)] rounded-xl border border-gray-200 bg-white shadow-lg"
    >
      <div className="flex items-center gap-1 px-3 pt-2.5">
        <button
          type="button"
          aria-expanded={expanded}
          onClick={() => setExpanded((open) => !open)}
          className="flex min-w-0 flex-1 items-center gap-2 rounded-md py-0.5 text-left"
        >
          {icon}
          <span className="truncate text-sm font-semibold text-gray-900">
            {headline(phase, groups.length, failedCount)}
          </span>
          <MaterialIcon
            name={expanded ? "expand_more" : "expand_less"}
            className="ml-auto text-[20px] text-gray-400"
          />
        </button>

        {running && (
          <button
            type="button"
            onClick={cancelBulkUpload}
            className="rounded-md px-2 py-1 text-xs font-medium text-gray-600 transition hover:bg-gray-100 hover:text-gray-900"
          >
            Cancel
          </button>
        )}

        {phase === "failed" && (
          <button
            type="button"
            aria-label="Dismiss"
            onClick={reset}
            className="flex h-7 w-7 items-center justify-center rounded-md text-gray-400 transition hover:bg-gray-100 hover:text-gray-700"
          >
            <MaterialIcon name="close" className="text-[18px]" />
          </button>
        )}
      </div>

      <div className="flex items-center gap-2 px-3 pb-2.5 pt-2">
        <ProgressBar value={percent} label="Overall upload progress" />
        <span className="w-9 shrink-0 text-right text-xs tabular-nums text-gray-500">
          {percent}%
        </span>
      </div>

      {expanded && (
        <div className="border-t border-gray-200 px-3 py-2.5">
          <p className="text-xs text-gray-500">
            {uploadedCount} / {items.length} images
            {failedCount > 0 && (
              <span className="text-red-700"> · {failedCount} failed</span>
            )}
          </p>

          <ul className="mt-2 max-h-80 space-y-2 overflow-y-auto pr-1">
            {groups.map((group) => (
              <PairRow key={group.pairId} group={group} />
            ))}
          </ul>

          {phase === "failed" && failedPairs > 1 && (
            <div className="mt-2.5 flex justify-end">
              <button
                type="button"
                onClick={() => void retryAllFailed()}
                className="rounded-lg bg-gray-900 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-gray-800"
              >
                Retry all failed
              </button>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
