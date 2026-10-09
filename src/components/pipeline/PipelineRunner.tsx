import { useEffect, useMemo, useRef, useState, type Ref } from "react";

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
  type PipelineStage,
} from "../../lib/api";
import { readApiError } from "../../lib/api-errors";
import { FIELD_LABELS, duration } from "../../lib/monitor";
import {
  RUN_STATUS_LABEL,
  STAGE_META,
  diffResults,
  fusedResult,
  isActive,
  photoUrls,
} from "../../lib/pipeline";
import type { SneakerPair } from "../../lib/types";
import PipelineFlow from "./PipelineFlow";
import StageInspector from "./StageInspector";

const POLL_MS = 1500;

const FIELD =
  "h-9 w-full rounded-lg border border-gray-300 bg-white px-2 text-sm text-gray-700 outline-none focus:border-gray-500 focus:ring-2 focus:ring-gray-200";

const MODES: Array<{ mode: PipelineMode; label: string; hint: string }> = [
  { mode: "all", label: "Run all", hint: "All seven stages, start to finish." },
  { mode: "to", label: "Up to stage", hint: "Stop after the selected stage." },
  { mode: "from", label: "From stage", hint: "Re-run from the selected stage, reusing an earlier run's outputs before it." },
  { mode: "step", label: "Step", hint: "One stage at a time; press Next to continue." },
];

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
    <section className="mt-6 rounded-2xl border border-gray-200 p-5 motion-safe:animate-fade-up">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-gray-900">
            Result {current ? `vs current (${changed} ${changed === 1 ? "field differs" : "fields differ"})` : ""}
          </h3>
          {!current && (
            <p className="mt-0.5 text-xs text-gray-500">
              {run.current?.is_this_run ? "This run is the pair's current result." : "The pair has no current result yet."}
            </p>
          )}
        </div>
        {run.is_test && run.status === "completed" && (
          <button
            type="button"
            onClick={onUse}
            disabled={using}
            className="inline-flex items-center gap-1.5 rounded-xl bg-gray-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-gray-800 disabled:opacity-50"
          >
            <span aria-hidden="true" className="material-symbols-outlined text-[18px]">done_all</span>
            {using ? "Saving…" : "Use this result"}
          </button>
        )}
      </div>
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
              <tr key={d.field} className={`transition-colors ${current && d.changed ? "bg-amber-50/70" : ""}`}>
                <td className="px-2 py-1.5 text-gray-600">
                  {FIELD_LABELS[d.field]}
                  {current && d.changed && <span className="sr-only"> (differs)</span>}
                </td>
                <td className="px-2 py-1.5">
                  <span className="font-medium text-gray-900">{d.next.value ?? "—"}</span>{" "}
                  <span className="font-mono text-xs text-gray-500">{d.next.confidence.toFixed(2)}</span>
                </td>
                {current && (
                  <td className="px-2 py-1.5">
                    <span className={d.changed ? "text-gray-500 line-through decoration-gray-300" : "text-gray-700"}>
                      {d.current?.value ?? "—"}
                    </span>{" "}
                    {d.current && <span className="font-mono text-xs text-gray-500">{d.current.confidence.toFixed(2)}</span>}
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

/* Where the run is now: the running stage, else the last one that ran. */
function liveStage(stages: PipelineStage[]): number {
  const running = stages.find((s) => s.status === "running");
  if (running) return running.stage;
  const ran = stages.filter((s) => s.status !== "waiting" && !(s.status === "skipped" && !s.output));
  return ran.length ? ran[ran.length - 1].stage : 1;
}

/**
 * Staff tool: run a pair through the analysis pipeline stage by stage,
 * with overrides and test runs, watching each stage's output as a flow.
 */
export default function PipelineRunner({
  pairId,
  pair,
  initialRunId,
  onResultChanged,
  ref,
}: {
  pairId: string;
  /* The pair, for showing its photos in the stages. */
  pair?: SneakerPair | null;
  /* Open an existing run (e.g. from the pipeline monitor). */
  initialRunId?: string | null;
  /* The pair's current result changed (a real run finished, or promote). */
  onResultChanged?: () => void;
  ref?: Ref<HTMLElement>;
}) {
  const [options, setOptions] = useState<PipelineOptions | null>(null);
  const [runs, setRuns] = useState<PipelineRunSummary[]>([]);
  const [runsTick, setRunsTick] = useState(0);
  const [mode, setMode] = useState<PipelineMode>("all");
  const [stage, setStage] = useState(1);
  // Follow the live stage until the user picks one themselves.
  const [following, setFollowing] = useState(true);
  const [sourceRun, setSourceRun] = useState("");
  const [overrides, setOverrides] = useState<PipelineOverrides>({});
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [isTest, setIsTest] = useState(true);
  const [run, setRun] = useState<PipelineRunState | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const notified = useRef<string | null>(null);

  const photos = useMemo(() => photoUrls(pair), [pair]);

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
  const reusesEarlier = (mode === "from" || mode === "step") && stage > 1;

  function pick(next: number) {
    setStage(next);
    setFollowing(false);
  }

  async function start() {
    setBusy(true);
    setError(null);
    try {
      const started = await startPipelineRun({
        sneaker_pair: pairId,
        mode,
        ...(mode === "to" || reusesEarlier ? { stage } : {}),
        ...(reusesEarlier && source ? { source_run: source } : {}),
        is_test: isTest,
        overrides: Object.fromEntries(Object.entries(overrides).filter(([, v]) => v)),
      });
      setFollowing(true);
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
      setFollowing(true);
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
  const stageList: PipelineStage[] =
    run?.stages ??
    options?.stages.map((s) => ({
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
    })) ??
    [];
  const inspected = following && run ? liveStage(stageList) : stage;
  const inspectedStage = stageList.find((s) => s.stage === inspected);
  const finished = stageList.filter((s) => s.status !== "waiting" && s.status !== "running").length;
  const progress = stageList.length ? finished / stageList.length : 0;
  const selectedName = STAGE_META[stage]?.short ?? `Stage ${stage}`;

  const runLabelText = {
    all: "Run all stages",
    to: `Run stages 1–${stage}`,
    from: `Re-run from ${stage} · ${selectedName}`,
    step: stage > 1 ? `Step from ${stage} · ${selectedName}` : "Step through",
  }[mode];
  const cannotRun =
    busy || active || !options ||
    (mode === "from" && stage === 1) ||
    (reusesEarlier && !source);

  return (
    <section
      ref={ref}
      id="pipeline-runner"
      aria-label="Run pipeline"
      className="scroll-mt-6 overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm motion-safe:animate-fade-up"
    >
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-gray-100 bg-gradient-to-b from-gray-50 to-white px-5 py-4 sm:px-6">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-gray-900 text-white">
            <span aria-hidden="true" className="material-symbols-outlined text-[22px]">account_tree</span>
          </span>
          <div>
            <h2 className="text-base font-semibold text-gray-900">Analysis pipeline</h2>
            <p className="text-sm text-gray-500">
              Run the pair through each stage and inspect what every stage saw and decided. Staff only.
            </p>
          </div>
        </div>
        {run && (
          <div className="flex flex-wrap items-center gap-2 text-sm">
            {run.is_test && (
              <span className="rounded-full bg-violet-50 px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wide text-violet-700 ring-1 ring-inset ring-violet-600/20">
                Test run
              </span>
            )}
            <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${
              active ? "bg-sky-50 text-sky-700" : run.status === "failed" ? "bg-red-50 text-red-700" : "bg-gray-100 text-gray-700"
            }`}>
              {active && <span className="h-1.5 w-1.5 rounded-full bg-sky-600 motion-safe:animate-pulse" />}
              {RUN_STATUS_LABEL[run.status]}
              {run.duration_ms !== null && !active && ` · ${duration(run.duration_ms)}`}
            </span>
          </div>
        )}
      </div>

      <div className="px-5 py-5 sm:px-6">
        {/* Controls */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="inline-flex rounded-xl bg-gray-100 p-1" role="radiogroup" aria-label="Run mode">
            {MODES.map((m) => (
              <button
                key={m.mode}
                type="button"
                role="radio"
                aria-checked={mode === m.mode}
                title={m.hint}
                onClick={() => setMode(m.mode)}
                className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-all duration-200 ${
                  mode === m.mode ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-800"
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={start}
            disabled={cannotRun}
            className="inline-flex items-center gap-1.5 rounded-xl bg-gray-900 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <span aria-hidden="true" className="material-symbols-outlined text-[18px]">play_arrow</span>
            {runLabelText}
          </button>

          {run?.status === "waiting" && (
            <button
              type="button"
              onClick={step}
              disabled={busy}
              className="inline-flex items-center gap-1 rounded-xl bg-sky-700 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-sky-800 disabled:opacity-50 motion-safe:animate-fade-up"
            >
              Next
              <span aria-hidden="true" className="material-symbols-outlined text-[18px]">skip_next</span>
            </button>
          )}

          <label className="ml-auto inline-flex cursor-pointer items-center gap-2 text-sm text-gray-700">
            <span className="relative inline-flex">
              <input
                type="checkbox"
                role="switch"
                checked={isTest}
                onChange={(e) => setIsTest(e.target.checked)}
                className="peer sr-only"
                aria-label="Test run (doesn't replace the current result, review queue or catalog)"
              />
              <span className="h-5 w-9 rounded-full bg-gray-300 transition-colors peer-checked:bg-violet-600 peer-focus-visible:ring-2 peer-focus-visible:ring-violet-300" />
              <span className="absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform peer-checked:translate-x-4" />
            </span>
            Test run
          </label>

          <button
            type="button"
            onClick={() => setShowAdvanced((s) => !s)}
            aria-expanded={showAdvanced}
            className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-100"
          >
            <span aria-hidden="true" className="material-symbols-outlined text-[18px]">tune</span>
            Advanced
          </button>
        </div>

        <p className="mt-2 text-xs text-gray-500">
          {MODES.find((m) => m.mode === mode)?.hint} Select a stage in the flow below.
          {isTest && " Test runs never replace the current result, review queue or catalog."}
        </p>

        {/* Advanced: overrides and the run to reuse */}
        <div
          className={`grid transition-[grid-template-rows,opacity] duration-300 ${
            showAdvanced || reusesEarlier ? "mt-4 grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
          }`}
        >
          <div className="overflow-hidden">
            <div className="grid gap-3 rounded-xl border border-gray-200 bg-gray-50/60 p-4 sm:grid-cols-2 lg:grid-cols-4">
              <label className="text-xs font-medium text-gray-600">
                Provider
                <select
                  className={`mt-1 ${FIELD}`}
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
                  className={`mt-1 ${FIELD}`}
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
                  className={`mt-1 ${FIELD}`}
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
                  className={`mt-1 ${FIELD}`}
                  value={overrides.ocr_backend ?? ""}
                  onChange={(e) => setOverrides((o) => ({ ...o, ocr_backend: e.target.value || undefined }))}
                >
                  <option value="">Default (tesseract)</option>
                  {options?.ocr_backends.map((b) => (
                    <option key={b} value={b}>{b === "none" ? "none (barcodes only)" : b}</option>
                  ))}
                </select>
              </label>
              <label className="text-xs font-medium text-gray-600 sm:col-span-2 lg:col-span-4">
                Reuse stages 1–{Math.max(1, stage - 1)} from
                <select
                  className={`mt-1 ${FIELD}`}
                  value={source}
                  onChange={(e) => setSourceRun(e.target.value)}
                  disabled={!reusesEarlier}
                >
                  {usableSources.length === 0 && <option value="">No earlier runs</option>}
                  {usableSources.map((r) => (
                    <option key={r.id} value={r.id}>{runLabel(r)}</option>
                  ))}
                </select>
              </label>
            </div>
          </div>
        </div>

        {error && <p role="alert" className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        {run?.notes.map((note) => (
          <p key={note} role="status" className="mt-4 flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800 motion-safe:animate-fade-up">
            <span aria-hidden="true" className="material-symbols-outlined text-[18px]">info</span>
            {note}
          </p>
        ))}
        {run?.status === "failed" && run.error && (
          <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{run.error}</p>
        )}

        {/* Progress + flow */}
        <div className="mt-5">
          <div
            className="h-1 overflow-hidden rounded-full bg-gray-100"
            role="progressbar"
            aria-label="Stages finished"
            aria-valuenow={finished}
            aria-valuemin={0}
            aria-valuemax={stageList.length}
          >
            <div
              className={`h-full rounded-full transition-[width] duration-700 ease-out ${active ? "bg-sky-600" : "bg-gray-900"}`}
              style={{ width: `${progress * 100}%` }}
            />
          </div>
          <div className="mt-5">
            <PipelineFlow stages={stageList} selected={inspected} onSelect={pick} />
          </div>
        </div>

        {/* Inspector */}
        {inspectedStage && (
          <div className="mt-6 rounded-2xl border border-gray-200 bg-white p-5">
            <StageInspector
              key={`${inspectedStage.stage}-${run?.id ?? "none"}`}
              stage={inspectedStage}
              stages={stageList}
              photos={photos}
            />
          </div>
        )}

        {run && <ResultComparison run={run} onUse={useResult} using={busy} />}
      </div>
    </section>
  );
}
