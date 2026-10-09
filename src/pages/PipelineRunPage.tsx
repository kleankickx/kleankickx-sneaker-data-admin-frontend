import { useEffect, useState, type ReactNode } from "react";
import { Link, useParams } from "react-router-dom";

import {
  getPipelineRun,
  rerunAnalysis,
  type PipelineRunDetail,
  type RunStage,
} from "../lib/api";
import StageTimeline from "../components/pipeline/StageTimeline";
import { readApiError } from "../lib/api-errors";
import { FIELD_LABELS, STAGE_LABELS, duration } from "../lib/monitor";

const STATUS_STYLE: Record<string, { icon: string; text: string; dot: string; label: string }> = {
  ok: { icon: "check", text: "text-emerald-700", dot: "bg-emerald-600", label: "OK" },
  warning: { icon: "warning", text: "text-amber-700", dot: "bg-amber-500", label: "Warning" },
  failed: { icon: "close", text: "text-red-700", dot: "bg-red-600", label: "Failed" },
  skipped: { icon: "remove", text: "text-gray-500", dot: "bg-gray-400", label: "Skipped" },
};

type Json = Record<string, unknown>;

function Code({ children }: { children: ReactNode }) {
  return <code className="rounded bg-gray-100 px-1.5 py-0.5 font-mono text-xs text-gray-800">{children}</code>;
}

