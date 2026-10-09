import { useEffect, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";

import BarChart from "../components/monitor/BarChart";
import {
  getFunnelPairs,
  getPipelineOverview,
  rerunAnalysis,
  type FunnelPair,
  type FunnelStep,
  type MonitorParams,
  type PipelineOverview,
  type SneakersMeta,
} from "../lib/api";
import { readApiError } from "../lib/api-errors";
import {
  FIELD_LABELS,
  FUNNEL_LABELS,
  VIEW_LABELS,
  age,
  duration,
  lastNDays,
  pct,
  shortDay,
} from "../lib/monitor";

const REFRESH_MS = 30_000;

function formatTime(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? ""
    : new Intl.DateTimeFormat("en-US", {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      }).format(date);
}

/* ------------------------------------------------------------------ */
/* Building blocks                                                     */
/* ------------------------------------------------------------------ */

function Card({
  title,
  subtitle,
  children,
  className = "",
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`rounded-2xl border border-gray-200 bg-white p-5 shadow-sm sm:p-6 ${className}`}>
      <h2 className="text-base font-semibold text-gray-900">{title}</h2>
      {subtitle && <p className="mt-0.5 text-sm text-gray-500">{subtitle}</p>}
      <div className="mt-4">{children}</div>
    </section>
  );
}

function Stat({ label, value, hint }: { label: string; value: ReactNode; hint?: string }) {
  return (
    <div className="rounded-xl border border-gray-100 bg-gray-50/60 px-4 py-3">
      <p className="text-xs font-medium uppercase tracking-wide text-gray-500">{label}</p>
      <p className="mt-1 text-xl font-semibold text-gray-900">{value}</p>
      {hint && <p className="mt-0.5 text-xs text-gray-500">{hint}</p>}
    </div>
  );
}

/* A 0-1 rate as a thin bar with its value. */
function RateBar({ rate }: { rate: number | null }) {
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-gray-100">
        <div
          className="h-full rounded-full bg-gray-700"
          style={{ width: `${Math.round((rate ?? 0) * 100)}%` }}
        />
      </div>
      <span className="w-12 shrink-0 text-right text-sm tabular-nums text-gray-700">{pct(rate)}</span>
    </div>
  );
}

const TH = "px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-gray-500";
const TD = "px-3 py-2 text-sm text-gray-700";

/* ------------------------------------------------------------------ */
/* Funnel step list                                                    */
/* ------------------------------------------------------------------ */

