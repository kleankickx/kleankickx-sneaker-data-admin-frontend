import { useEffect, useRef, useState } from "react";

import {
  getPipelineOptions,
  getPipelineRunState,
  listPipelineRuns,
  nextPipelineStep,
  promotePipelineRun,
  startPipelineRun,
  type PipelineMode,
  type PipelineOptions,
  type PipelineOverrides,
  type PipelineRunState,
  type PipelineRunSummary,
} from "../../lib/api";
import { readApiError } from "../../lib/api-errors";
import { FIELD_LABELS, duration } from "../../lib/monitor";
import {
  RUN_STATUS_LABEL,
  diffResults,
  fusedResult,
  isActive,
} from "../../lib/pipeline";
import StageTimeline from "./StageTimeline";

const POLL_MS = 1500;

const SELECT =
  "h-9 w-full rounded-lg border border-gray-300 bg-white px-2 text-sm text-gray-700 outline-none focus:border-gray-500 focus:ring-2 focus:ring-gray-200";

function shortDate(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function runLabel(run: PipelineRunSummary) {
  return [
    shortDate(run.created_at),
    run.prompt_version,
    run.model_name || "no vision model",
    run.is_test ? "test" : null,
    run.status,
  ]
    .filter(Boolean)
    .join(" · ");
}

/* The new result next to the pair's current one, differences highlighted. */
function ResultComparison({
  run,
  onUse,
  using,
}: {
  run: PipelineRunState;
  onUse: () => void;
  using: boolean;
}) {
  const result = fusedResult(run);
  if (!result) return null;
  const current = run.current && !run.current.is_this_run ? run.current : null;
  const diffs = diffResults(result, current?.result);
  const changed = diffs.filter((d) => d.changed).length;

  return (
    <section className="mt-5 rounded-xl border border-gray-200 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-gray-900">
          Result {current ? `vs current (${changed} ${changed === 1 ? "field differs" : "fields differ"})` : ""}
        </h3>
        {run.is_test && run.status === "completed" && (
          <button
            type="button"
            onClick={onUse}
            disabled={using}
            className="rounded-lg bg-gray-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
          >
            {using ? "Saving…" : "Use this result"}
          </button>
        )}
      </div>
      {!current && (
        <p className="mt-1 text-xs text-gray-500">
          {run.current?.is_this_run ? "This run is the pair's current result." : "The pair has no current result yet."}
        </p>
      )}
      <div className="mt-3 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b border-gray-100">
            <tr>
              <th className="px-2 py-1.5 text-left text-xs font-medium uppercase tracking-wide text-gray-500">Field</th>
              <th className="px-2 py-1.5 text-left text-xs font-medium uppercase tracking-wide text-gray-500">
                {run.is_test ? "This test run" : "This run"}
              </th>
              {current && (
                <th className="px-2 py-1.5 text-left text-xs font-medium uppercase tracking-wide text-gray-500">
                  Current ({current.prompt_version})
                </th>
              )}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {diffs.map((d) => (
              <tr key={d.field} className={current && d.changed ? "bg-amber-50/70" : undefined}>
                <td className="px-2 py-1.5 text-gray-600">
                  {FIELD_LABELS[d.field]}
                  {current && d.changed && <span className="sr-only"> (differs)</span>}
                </td>
                <td className="px-2 py-1.5">
                  <span className="font-medium text-gray-900">{d.next.value ?? "—"}</span>{" "}
                  <span className="text-xs text-gray-500">{d.next.confidence.toFixed(2)}</span>
                </td>
                {current && (
                  <td className="px-2 py-1.5">
                    <span className="text-gray-700">{d.current?.value ?? "—"}</span>{" "}
                    {d.current && <span className="text-xs text-gray-500">{d.current.confidence.toFixed(2)}</span>}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

/**
 * Staff tool: run a pair through the analysis pipeline stage by stage,
 * with overrides and test runs, watching each stage's output.
 */
export default function PipelineRunner({
  pairId,
  initialRunId,
  onResultChanged,
}: {
  pairId: string;
  /* Open an existing run (e.g. from the pipeline monitor). */
  initialRunId?: string | null;
  /* The pair's current result changed (a real run finished, or promote). */
  onResultChanged?: () => void;
}) {
  const [options, setOptions] = useState<PipelineOptions | null>(null);
  const [runs, setRuns] = useState<PipelineRunSummary[]>([]);
  const [runsTick, setRunsTick] = useState(0);
  const [stage, setStage] = useState(1);
  const [sourceRun, setSourceRun] = useState("");
  const [overrides, setOverrides] = useState<PipelineOverrides>({});
  const [isTest, setIsTest] = useState(true);
  const [run, setRun] = useState<PipelineRunState | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const notified = useRef<string | null>(null);

  useEffect(() => {
    getPipelineOptions().then(setOptions, (err) =>
      setError(readApiError(err, "Couldn't load the runner options.").message),
    );
  }, []);

  useEffect(() => {
    let current = true;
    listPipelineRuns(pairId).then(
      (list) => current && setRuns(list),
      () => undefined,
    );
    return () => {
      current = false;
    };
  }, [pairId, runsTick]);

  /* Every run state goes through here: once a real run finishes, the
     pair's current result has changed. */
  const receive = useRef((state: PipelineRunState) => setRun(state));
  useEffect(() => {
    receive.current = (state: PipelineRunState) => {
      setRun(state);
      if (state.status === "completed" && !state.is_test && notified.current !== state.id) {
        notified.current = state.id;
        setRunsTick((n) => n + 1);
        onResultChanged?.();
      }
    };
  });

  useEffect(() => {
    if (!initialRunId) return;
    // An already finished run isn't news.
    notified.current = initialRunId;
    getPipelineRunState(initialRunId).then(
      (state) => receive.current(state),
      (err) => setError(readApiError(err, "Couldn't load that run.").message),
    );
  }, [initialRunId]);

  // Poll while the run is queued or running.
  useEffect(() => {
    if (!run || !isActive(run.status)) return;
    const id = window.setTimeout(() => {
      getPipelineRunState(run.id).then((state) => receive.current(state), () => undefined);
    }, POLL_MS);
    return () => window.clearTimeout(id);
  }, [run]);

  const usableSources = runs.filter((r) => r.id !== run?.id);
  const source = sourceRun || usableSources[0]?.id || "";
  const needsSource = stage > 1;

  async function start(mode: PipelineMode) {
    setBusy(true);
    setError(null);
    try {
      const fromHere = mode === "from" || (mode === "step" && stage > 1);
      const started = await startPipelineRun({
        sneaker_pair: pairId,
        mode,
        ...(mode === "to" || fromHere ? { stage } : {}),
        ...(fromHere && source ? { source_run: source } : {}),
        is_test: isTest,
        overrides: Object.fromEntries(
          Object.entries(overrides).filter(([, v]) => v),
        ),
      });
      receive.current(started);
      setRunsTick((n) => n + 1);
    } catch (err) {
      setError(readApiError(err, "Couldn't start the run.").message);
    } finally {
      setBusy(false);
    }
  }

  async function step() {
    if (!run) return;
    setBusy(true);
    try {
      receive.current(await nextPipelineStep(run.id));
    } catch (err) {
      setError(readApiError(err, "Couldn't run the next step.").message);
    } finally {
      setBusy(false);
    }
  }

  async function useResult() {
    if (!run) return;
    setBusy(true);
    try {
      const promoted = await promotePipelineRun(run.id);
      notified.current = promoted.id;
      setRun(promoted);
      setRunsTick((n) => n + 1);
      onResultChanged?.();
    } catch (err) {
      setError(readApiError(err, "Couldn't use this result.").message);
    } finally {
      setBusy(false);
    }
  }

  const active = isActive(run?.status);
  const stageList = run?.stages ?? options?.stages.map((s) => ({
    stage: s.stage,
    name: s.name,
    status: "waiting" as const,
    summary: "",
    output: null,
    error: "",
    duration_ms: null,
    started_at: null,
    finished_at: null,
    reused_from_run: null,
  })) ?? [];
  const stageName = options?.stages.find((s) => s.stage === stage)?.name ?? `stage ${stage}`;

  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm sm:p-6" aria-label="Run pipeline">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-base font-semibold text-gray-900">Run pipeline</h2>
          <p className="text-sm text-gray-500">
            Select a stage in the timeline, then choose how to run. Staff only.
          </p>
        </div>
        {run && (
          <div className="flex items-center gap-2 text-sm">
            {run.is_test && (
              <span className="rounded-full bg-violet-50 px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wide text-violet-700 ring-1 ring-inset ring-violet-600/20">
                Test run
              </span>
            )}
            <span className="text-gray-600">
              {RUN_STATUS_LABEL[run.status]}
              {run.duration_ms !== null && !active && ` · ${duration(run.duration_ms)}`}
            </span>
          </div>
        )}
      </div>

      {/* Settings */}
      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className="text-xs font-medium text-gray-600">
          Provider
          <select
            className={`mt-1 ${SELECT}`}
            value={overrides.provider ?? ""}
            onChange={(e) => setOverrides((o) => ({ ...o, provider: e.target.value || undefined }))}
          >
            <option value="">Default</option>
            {options?.providers.map((p) => (
              <option key={p.name} value={p.name}>
                {p.name}
                {p.is_default ? " (default)" : ""}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs font-medium text-gray-600">
          Model
          <input
            className={`mt-1 ${SELECT}`}
            placeholder={
              options?.providers.find((p) => p.name === overrides.provider)?.default_model ||
              "Provider default"
            }
            value={overrides.model ?? ""}
            onChange={(e) => setOverrides((o) => ({ ...o, model: e.target.value || undefined }))}
          />
        </label>
        <label className="text-xs font-medium text-gray-600">
          Prompt version
          <select
            className={`mt-1 ${SELECT}`}
            value={overrides.prompt_version ?? ""}
            onChange={(e) => setOverrides((o) => ({ ...o, prompt_version: e.target.value || undefined }))}
          >
            <option value="">Default{options ? ` (${options.default_prompt_version})` : ""}</option>
            {options?.prompt_versions.map((v) => (
              <option key={v} value={v}>{v}</option>
            ))}
          </select>
        </label>
        <label className="text-xs font-medium text-gray-600">
          OCR backend
          <select
            className={`mt-1 ${SELECT}`}
            value={overrides.ocr_backend ?? ""}
            onChange={(e) => setOverrides((o) => ({ ...o, ocr_backend: e.target.value || undefined }))}
          >
            <option value="">Default (tesseract)</option>
            {options?.ocr_backends.map((b) => (
              <option key={b} value={b}>{b === "none" ? "none (barcodes only)" : b}</option>
            ))}
          </select>
        </label>
        <label className="text-xs font-medium text-gray-600 sm:col-span-2">
          Reuse earlier stages from
          <select
            className={`mt-1 ${SELECT}`}
            value={source}
            onChange={(e) => setSourceRun(e.target.value)}
            disabled={!needsSource}
          >
            {usableSources.length === 0 && <option value="">No earlier runs</option>}
            {usableSources.map((r) => (
              <option key={r.id} value={r.id}>{runLabel(r)}</option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-2 self-end pb-2 text-sm text-gray-700 sm:col-span-2">
          <input
            type="checkbox"
            checked={isTest}
            onChange={(e) => setIsTest(e.target.checked)}
            className="h-4 w-4 rounded border-gray-300"
          />
          Test run (doesn't replace the current result, review queue or catalog)
        </label>
      </div>

      {/* Run mode */}
      <div className="mt-4 flex flex-wrap items-center gap-2">
        {[
          { mode: "all" as const, label: "Run all" },
          { mode: "to" as const, label: `Run to here (${stage})` },
          { mode: "from" as const, label: `Re-run from here (${stage})`, needs: needsSource && !source },
          { mode: "step" as const, label: "Step", needs: needsSource && !source },
        ].map(({ mode, label, needs }) => (
          <button
            key={mode}
            type="button"
            onClick={() => start(mode)}
            disabled={busy || active || Boolean(needs) || !options || (mode === "from" && stage === 1)}
            className={`rounded-xl px-3 py-2 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-40 ${
              mode === "all"
                ? "bg-gray-900 text-white hover:bg-gray-800"
                : "border border-gray-200 bg-white text-gray-700 hover:bg-gray-50"
            }`}
          >
            {label}
          </button>
        ))}
        {run?.status === "waiting" && (
          <button
            type="button"
            onClick={step}
            disabled={busy}
            className="inline-flex items-center gap-1 rounded-xl bg-sky-700 px-3 py-2 text-sm font-medium text-white hover:bg-sky-800 disabled:opacity-50"
          >
            Next
            <span aria-hidden="true" className="material-symbols-outlined text-[18px]">arrow_forward</span>
          </button>
        )}
        <span className="text-xs text-gray-500">Selected: {stage}. {stageName}</span>
      </div>

      {error && <p role="alert" className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      {run?.notes.map((note) => (
        <p key={note} role="status" className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">{note}</p>
      ))}
      {run?.status === "failed" && run.error && (
        <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{run.error}</p>
      )}

      <div className="mt-5">
        <StageTimeline stages={stageList} selected={stage} onSelect={setStage} />
      </div>

      {run && <ResultComparison run={run} onUse={useResult} using={busy} />}
    </section>
  );
}