function KeyValues({ rows }: { rows: Array<[string, ReactNode]> }) {
  return (
    <dl className="grid grid-cols-[9rem_1fr] gap-x-3 gap-y-1 text-sm">
      {rows.map(([key, value]) => (
        <div key={key} className="contents">
          <dt className="text-gray-500">{key}</dt>
          <dd className="min-w-0 break-words text-gray-800">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

/* The key output of each stage, in words. */
function StageOutput({ stage }: { stage: RunStage }) {
  const o = stage.output as Json;
  const list = (value: unknown) =>
    Array.isArray(value) && value.length ? (value as unknown[]).join(", ") : "none";

  switch (stage.stage) {
    case "download":
      return <KeyValues rows={[["Photos", list(o.views)], ["Failed", list(o.failed)]]} />;
    case "quality_check": {
      const issues = Object.entries((o.issues as Record<string, string[]>) ?? {});
      return (
        <KeyValues
          rows={[
            ["Failed views", list(o.failed_views)],
            ...issues.map(([view, items]) => [view, items.join("; ")] as [string, ReactNode]),
          ]}
        />
      );
    }
    case "label_reader": {
      if (o.reason) return <p className="text-sm text-gray-600">{String(o.reason)}</p>;
      const barcodes = (o.barcodes as Array<{ code: string; checksum_valid: boolean; backend?: string }>) ?? [];
      const candidates = (o.sku_candidates as Array<{ sku: string; brand_hint?: string; how?: string }>) ?? [];
      return (
        <KeyValues
          rows={[
            ["OCR", o.ocr_available ? "available" : "not installed"],
            [
              "Barcodes",
              barcodes.length
                ? barcodes.map((b) => (
                    <span key={b.code} className="mr-2">
                      <Code>{b.code}</Code> {b.checksum_valid ? "valid" : "bad checksum"}
                    </span>
                  ))
                : "none decoded",
            ],
            [
              "OCR SKU candidates",
              candidates.length
                ? candidates.map((c) => (
                    <span key={c.sku} className="mr-2">
                      <Code>{c.sku}</Code>{c.brand_hint ? ` (${c.brand_hint})` : ""}
                    </span>
                  ))
                : "none",
            ],
            [
              "Sizes",
              Object.keys((o.sizes as Json) ?? {}).length
                ? Object.entries(o.sizes as Json).map(([k, v]) => `${k} ${v}`).join(" / ")
                : "none",
            ],
            ["Size consistency", String(o.size_consistency ?? "—")],
          ]}
        />
      );
    }
    case "vision_model":
      if (o.reason) return <p className="text-sm text-gray-600">{String(o.reason)}</p>;
      return (
        <KeyValues
          rows={[
            ["Provider", String(o.provider ?? "—")],
            ["Model", String(o.model ?? "—")],
            ...(o.error ? [["Error", String(o.error)] as [string, ReactNode]] : []),
          ]}
        />
      );
    case "fusion": {
      const trace = (o.sku_trace as string[]) ?? [];
      return (
        <KeyValues
          rows={[
            ["SKU", o.sku ? <Code>{String(o.sku)}</Code> : "not found"],
            ["SKU source", String(o.sku_source ?? "—")],
            ["Catalog hit", o.catalog_hit ? "yes" : "no"],
            ["SKU decision trace", trace.length ? (
              <ol className="list-decimal pl-4">{trace.map((t) => <li key={t}>{t}</li>)}</ol>
            ) : "—"],
          ]}
        />
      );
    }
    default:
      return <pre className="overflow-x-auto text-xs">{JSON.stringify(o, null, 2)}</pre>;
  }
}

function Timeline({ stages }: { stages: RunStage[] }) {
  return (
    <ol className="relative space-y-5 border-l border-gray-200 pl-6">
      {stages.map((stage) => {
        const style = STATUS_STYLE[stage.status] ?? STATUS_STYLE.skipped;
        return (
          <li key={stage.stage} className="relative">
            <span className={`absolute -left-[31px] top-0.5 flex h-4 w-4 items-center justify-center rounded-full ${style.dot} ring-4 ring-white`}>
              <span aria-hidden="true" className="material-symbols-outlined text-[12px] text-white">{style.icon}</span>
            </span>
            <div className="flex flex-wrap items-baseline gap-x-3">
              <h3 className="text-sm font-semibold text-gray-900">{STAGE_LABELS[stage.stage] ?? stage.stage}</h3>
              <span className={`text-xs font-medium ${style.text}`}>{style.label}</span>
              <span className="text-xs text-gray-500">{duration(stage.duration_ms)}</span>
            </div>
            <div className="mt-2">
              <StageOutput stage={stage} />
            </div>
          </li>
        );
      })}
    </ol>
  );
}

/** One analysis run, step by step (staff only). */
export default function PipelineRunPage() {
  const { runId = "" } = useParams<{ runId: string }>();
  const [run, setRun] = useState<PipelineRunDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [queued, setQueued] = useState(false);

  useEffect(() => {
    let current = true;
    getPipelineRun(runId).then(
      (data) => current && setRun(data),
      (err) => current && setError(readApiError(err, "Couldn't load this run.").message),
    );
    return () => {
      current = false;
    };
  }, [runId]);

  async function rerun() {
    if (!run) return;
    setQueued(true);
    try {
      await rerunAnalysis(run.sneaker_pair);
      setNotice("Analysis queued.");
    } catch (err) {
      setQueued(false);
      setNotice(readApiError(err, "Couldn't queue the analysis.").message);
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <main className="mx-auto max-w-5xl px-4 py-6 sm:px-6 lg:px-8">
        <Link to="/pipeline-monitor" className="inline-flex items-center gap-1 text-sm font-medium text-gray-500 hover:text-gray-900">
          <span aria-hidden="true" className="material-symbols-outlined text-[18px]">arrow_back</span>
          Pipeline monitor
        </Link>

        {error && <p className="mt-6 rounded-xl border border-red-200 bg-white p-6 text-sm text-red-700">{error}</p>}
        {!run && !error && <div className="mt-6 h-64 animate-pulse rounded-2xl bg-gray-200" aria-label="Loading run" />}

        {run && (
          <>
            <header className="mt-4 flex flex-wrap items-end justify-between gap-3">
              <div>
                <h1 className="flex items-center gap-3 font-mono text-2xl font-semibold text-gray-900">
                  {run.sneaker_pair_id}
                  {run.is_test && (
                    <span className="rounded-full bg-violet-50 px-2.5 py-0.5 font-sans text-xs font-semibold uppercase tracking-wide text-violet-700 ring-1 ring-inset ring-violet-600/20">
                      Test run
                    </span>
                  )}
                </h1>
                <p className="mt-1 text-sm text-gray-500">
                  {run.prompt_version} · {run.model_name || "no vision model"} · {duration(run.duration_ms)} ·{" "}
                  {new Date(run.created_at).toLocaleString()}
                  {run.job_status && ` · job ${run.job_status}`}
                </p>
              </div>
              <div className="flex gap-2">
                <Link to={`/sneakers/${run.sneaker_pair}`} className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
                  Open pair
                </Link>
                <Link to={`/sneakers/${run.sneaker_pair}?runner=${run.id}`} className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
                  Open in runner
                </Link>
                <button type="button" onClick={rerun} disabled={queued}
                  className="rounded-xl bg-gray-900 px-3 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50">
                  {queued ? "Queued" : "Re-run analysis"}
                </button>
              </div>
            </header>

            {notice && <p role="status" className="mt-4 rounded-lg bg-gray-900 px-4 py-2 text-sm text-white">{notice}</p>}

            <section className="mt-6 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm sm:p-6">
              <h2 className="text-base font-semibold text-gray-900">Steps</h2>
              <div className="mt-4">
                {run.notes?.map((note) => (
                  <p key={note} className="mb-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">{note}</p>
                ))}
                {run.stages?.length ? (
                  <StageTimeline stages={run.stages} />
                ) : run.debug.stages?.length ? (
                  <Timeline stages={run.debug.stages} />
                ) : (
                  <p className="text-sm text-gray-500">Step timing wasn't recorded for this run (it predates the monitor).</p>
                )}
              </div>
            </section>

            <section className="mt-6 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm sm:p-6">
              <h2 className="text-base font-semibold text-gray-900">Final result</h2>
              <table className="mt-3 w-full">
                <thead className="border-b border-gray-100">
                  <tr>
                    {["Field", "Value", "Confidence", "Evidence"].map((h) => (
                      <th key={h} className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-gray-500">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 text-sm">
                  {(["brand", "model", "sku", "size", "colorway", "condition"] as const).map((f) => {
                    const field = run.result[f];
                    return (
                      <tr key={f}>
                        <td className="px-3 py-2 text-gray-600">{FIELD_LABELS[f]}</td>
                        <td className="px-3 py-2 font-medium text-gray-900">{field.value ?? "—"}</td>
                        <td className={`px-3 py-2 tabular-nums ${field.confidence < 0.8 ? "text-amber-700" : "text-gray-700"}`}>
                          {field.confidence.toFixed(2)}
                        </td>
                        <td className="px-3 py-2 text-xs text-gray-600">{field.evidence}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>

              {run.result.materials.length > 0 && (
                <>
                  <h3 className="mt-5 text-sm font-medium text-gray-700">Materials</h3>
                  <ul className="mt-1 list-disc pl-5 text-sm text-gray-700">
                    {run.result.materials.map((m, i) => (
                      <li key={i}>{m.material} ({m.confidence.toFixed(2)}): {m.evidence}</li>
                    ))}
                  </ul>
                </>
              )}

              <h3 className="mt-5 text-sm font-medium text-gray-700">Limitations</h3>
              <ul className="mt-1 list-disc pl-5 text-sm text-gray-700">
                {run.result.limitations.map((l) => <li key={l}>{l}</li>)}
              </ul>

              <details className="mt-5">
                <summary className="cursor-pointer text-sm font-medium text-gray-700">Vision model raw JSON</summary>
                {run.raw_response ? (
                  <pre className="mt-2 max-h-96 overflow-auto rounded-lg bg-gray-50 p-3 text-xs text-gray-800">
                    {JSON.stringify(run.raw_response, null, 2)}
                  </pre>
                ) : (
                  <p className="mt-2 text-sm text-gray-500">
                    {run.vlm_error ? `No response: ${run.vlm_error}` : "The vision model wasn't used for this run."}
                  </p>
                )}
              </details>
            </section>
          </>
        )}
      </main>
    </div>
  );
}
