import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { BULK_STATUS, ITEM_STATUS, done, listBulkRuns, type BulkRun } from "../../lib/bulk-runs";

/** The latest bulk runs on the pipeline monitor. */
export default function BulkRunsCard({ refresh }: { refresh: number }) {
  const [runs, setRuns] = useState<BulkRun[] | null>(null);

  useEffect(() => {
    let live = true;
    listBulkRuns().then((data) => live && setRuns(data)).catch(() => live && setRuns([]));
    return () => {
      live = false;
    };
  }, [refresh]);

  if (!runs || runs.length === 0) return null;

  return (
    <section className="mt-6 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm sm:p-6" aria-labelledby="bulk-runs-title">
      <h2 id="bulk-runs-title" className="text-base font-semibold text-gray-900">Bulk runs</h2>
      <ul className="mt-3 divide-y divide-gray-100">
        {runs.slice(0, 8).map((run) => {
          const c = run.counts;
          return (
            <li key={run.id}>
              <Link to={`/pipeline-monitor/bulk/${run.id}`} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1.5 py-3 hover:bg-gray-50 sm:grid-cols-[minmax(0,1fr)_200px_auto]">
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium text-gray-900">{run.label}</span>
                  <span className="text-xs text-gray-500">
                    {new Date(run.created_at).toLocaleString()}{run.is_test ? " · test run" : ""}
                  </span>
                </span>
                <span className="col-span-2 flex h-2 overflow-hidden rounded-full bg-gray-100 sm:col-span-1" aria-hidden="true">
                  {(["succeeded", "needs_attention", "failed", "running"] as const).map((s) => c[s] > 0 && (
                    <span key={s} className={ITEM_STATUS[s].bar} style={{ width: `${(c[s] / c.total) * 100}%` }} />
                  ))}
                </span>
                <span className="row-start-1 flex items-center gap-2 justify-self-end sm:row-start-auto">
                  <span className="text-xs tabular-nums text-gray-500">{done(c)}/{c.total}</span>
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${BULK_STATUS[run.status].badge}`}>
                    {BULK_STATUS[run.status].label}
                  </span>
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
