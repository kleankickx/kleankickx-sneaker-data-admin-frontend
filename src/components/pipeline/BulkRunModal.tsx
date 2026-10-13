import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import { getPipelineOptions, type PipelineOptions } from "../../lib/api";
import { readApiError } from "../../lib/api-errors";
import { previewBulkRun, startBulkRun, type BulkPreview, type BulkScope } from "../../lib/bulk-runs";

const SCOPES: { value: BulkScope; label: string; hint: string }[] = [
  { value: "no_result", label: "Pairs without a result yet", hint: "Never analysed, or every run failed." },
  { value: "needs_attention", label: "Pairs that need attention", hint: "Last run failed, missed the vision model, or has a field under 80%." },
  { value: "unverified", label: "Pairs not verified yet", hint: "Re-analyse everything still open." },
  { value: "all", label: "Every pair in the batch", hint: "Including verified pairs." },
];

/** Run the pipeline over many pairs of a batch. */
export default function BulkRunModal({ batchId, batchLabel, onClose }: {
  batchId: string;
  batchLabel: string;
  onClose: () => void;
}) {
  const navigate = useNavigate();
  const [scope, setScope] = useState<BulkScope>("no_result");
  const [preview, setPreview] = useState<{ scope: BulkScope; data: BulkPreview } | null>(null);
  const [options, setOptions] = useState<PipelineOptions | null>(null);
  const [isTest, setIsTest] = useState(false);
  const [provider, setProvider] = useState("");
  const [model, setModel] = useState("");
  const [prompt, setPrompt] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    getPipelineOptions().then(setOptions).catch(() => {});
  }, []);

  useEffect(() => {
    let live = true;
    previewBulkRun({ batch: batchId, scope }).then(
      (data) => live && setPreview({ scope, data }),
      (err) => live && setError(readApiError(err, "Couldn't count the pairs.").message),
    );
    return () => {
      live = false;
    };
  }, [batchId, scope]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !busy && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [busy, onClose]);

  const current = preview?.scope === scope ? preview.data : null;
  const tooMany = current ? current.pairs > current.max_pairs : false;

  async function start() {
    setBusy(true);
    setError("");
    try {
      const overrides = Object.fromEntries(
        Object.entries({ provider, model: model.trim(), prompt_version: prompt }).filter(([, v]) => v),
      );
      const bulk = await startBulkRun({ batch: batchId, scope, is_test: isTest, overrides });
      navigate(`/pipeline-monitor/bulk/${bulk.id}`);
    } catch (err) {
      setError(readApiError(err, "Couldn't start the bulk run.").message);
      setBusy(false);
    }
  }

  const select = "h-10 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-700 outline-none focus:border-gray-500 focus:ring-2 focus:ring-gray-200";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true" aria-label="Run the pipeline">
      <div className="max-h-[92vh] w-full max-w-xl overflow-y-auto rounded-2xl bg-white shadow-2xl">
        <div className="flex items-start justify-between border-b border-gray-200 px-6 py-5">
          <div>
            <h2 className="text-base font-semibold text-gray-900">Run the pipeline</h2>
            <p className="mt-0.5 font-mono text-xs text-gray-500">{batchLabel}</p>
          </div>
          <button type="button" onClick={onClose} disabled={busy} aria-label="Close" className="text-gray-400 hover:text-gray-700">
            <span aria-hidden="true" className="material-symbols-outlined">close</span>
          </button>
        </div>

        <div className="space-y-5 px-6 py-5">
          <fieldset>
            <legend className="mb-2 text-sm font-medium text-gray-700">Which pairs</legend>
            <div className="space-y-1.5">
              {SCOPES.map((s) => (
                <label key={s.value} className={`flex cursor-pointer items-start gap-3 rounded-lg border px-3 py-2.5 transition ${
                  scope === s.value ? "border-gray-900 bg-gray-50" : "border-gray-200 hover:border-gray-300"
                }`}>
                  <input type="radio" name="scope" className="mt-0.5 h-4 w-4 accent-gray-900" checked={scope === s.value}
                    onChange={() => setScope(s.value)} />
                  <span>
                    <span className="block text-sm font-medium text-gray-900">{s.label}</span>
                    <span className="block text-xs text-gray-500">{s.hint}</span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>

          <div className="rounded-xl bg-gray-50 px-4 py-3 text-sm" aria-live="polite">
            {current ? (
              <>
                <p className="font-medium text-gray-900">
                  {current.will_run.toLocaleString()} pair{current.will_run === 1 ? "" : "s"} will run
                  {current.pairs !== current.will_run && <span className="font-normal text-gray-500"> of {current.pairs}</span>}
                </p>
                {current.skipped.map((s) => (
                  <p key={s.reason} className="text-xs text-gray-500">{s.pairs} skipped: {s.reason}</p>
                ))}
                <p className="mt-1 text-xs text-gray-500">
                  {current.concurrency} at a time, paced to the vision provider's limits. Rate-limited pairs wait and retry by themselves.
                </p>
                {tooMany && <p className="mt-1 text-xs text-red-700">That's over the limit of {current.max_pairs} pairs per bulk run.</p>}
              </>
            ) : (
              <div className="h-10 animate-pulse rounded bg-gray-200/60" aria-label="Counting pairs" />
            )}
          </div>

          <label className="flex items-start gap-3">
            <input type="checkbox" className="mt-0.5 h-4 w-4 accent-gray-900" checked={isTest} onChange={(e) => setIsTest(e.target.checked)} />
            <span>
              <span className="block text-sm font-medium text-gray-900">Test run</span>
              <span className="block text-xs text-gray-500">Results don't replace the pairs' current results, the review queue or the catalog.</span>
            </span>
          </label>

          <details>
            <summary className="cursor-pointer text-sm font-medium text-gray-700">Provider and prompt</summary>
            <div className="mt-3 grid gap-3 sm:grid-cols-3">
              <label className="text-xs font-medium text-gray-600">
                Provider
                <select aria-label="Provider" value={provider} onChange={(e) => setProvider(e.target.value)} className={`mt-1 ${select}`}>
                  <option value="">Default</option>
                  {options?.providers.map((p) => <option key={p.name} value={p.name}>{p.name}{p.is_default ? " (default)" : ""}</option>)}
                </select>
              </label>
              <label className="text-xs font-medium text-gray-600">
                Model
                <input aria-label="Model" value={model} onChange={(e) => setModel(e.target.value)} placeholder="Default" className={`mt-1 ${select}`} />
              </label>
              <label className="text-xs font-medium text-gray-600">
                Prompt version
                <select aria-label="Prompt version" value={prompt} onChange={(e) => setPrompt(e.target.value)} className={`mt-1 ${select}`}>
                  <option value="">Default{options ? ` (${options.default_prompt_version})` : ""}</option>
                  {options?.prompt_versions.map((v) => <option key={v} value={v}>{v}</option>)}
                </select>
              </label>
            </div>
          </details>

          {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
        </div>

        <div className="flex justify-end gap-2 border-t border-gray-100 bg-gray-50/60 px-6 py-4">
          <button type="button" onClick={onClose} disabled={busy}
            className="h-10 rounded-lg border border-gray-300 bg-white px-4 text-sm font-medium text-gray-700 hover:bg-gray-50">
            Cancel
          </button>
          <button type="button" onClick={start} disabled={busy || !current || current.will_run === 0 || tooMany}
            className="inline-flex h-10 items-center gap-2 rounded-lg bg-gray-900 px-4 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-40">
            <span aria-hidden="true" className={`material-symbols-outlined text-[18px] ${busy ? "animate-spin" : ""}`}>
              {busy ? "progress_activity" : "play_arrow"}
            </span>
            {busy ? "Starting…" : current ? `Run ${current.will_run} pair${current.will_run === 1 ? "" : "s"}` : "Run"}
          </button>
        </div>
      </div>
    </div>
  );
}
