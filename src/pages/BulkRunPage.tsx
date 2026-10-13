import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";

import { readApiError } from "../lib/api-errors";
import { useAuth } from "../lib/auth-context";
import {
  BULK_STATUS,
  ITEM_STATUS,
  cancelBulkRun,
  deleteBulkRun,
  done,
  getBulkRun,
  resumeBulkRun,
  retryBulkRun,
  type BulkItem,
  type BulkItemStatus,
  type BulkRun,
} from "../lib/bulk-runs";
import { duration } from "../lib/monitor";

const POLL_MS = 3000;
const ORDER: BulkItemStatus[] = ["succeeded", "needs_attention", "failed", "running", "queued", "skipped", "cancelled"];
const WHY: Record<string, string> = {
  rate_limited: "Rate limited",
  quota: "Quota or billing limit",
  unavailable: "Provider unavailable",
  photos: "No usable photos",
  vision: "No vision model result",
  pipeline: "Pipeline error",
};

function retryAt(item: BulkItem) {
  if (item.status !== "queued" || !item.next_attempt_at) return null;
  const at = new Date(item.next_attempt_at);
  return at > new Date() ? at : null;
}

/** One bulk run: progress, every pair's outcome, retries. */
export default function BulkRunPage() {
  const { bulkId = "" } = useParams<{ bulkId: string }>();
  const { can } = useAuth();
  const navigate = useNavigate();
  const [run, setRun] = useState<BulkRun | null>(null);
  const [items, setItems] = useState<BulkItem[]>([]);
  const [count, setCount] = useState(0);
  const [filter, setFilter] = useState<BulkItemStatus | "">("");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [tick, setTick] = useState(0);
  const canRun = can("run_pipeline");

  useEffect(() => {
    let live = true;
    getBulkRun(bulkId, { status: filter, page }).then(
      (data) => {
        if (!live) return;
        setRun(data.run);
        setItems(data.items);
        setCount(data.count);
        setError("");
      },
      (err) => live && setError(readApiError(err, "Couldn't load the bulk run.").message),
    );
    return () => {
      live = false;
    };
  }, [bulkId, filter, page, tick]);

  // Poll while pairs are still moving.
  const active = run !== null && (run.status === "running" || run.counts.running > 0);
  useEffect(() => {
    if (!active) return;
    const id = window.setInterval(() => {
      if (document.visibilityState === "visible") setTick((n) => n + 1);
    }, POLL_MS);
    return () => window.clearInterval(id);
  }, [active]);

  const act = useCallback(async (work: () => Promise<string>) => {
    setBusy(true);
    setNotice("");
    try {
      setNotice(await work());
      setSelected(new Set());
      setTick((n) => n + 1);
    } catch (err) {
      setNotice(readApiError(err, "That didn't work.").message);
    } finally {
      setBusy(false);
    }
  }, []);

  if (error && !run) {
    return <p role="alert" className="mx-auto mt-10 max-w-3xl rounded-xl border border-red-200 bg-white p-6 text-sm text-red-700">{error}</p>;
  }
  if (!run) {
    return <div aria-label="Loading bulk run" className="mx-auto mt-6 h-96 max-w-6xl animate-pulse rounded-2xl bg-gray-200" />;
  }

  const c = run.counts;
  const finished = done(c);
  const pct = c.total ? Math.round((finished / c.total) * 100) : 0;
  const retryable = c.failed + c.needs_attention;
  const selectable = items.filter((i) => i.status !== "running");
  const allSelected = selectable.length > 0 && selectable.every((i) => selected.has(i.id));
  const nextRetry = items.map(retryAt).filter(Boolean).sort((a, b) => a!.getTime() - b!.getTime())[0];

  async function remove() {
    if (!run || !window.confirm(
      "Delete this bulk run? Its list of pairs goes; the pairs keep their runs and results.",
    )) return;
    setBusy(true);
    try {
      await deleteBulkRun(run.id);
      navigate("/pipeline-monitor", { replace: true });
    } catch (err) {
      setNotice(readApiError(err, "Couldn't delete the bulk run.").message);
      setBusy(false);
    }
  }

  function toggle(id: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <Link to="/pipeline-monitor" className="inline-flex items-center gap-1 text-sm font-medium text-gray-500 hover:text-gray-900">
        <span aria-hidden="true" className="material-symbols-outlined text-[18px]">arrow_back</span>
        Pipeline monitor
      </Link>

      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight text-gray-900">Bulk run</h1>
            <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${BULK_STATUS[run.status].badge}`}>
              {BULK_STATUS[run.status].label}
            </span>
            {run.is_test && (
              <span className="rounded-full bg-violet-50 px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wide text-violet-700 ring-1 ring-inset ring-violet-600/20">Test run</span>
            )}
          </div>
          <p className="mt-1 text-sm text-gray-600">{run.label}</p>
          <p className="mt-0.5 text-xs text-gray-500">
            Started {new Date(run.created_at).toLocaleString()}{run.created_by ? ` by ${run.created_by}` : ""}
            {Object.entries(run.overrides).length > 0 &&
              ` · ${Object.entries(run.overrides).map(([k, v]) => `${k.replace("_", " ")} ${v}`).join(", ")}`}
          </p>
        </div>
        {canRun && (
          <div className="flex flex-wrap gap-2">
            {run.status === "paused" && (
              <button type="button" disabled={busy} onClick={() => act(async () => { await resumeBulkRun(run.id); return "Resumed."; })}
                className="rounded-lg bg-gray-900 px-3 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50">
                Resume
              </button>
            )}
            {retryable > 0 && (
              <button type="button" disabled={busy}
                onClick={() => act(async () => {
                  const r = await retryBulkRun(run.id, { statuses: ["failed", "needs_attention"] });
                  return `${r.queued} pair${r.queued === 1 ? "" : "s"} queued again.`;
                })}
                className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50">
                Retry failed ({retryable})
              </button>
            )}
            {(run.status === "running" || run.status === "paused") && (
              <button type="button" disabled={busy}
                onClick={() => {
                  if (window.confirm("Cancel the pairs still queued? Pairs already running will finish.")) {
                    act(async () => { await cancelBulkRun(run.id); return "Cancelled."; });
                  }
                }}
                className="rounded-lg border border-red-200 bg-white px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-50">
                Cancel
              </button>
            )}
            {(run.status === "completed" || run.status === "cancelled") && (
              <button type="button" disabled={busy} onClick={remove}
                className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 bg-white px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-50">
                <span aria-hidden="true" className="material-symbols-outlined text-[18px]">delete</span>
                Delete
              </button>
            )}
          </div>
        )}
      </header>

      {run.status === "paused" && (
        <div role="alert" className="flex gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4">
          <span aria-hidden="true" className="material-symbols-outlined text-amber-600">pause_circle</span>
          <div className="text-sm text-amber-900">
            <p className="font-medium">Paused: nothing more is being sent to the vision provider.</p>
            <p className="mt-0.5 text-amber-800">{run.pause_reason}</p>
          </div>
        </div>
      )}
      {run.status === "running" && c.running === 0 && c.waiting_retry > 0 && nextRetry && (
        <div className="flex gap-3 rounded-xl border border-sky-200 bg-sky-50 p-4 text-sm text-sky-900">
          <span aria-hidden="true" className="material-symbols-outlined text-sky-600">hourglass_top</span>
          Waiting out the provider's rate limit. {c.waiting_retry} pair{c.waiting_retry === 1 ? "" : "s"} try again from {nextRetry.toLocaleTimeString()}.
        </div>
      )}
      {notice && <p role="status" className="rounded-lg bg-gray-900 px-4 py-2 text-sm text-white">{notice}</p>}

      <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm sm:p-6">
        <div className="flex items-baseline justify-between">
          <p className="text-sm font-medium text-gray-900">{finished} of {c.total} pairs done</p>
          <p className="text-sm tabular-nums text-gray-500">{pct}%</p>
        </div>
        <div className="mt-2 flex h-3 overflow-hidden rounded-full bg-gray-100" role="img"
          aria-label={ORDER.filter((s) => c[s]).map((s) => `${c[s]} ${ITEM_STATUS[s].label.toLowerCase()}`).join(", ")}>
          {ORDER.map((s) => c[s] > 0 && (
            <span key={s} className={`h-full transition-all duration-500 ${ITEM_STATUS[s].bar} ${s === "running" ? "motion-safe:animate-pulse" : ""}`}
              style={{ width: `${(c[s] / c.total) * 100}%` }} />
          ))}
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <button type="button" aria-pressed={filter === ""} onClick={() => { setFilter(""); setPage(1); }}
            className={`rounded-full px-3 py-1 text-xs font-medium ring-1 ring-inset ${filter === "" ? "bg-gray-900 text-white ring-gray-900" : "bg-white text-gray-700 ring-gray-200"}`}>
            All {c.total}
          </button>
          {ORDER.filter((s) => c[s] > 0).map((s) => (
            <button key={s} type="button" aria-pressed={filter === s} onClick={() => { setFilter(s); setPage(1); }}
              className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium ring-1 ring-inset ${
                filter === s ? "bg-gray-900 text-white ring-gray-900" : ITEM_STATUS[s].badge
              }`}>
              <span className={`h-2 w-2 rounded-full ${ITEM_STATUS[s].bar}`} />
              {ITEM_STATUS[s].label} {c[s]}
            </button>
          ))}
        </div>
      </section>

      <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
        {canRun && selected.size > 0 && (
          <div className="flex items-center justify-between gap-3 border-b border-gray-200 bg-gray-50 px-5 py-3 text-sm">
            <span>{selected.size} selected</span>
            <button type="button" disabled={busy}
              onClick={() => act(async () => {
                const r = await retryBulkRun(run.id, { items: [...selected] });
                return `${r.queued} pair${r.queued === 1 ? "" : "s"} queued to run again.`;
              })}
              className="rounded-lg bg-gray-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50">
              Run selected again
            </button>
          </div>
        )}
        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-left text-[11px] font-semibold uppercase tracking-wider text-gray-400">
                {canRun && (
                  <th className="w-10 px-4 py-3">
                    <input type="checkbox" aria-label="Select all on this page" className="h-4 w-4 accent-gray-900"
                      checked={allSelected} disabled={!selectable.length}
                      onChange={() => setSelected(allSelected ? new Set() : new Set(selectable.map((i) => i.id)))} />
                  </th>
                )}
                <th className="px-4 py-3">Pair</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Result</th>
                <th className="px-4 py-3">Details</th>
                <th className="px-4 py-3 text-right">Run</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {items.length === 0 && (
                <tr><td colSpan={6} className="px-4 py-10 text-center text-gray-500">No pairs here.</td></tr>
              )}
              {items.map((item) => {
                const at = retryAt(item);
                const result = item.result;
                return (
                  <tr key={item.id} className={selected.has(item.id) ? "bg-gray-50" : ""}>
                    {canRun && (
                      <td className="px-4 py-3">
                        <input type="checkbox" aria-label={`Select ${item.sneaker_pair_id}`} className="h-4 w-4 accent-gray-900"
                          checked={selected.has(item.id)} disabled={item.status === "running"} onChange={() => toggle(item.id)} />
                      </td>
                    )}
                    <td className="px-4 py-3">
                      <Link to={`/sneakers/${item.sneaker_pair}`} className="font-mono text-xs font-medium text-gray-900 hover:underline">
                        {item.sneaker_pair_id}
                      </Link>
                      {(item.brand || item.model) && <p className="text-xs text-gray-500">{[item.brand, item.model].filter(Boolean).join(" ")}</p>}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${ITEM_STATUS[item.status].badge}`}>
                        {item.status === "running" && <span aria-hidden="true" className="material-symbols-outlined animate-spin text-[13px]">progress_activity</span>}
                        {ITEM_STATUS[item.status].label}
                      </span>
                      {item.attempts > 1 && <p className="mt-0.5 text-[11px] text-gray-500">{item.attempts} attempts</p>}
                      {at && <p className="mt-0.5 text-[11px] text-sky-700">Retries at {at.toLocaleTimeString()}</p>}
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-700">
                      {result ? (
                        <span className="space-y-0.5">
                          {(["brand", "model", "sku", "size"] as const).map((f) => result[f]?.value && (
                            <span key={f} className="block">
                              {result[f]!.value}
                              <span className={`ml-1 tabular-nums ${result[f]!.confidence < 0.8 ? "text-amber-700" : "text-gray-400"}`}>
                                {Math.round(result[f]!.confidence * 100)}%
                              </span>
                            </span>
                          ))}
                        </span>
                      ) : <span className="text-gray-400">—</span>}
                    </td>
                    <td className="max-w-xs px-4 py-3 text-xs">
                      {item.error_kind && <p className="font-medium text-gray-800">{WHY[item.error_kind] ?? item.error_kind}</p>}
                      {item.error && <p className="line-clamp-2 text-gray-500" title={item.error}>{item.error}</p>}
                      {!item.error && item.duration_ms !== null && <p className="text-gray-500">{duration(item.duration_ms)}</p>}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {item.run ? (
                        <Link to={`/pipeline-monitor/runs/${item.run}`} className="text-xs font-medium text-gray-700 underline underline-offset-2 hover:text-gray-900">
                          View
                        </Link>
                      ) : <span className="text-xs text-gray-400">—</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {count > 50 && (
          <div className="flex items-center justify-between border-t border-gray-200 px-5 py-3 text-sm text-gray-600">
            <span>{count} pairs</span>
            <div className="flex gap-2">
              <button type="button" disabled={page <= 1} onClick={() => setPage(page - 1)} className="rounded-lg border border-gray-300 px-3 py-1 disabled:opacity-40">Previous</button>
              <span className="px-2 py-1">{page} / {Math.ceil(count / 50)}</span>
              <button type="button" disabled={page >= Math.ceil(count / 50)} onClick={() => setPage(page + 1)} className="rounded-lg border border-gray-300 px-3 py-1 disabled:opacity-40">Next</button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