function FunnelList({
  step,
  params,
  onClose,
}: {
  step: FunnelStep;
  params: MonitorParams;
  onClose: () => void;
}) {
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState<FunnelPair[] | null>(null);
  const [meta, setMeta] = useState<SneakersMeta | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let current = true;
    getFunnelPairs(step, params, page).then(
      (data) => {
        if (!current) return;
        setRows(data.results);
        setMeta(data.meta);
      },
      () => current && setFailed(true),
    );
    return () => {
      current = false;
    };
  }, [step, params, page]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="funnel-list-title"
      onKeyDown={(event) => event.key === "Escape" && onClose()}
    >
      <div className="flex max-h-[85vh] w-full max-w-xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-gray-200 px-5 py-4">
          <h2 id="funnel-list-title" className="text-base font-semibold text-gray-900">
            {FUNNEL_LABELS[step]}
            {meta && <span className="ml-2 text-sm font-normal text-gray-500">{meta.count}</span>}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="text-gray-400 hover:text-gray-700"
          >
            <span aria-hidden="true" className="material-symbols-outlined">close</span>
          </button>
        </div>
        <div className="flex-1 overflow-y-auto">
          {failed ? (
            <p className="p-6 text-sm text-red-700">Couldn't load these pairs.</p>
          ) : rows === null ? (
            <p className="p-6 text-sm text-gray-500">Loading…</p>
          ) : rows.length === 0 ? (
            <p className="p-6 text-sm text-gray-500">No pairs at this step.</p>
          ) : (
            <ul className="divide-y divide-gray-100">
              {rows.map((row) => (
                <li key={row.id}>
                  <Link
                    to={`/sneakers/${row.id}`}
                    className="flex items-center justify-between gap-3 px-5 py-3 hover:bg-gray-50"
                  >
                    <span className="min-w-0">
                      <span className="block truncate font-mono text-sm font-semibold text-gray-900">
                        {row.pair_id}
                      </span>
                      <span className="block truncate text-xs text-gray-500">
                        {[row.brand, row.model].filter(Boolean).join(" ") || "Not identified"} ·{" "}
                        {row.status}
                      </span>
                    </span>
                    <span className="shrink-0 text-xs text-gray-400">{formatTime(row.created_at)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
        {meta && (meta.next || meta.previous) && (
          <div className="flex justify-end gap-2 border-t border-gray-100 px-5 py-3">
            <button
              type="button"
              disabled={!meta.previous}
              onClick={() => setPage((p) => p - 1)}
              className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm font-medium text-gray-700 disabled:opacity-40"
            >
              Previous
            </button>
            <button
              type="button"
              disabled={!meta.next}
              onClick={() => setPage((p) => p + 1)}
              className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm font-medium text-gray-700 disabled:opacity-40"
            >
              Next
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Sections                                                            */
/* ------------------------------------------------------------------ */

function Funnel({
  funnel,
  onOpen,
}: {
  funnel: PipelineOverview["funnel"];
  onOpen: (step: FunnelStep) => void;
}) {
  const top = Math.max(1, funnel[0]?.count ?? 0);
  return (
    <Card title="Flow" subtitle="Pairs captured in the range. Select a step to see its pairs.">
      <ol className="space-y-2">
        {funnel.map((step) => (
          <li key={step.step}>
            <button
              type="button"
              onClick={() => onOpen(step.step)}
              className="grid w-full grid-cols-[minmax(0,11rem)_1fr_auto] items-center gap-3 rounded-lg px-2 py-1.5 text-left hover:bg-gray-50"
            >
              <span className="truncate text-sm text-gray-700">{FUNNEL_LABELS[step.step]}</span>
              <span className="h-5 overflow-hidden rounded-[4px] bg-gray-100">
                <span
                  className="block h-full rounded-[4px] bg-gray-700"
                  style={{ width: `${(step.count / top) * 100}%` }}
                />
              </span>
              <span className="w-24 text-right text-sm tabular-nums text-gray-900">
                <span className="font-semibold">{step.count}</span>{" "}
                <span className="text-gray-500">{pct(step.rate)}</span>
              </span>
            </button>
          </li>
        ))}
      </ol>
    </Card>
  );
}

function RunHealth({
  health,
  onRerun,
  rerunning,
}: {
  health: PipelineOverview["run_health"];
  onRerun: (pairId: string) => void;
  rerunning: Set<string>;
}) {
  const jobs = health.jobs_by_status;
  return (
    <Card title="Run health">
      {health.queue_stuck && (
        <div role="status" className="mb-4 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-800">
          <span aria-hidden="true" className="material-symbols-outlined text-[18px]">warning</span>
          <span>
            <span className="font-medium">Queue may be stuck.</span> The oldest queued job has
            waited {age(health.oldest_queued_age_seconds)}. Check the Celery worker.
          </span>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat
          label="Runs"
          value={health.runs}
          hint={`+ ${health.test_runs} test run${health.test_runs === 1 ? "" : "s"}, not counted below`}
        />
        <Stat label="Avg duration" value={duration(health.avg_duration_ms)} />
        <Stat label="95th percentile" value={duration(health.p95_duration_ms)} />
        <Stat
          label="Vision failures"
          value={pct(health.vision_failure_rate)}
          hint={`${health.vision_failed} saved label-only${
            health.vision_disabled ? ` · ${health.vision_disabled} with vision off` : ""
          }`}
        />
      </div>

      <dl className="mt-4 flex flex-wrap gap-2 text-sm">
        {[
          ["Queued", jobs.queued],
          ["Running", jobs.processing],
          ["Done", jobs.completed],
          ["Failed", jobs.failed],
        ].map(([label, count]) => (
          <div key={label} className="flex items-center gap-1.5 rounded-lg bg-gray-100 px-2.5 py-1">
            <dt className="text-gray-600">{label}</dt>
            <dd className="font-semibold tabular-nums text-gray-900">{count}</dd>
          </div>
        ))}
        <div className="flex items-center gap-1.5 rounded-lg bg-gray-100 px-2.5 py-1">
          <dt className="text-gray-600">Oldest queued</dt>
          <dd className="font-semibold text-gray-900">{age(health.oldest_queued_age_seconds)}</dd>
        </div>
      </dl>

      <h3 className="mt-5 text-sm font-medium text-gray-700">Runs per day</h3>
      <div className="mt-2">
        <BarChart
          unit="run"
          bars={health.runs_per_day.map((d) => ({ key: d.day, label: shortDay(d.day), value: d.count }))}
        />
      </div>

      <h3 className="mt-6 text-sm font-medium text-gray-700">Recent failures</h3>
      {health.recent_failures.length === 0 ? (
        <p className="mt-2 text-sm text-gray-500">No failures in this range.</p>
      ) : (
        <div className="mt-2 overflow-x-auto">
          <table className="w-full">
            <thead className="border-b border-gray-100">
              <tr>
                <th className={TH}>Pair</th>
                <th className={TH}>What failed</th>
                <th className={TH}>Error</th>
                <th className={TH}>When</th>
                <th className={TH}><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {health.recent_failures.map((f) => (
                <tr key={`${f.kind}-${f.job_id ?? f.run_id}`}>
                  <td className={TD}>
                    <Link to={`/sneakers/${f.sneaker_pair}`} className="font-mono text-xs font-semibold text-gray-900 hover:underline">
                      {f.sneaker_pair_id}
                    </Link>
                  </td>
                  <td className={TD}>{f.kind === "job_failed" ? "Whole run" : "Vision model"}</td>
                  <td className={`${TD} max-w-xs`}>
                    <span className="line-clamp-2 text-xs text-gray-600" title={f.error}>{f.error || "—"}</span>
                  </td>
                  <td className={`${TD} whitespace-nowrap text-xs`}>{formatTime(f.at)}</td>
                  <td className={`${TD} whitespace-nowrap text-right`}>
                    {f.run_id && (
                      <Link to={`/pipeline-monitor/runs/${f.run_id}`} className="mr-3 text-xs font-medium text-gray-700 underline underline-offset-2">
                        View run
                      </Link>
                    )}
                    <button
                      type="button"
                      onClick={() => onRerun(f.sneaker_pair)}
                      disabled={rerunning.has(f.sneaker_pair)}
                      className="rounded-lg border border-gray-200 px-2.5 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                    >
                      {rerunning.has(f.sneaker_pair) ? "Queued" : "Re-run"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <h3 className="mt-6 text-sm font-medium text-gray-700">Recent runs</h3>
      {health.recent_runs.length === 0 ? (
        <p className="mt-2 text-sm text-gray-500">No runs in this range.</p>
      ) : (
        <ul className="mt-2 divide-y divide-gray-100 rounded-lg border border-gray-100">
          {health.recent_runs.map((run) => (
            <li key={run.run_id}>
              <Link
                to={`/pipeline-monitor/runs/${run.run_id}`}
                className="flex items-center justify-between gap-3 px-3 py-2 text-sm hover:bg-gray-50"
              >
                <span className="flex items-center gap-2 font-mono text-xs font-semibold text-gray-900">
                  {run.sneaker_pair_id}
                  {run.is_test && (
                    <span className="rounded bg-violet-50 px-1.5 py-0.5 font-sans text-[10px] font-semibold uppercase text-violet-700">
                      Test
                    </span>
                  )}
                </span>
                <span className="truncate text-xs text-gray-500">
                  {run.prompt_version} · {run.model_name || "no vision model"}
                  {!run.vlm_used && " · label-only"} · {duration(run.duration_ms)}
                </span>
                <span className="shrink-0 text-xs text-gray-400">{formatTime(run.created_at)}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function Stages({ stages }: { stages: PipelineOverview["stages"] }) {
  return (
    <Card title="Stage success" subtitle={`Over ${stages.runs} runs.`}>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Stat label="QC passed" value={pct(stages.qc.pass_rate)} hint="All photos present passed" />
        <Stat label="Barcode decoded" value={pct(stages.barcode_rate)} />
        <Stat label="SKU found" value={pct(stages.sku_found_rate)} />
        <Stat label="Catalog hit" value={pct(stages.catalog_hit_rate)} />
        <Stat
          label="Size found"
          value={pct(stages.size_found_rate)}
          hint={`${pct(stages.size_consistent_rate)} of those consistent`}
        />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <div>
          <h3 className="text-sm font-medium text-gray-700">Quality check pass rate per angle</h3>
          <ul className="mt-2 space-y-2">
            {stages.qc.per_view.map((v) => (
              <li key={v.view} className="grid grid-cols-[6rem_1fr] items-center gap-3">
                <span className="text-sm text-gray-600">
                  {VIEW_LABELS[v.view] ?? v.view}
                  <span className="ml-1 text-xs text-gray-400">({v.runs})</span>
                </span>
                <RateBar rate={v.pass_rate} />
              </li>
            ))}
          </ul>

          <h3 className="mt-5 text-sm font-medium text-gray-700">Top quality issues</h3>
          {stages.qc.top_issues.length === 0 ? (
            <p className="mt-2 text-sm text-gray-500">No issues recorded.</p>
          ) : (
            <ol className="mt-2 space-y-1 text-sm">
              {stages.qc.top_issues.map((issue) => (
                <li key={issue.issue} className="flex justify-between gap-3">
                  <span className="text-gray-700">{issue.issue}</span>
                  <span className="tabular-nums text-gray-500">{issue.count}</span>
                </li>
              ))}
            </ol>
          )}

          <h3 className="mt-5 text-sm font-medium text-gray-700">Where the SKU came from</h3>
          <ul className="mt-2 space-y-2">
            {(
              [
                ["barcode", "Barcode → catalog"],
                ["ocr", "OCR"],
                ["ai", "Vision model"],
              ] as const
            ).map(([source, label]) => (
              <li key={source} className="grid grid-cols-[8rem_1fr] items-center gap-3">
                <span className="text-sm text-gray-600">
                  {label}
                  <span className="ml-1 text-xs text-gray-400">({stages.sku_sources[source].count})</span>
                </span>
                <RateBar rate={stages.sku_sources[source].rate} />
              </li>
            ))}
          </ul>
        </div>

        <div>
          <h3 className="text-sm font-medium text-gray-700">Confidence per field</h3>
          <table className="mt-2 w-full">
            <thead className="border-b border-gray-100">
              <tr>
                <th className={TH}>Field</th>
                <th className={`${TH} text-right`}>Avg</th>
                <th className={`${TH} text-right`}>Below 0.8</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {stages.fields.map((f) => (
                <tr key={f.field}>
                  <td className={TD}>{FIELD_LABELS[f.field] ?? f.field}</td>
                  <td className={`${TD} text-right tabular-nums`}>
                    {f.avg_confidence === null ? "—" : f.avg_confidence.toFixed(2)}
                  </td>
                  <td className={`${TD} text-right tabular-nums`}>{pct(f.below_threshold_rate)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </Card>
  );
}

function Review({ review }: { review: PipelineOverview["review"] }) {
  const versions = [...new Set(review.changed_by_field.map((r) => r.prompt_version))];
  const fields = [...new Set(review.changed_by_field.map((r) => r.field))];
  const cell = (version: string, field: string) =>
    review.changed_by_field.find((r) => r.prompt_version === version && r.field === field);

  return (
    <Card title="Review and accuracy">
      <div className="grid grid-cols-2 gap-3">
        <Stat label="Review queue" value={review.queue_size} />
        <Stat label="Oldest unverified" value={age(review.oldest_unverified_age_seconds)} />
      </div>

      <h3 className="mt-5 text-sm font-medium text-gray-700">Pairs verified per day</h3>
      <div className="mt-2">
        <BarChart
          unit="pair"
          bars={review.verified_per_day.map((d) => ({ key: d.day, label: shortDay(d.day), value: d.count }))}
        />
      </div>

      <h3 className="mt-5 text-sm font-medium text-gray-700">Verified per reviewer</h3>
      {review.verified_per_reviewer.length === 0 ? (
        <p className="mt-2 text-sm text-gray-500">No pairs verified in this range.</p>
      ) : (
        <ul className="mt-2 space-y-1 text-sm">
          {review.verified_per_reviewer.map((r) => (
            <li key={r.reviewer} className="flex justify-between">
              <span className="text-gray-700">{r.reviewer}</span>
              <span className="tabular-nums text-gray-500">{r.count}</span>
            </li>
          ))}
        </ul>
      )}

      <h3 className="mt-5 text-sm font-medium text-gray-700">AI values changed by the reviewer</h3>
      <p className="text-xs text-gray-500">Lower is better: the share of verified fields where the reviewer replaced the AI's value.</p>
      {versions.length === 0 ? (
        <p className="mt-2 text-sm text-gray-500">No reviewed analyses in this range.</p>
      ) : (
        <div className="mt-2 overflow-x-auto">
          <table className="w-full">
            <thead className="border-b border-gray-100">
              <tr>
                <th className={TH}>Field</th>
                {versions.map((v) => (
                  <th key={v} className={`${TH} text-right`}>{v}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {fields.map((field) => (
                <tr key={field}>
                  <td className={TD}>{FIELD_LABELS[field] ?? field}</td>
                  {versions.map((v) => {
                    const c = cell(v, field);
                    return (
                      <td key={v} className={`${TD} text-right tabular-nums`} title={c ? `${c.changed} of ${c.reviewed}` : undefined}>
                        {c ? pct(c.changed_rate) : "—"}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

function Catalog({ catalog }: { catalog: PipelineOverview["catalog"] }) {
  return (
    <Card title="Catalog">
      <Stat label="Entries" value={catalog.total} />
      <h3 className="mt-5 text-sm font-medium text-gray-700">Entries added per week</h3>
      <div className="mt-2">
        <BarChart
          unit="entry"
          height={90}
          bars={catalog.added_per_week.map((w) => ({ key: w.week, label: shortDay(w.week), value: w.count }))}
        />
      </div>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/* Page                                                                */
/* ------------------------------------------------------------------ */

/**
 * Phase 1 pipeline monitor (staff only): flow funnel, run health, stage
 * success, review accuracy and catalog growth, refreshed every 30 s.
 */
export default function PipelineMonitorPage() {
  const [params, setParams] = useState<MonitorParams>(() => lastNDays(7));
  const [data, setData] = useState<PipelineOverview | null>(null);
  const [error, setError] = useState<{ forbidden: boolean; message: string } | null>(null);
  const [tick, setTick] = useState(0);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [loadedAt, setLoadedAt] = useState<Date | null>(null);
  const [openStep, setOpenStep] = useState<FunnelStep | null>(null);
  const [rerunning, setRerunning] = useState<Set<string>>(new Set());
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    let current = true;
    getPipelineOverview(params).then(
      (overview) => {
        if (!current) return;
        setData(overview);
        setError(null);
        setLoadedAt(new Date());
      },
      (err) => {
        if (!current) return;
        const status = (err as { response?: { status?: number } })?.response?.status;
        setError({
          forbidden: status === 403,
          message: readApiError(err, "Couldn't load the pipeline metrics.").message,
        });
      },
    );
    return () => {
      current = false;
    };
  }, [params, tick]);

  useEffect(() => {
    if (!autoRefresh) return;
    const id = window.setInterval(() => {
      // Skip while the tab is in the background.
      if (document.visibilityState === "visible") setTick((n) => n + 1);
    }, REFRESH_MS);
    return () => window.clearInterval(id);
  }, [autoRefresh]);

  function setParam(key: keyof MonitorParams, value: string) {
    setParams((current) => ({ ...current, [key]: value || undefined }));
  }

  async function rerun(pairId: string) {
    setRerunning((current) => new Set(current).add(pairId));
    try {
      await rerunAnalysis(pairId);
      setNotice("Analysis queued.");
      setTick((n) => n + 1);
    } catch (err) {
      setRerunning((current) => {
        const next = new Set(current);
        next.delete(pairId);
        return next;
      });
      setNotice(readApiError(err, "Couldn't queue the analysis.").message);
    }
  }

  if (error?.forbidden) {
    return (
      <div className="min-h-screen bg-gray-50">
        <main className="mx-auto max-w-3xl px-4 py-16 text-center">
          <h1 className="text-lg font-semibold text-gray-900">Staff only</h1>
          <p className="mt-1 text-sm text-gray-500">The pipeline monitor is available to staff accounts.</p>
        </main>
      </div>
    );
  }

  const field = "h-10 rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-700 outline-none focus:border-gray-500 focus:ring-2 focus:ring-gray-200";

  return (
    <div className="min-h-screen bg-gray-50">
      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-gray-900">Pipeline monitor</h1>
            <p className="mt-1 text-sm text-gray-500">
              Capture-to-verification flow and analysis health.
              {loadedAt && ` Updated ${loadedAt.toLocaleTimeString()}.`}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 text-sm text-gray-600">
              <input
                type="checkbox"
                checked={autoRefresh}
                onChange={(event) => setAutoRefresh(event.target.checked)}
                className="h-4 w-4 rounded border-gray-300"
              />
              Refresh every 30 s
            </label>
            <button
              type="button"
              onClick={() => setTick((n) => n + 1)}
              className="inline-flex items-center gap-1.5 rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              <span aria-hidden="true" className="material-symbols-outlined text-[18px]">refresh</span>
              Refresh
            </button>
          </div>
        </div>

        {/* Filters, one row above everything they affect. */}
        <div className="mt-5 flex flex-wrap items-end gap-3 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
          <label className="text-xs font-medium text-gray-600">
            From
            <input type="date" value={params.from ?? ""} max={params.to}
              onChange={(e) => setParam("from", e.target.value)} className={`mt-1 block ${field}`} />
          </label>
          <label className="text-xs font-medium text-gray-600">
            To
            <input type="date" value={params.to ?? ""} min={params.from}
              onChange={(e) => setParam("to", e.target.value)} className={`mt-1 block ${field}`} />
          </label>
          <label className="text-xs font-medium text-gray-600">
            Prompt version
            <select value={params.prompt_version ?? ""} onChange={(e) => setParam("prompt_version", e.target.value)}
              className={`mt-1 block ${field}`}>
              <option value="">All</option>
              {data?.filters.prompt_versions.map((v) => <option key={v} value={v}>{v}</option>)}
            </select>
          </label>
          <label className="text-xs font-medium text-gray-600">
            Model
            <select value={params.model ?? ""} onChange={(e) => setParam("model", e.target.value)}
              className={`mt-1 block ${field}`}>
              <option value="">All</option>
              {data?.filters.models.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
          </label>
          <div className="flex gap-1">
            {[7, 30, 90].map((n) => (
              <button key={n} type="button" onClick={() => setParams((c) => ({ ...c, ...lastNDays(n) }))}
                className="h-10 rounded-lg border border-gray-200 px-3 text-sm text-gray-700 hover:bg-gray-50">
                {n} days
              </button>
            ))}
          </div>
          <p className="basis-full text-xs text-gray-400">
            Prompt and model filters apply to analysis runs and the reviews of them.
          </p>
        </div>

        {notice && (
          <p role="status" className="mt-4 rounded-lg bg-gray-900 px-4 py-2 text-sm text-white">
            {notice}
            <button type="button" onClick={() => setNotice(null)} className="ml-3 underline">Dismiss</button>
          </p>
        )}

        {error && !data && (
          <div className="mt-6 rounded-2xl border border-red-200 bg-white p-6 text-center">
            <p className="text-sm text-red-700">{error.message}</p>
            <button type="button" onClick={() => setTick((n) => n + 1)}
              className="mt-3 rounded-xl bg-gray-900 px-4 py-2 text-sm font-medium text-white">
              Try again
            </button>
          </div>
        )}

        {!data && !error && (
          <div className="mt-6 grid animate-pulse gap-6 lg:grid-cols-2" aria-label="Loading metrics">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-64 rounded-2xl bg-gray-200" />
            ))}
          </div>
        )}

        {data && (
          <div className="mt-6 grid gap-6 lg:grid-cols-2">
            <Funnel funnel={data.funnel} onOpen={setOpenStep} />
            <Catalog catalog={data.catalog} />
            <div className="lg:col-span-2">
              <RunHealth health={data.run_health} onRerun={rerun} rerunning={rerunning} />
            </div>
            <div className="lg:col-span-2">
              <Stages stages={data.stages} />
            </div>
            <div className="lg:col-span-2">
              <Review review={data.review} />
            </div>
          </div>
        )}

        {openStep && (
          <FunnelList step={openStep} params={params} onClose={() => setOpenStep(null)} />
        )}
      </main>
    </div>
  );
}
