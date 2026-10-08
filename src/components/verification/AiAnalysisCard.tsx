import type { ReactNode } from "react";

import type { AnalysisResult } from "../../lib/types";
import { percent, type AiAnalysis } from "../../lib/verification";

type Candidate = AnalysisResult["candidate_matches"][number];

function formatDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function StateMessage({
  icon,
  title,
  text,
  spin,
  children,
}: {
  icon: string;
  title: string;
  text: string;
  spin?: boolean;
  children?: ReactNode;
}) {
  return (
    <div className="flex items-start gap-3 rounded-xl border border-dashed border-gray-200 bg-gray-50 p-4">
      <span
        aria-hidden="true"
        className={`material-symbols-outlined text-[20px] text-gray-400 ${
          spin ? "animate-spin" : ""
        }`}
      >
        {icon}
      </span>
      <div className="min-w-0">
        <p className="text-sm font-medium text-gray-900">{title}</p>
        <p className="mt-0.5 text-sm text-gray-500">{text}</p>
        {children}
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="mt-4">
      <h3 className="text-xs font-medium uppercase tracking-wide text-gray-400">
        {title}
      </h3>
      <div className="mt-1.5">{children}</div>
    </div>
  );
}

function Candidates({
  candidates,
  onApply,
  disabled,
}: {
  candidates: Candidate[];
  onApply?: (candidate: Candidate) => void;
  disabled: boolean;
}) {
  return (
    <ul className="divide-y divide-gray-100 rounded-lg border border-gray-200">
      {candidates.map((c, index) => (
        <li key={`${c.sku}-${index}`} className="flex items-start gap-3 px-3 py-2.5">
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-gray-900">
              {[c.brand, c.model].filter(Boolean).join(" ") || "Unknown model"}
              {c.sku && (
                <span className="ml-1.5 font-mono text-xs text-gray-500">{c.sku}</span>
              )}
            </p>
            <p className="mt-0.5 text-xs text-gray-500">
              {percent(c.confidence)} · {c.reason}
            </p>
          </div>
          {onApply && !disabled && (
            <button
              type="button"
              onClick={() => onApply(c)}
              className="shrink-0 rounded-lg border border-gray-200 bg-white px-2.5 py-1 text-xs font-medium text-gray-700 transition hover:bg-gray-50"
            >
              Use
            </button>
          )}
        </li>
      ))}
    </ul>
  );
}

function Body({
  analysis,
  onRetry,
  onApplyCandidate,
  readOnly,
}: {
  analysis: AiAnalysis;
  onRetry: () => void;
  onApplyCandidate?: (candidate: Candidate) => void;
  readOnly: boolean;
}) {
  switch (analysis.kind) {
    case "loading":
      return (
        <div className="animate-pulse space-y-3" aria-label="Loading AI analysis">
          <div className="h-4 w-40 rounded bg-gray-200" />
          <div className="h-12 w-full rounded bg-gray-200" />
          <div className="h-16 w-full rounded bg-gray-200" />
        </div>
      );

    case "error":
      return (
        <StateMessage
          icon="cloud_off"
          title="Couldn't load AI analysis"
          text="The rest of the page still works. You can verify the pair from the photos."
        >
          <button
            type="button"
            onClick={onRetry}
            className="mt-2 text-sm font-medium text-gray-700 underline underline-offset-4 hover:text-gray-900"
          >
            Try again
          </button>
        </StateMessage>
      );

    case "not_requested":
      return (
        <StateMessage
          icon="auto_awesome"
          title="AI analysis not available yet"
          text="This pair hasn't been analysed. Verify it from the photos and captured data."
        />
      );

    case "pending":
      return (
        <StateMessage
          icon="progress_activity"
          spin
          title="AI analysis pending"
          text={
            analysis.status === "queued"
              ? "This pair is queued for analysis. Refresh later to see the suggestions."
              : "The photos are being analysed. Refresh later to see the suggestions."
          }
        />
      );

    case "failed":
      return (
        <StateMessage
          icon="error"
          title="AI analysis failed"
          text="No suggestions are available for this pair. Verify it from the photos."
        />
      );

    case "no_result":
      return (
        <StateMessage
          icon="help"
          title="No AI suggestion"
          text="The analysis finished without identifying this pair."
        />
      );

    case "ready": {
      const { result, run } = analysis.suggestion;
      const generated = run ? formatDateTime(run.created_at) : null;

      return (
        <div>
          {result.overall_assessment && (
            <p className="text-sm text-gray-700">{result.overall_assessment}</p>
          )}

          {run && !run.vlm_used && (
            <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
              The vision model didn't contribute to this run, so only the label
              and catalog were used. Condition and materials weren't assessed.
            </p>
          )}

          {result.candidate_matches.length > 0 && (
            <Section title="Candidate matches">
              <Candidates
                candidates={result.candidate_matches}
                onApply={onApplyCandidate}
                disabled={readOnly}
              />
            </Section>
          )}

          {result.visible_text.length > 0 && (
            <Section title="Visible text">
              <ul className="flex flex-wrap gap-1.5">
                {result.visible_text.map((text) => (
                  <li
                    key={text}
                    className="rounded-md bg-gray-100 px-2 py-0.5 font-mono text-xs text-gray-700"
                  >
                    {text}
                  </li>
                ))}
              </ul>
            </Section>
          )}

          {result.limitations.length > 0 && (
            <Section title="Limitations">
              <ul className="list-disc space-y-0.5 pl-4 text-xs text-gray-600">
                {result.limitations.map((limitation) => (
                  <li key={limitation}>{limitation}</li>
                ))}
              </ul>
            </Section>
          )}

          <p className="mt-4 text-xs text-gray-400">
            {run
              ? [
                  run.model_name || "No vision model",
                  `prompt ${run.prompt_version}`,
                  generated && `generated ${generated}`,
                ]
                  .filter(Boolean)
                  .join(" · ")
              : "Earlier AI identification"}
          </p>
        </div>
      );
    }
  }
}

/**
 * The pair's latest AI analysis, shown as a suggestion. Nothing here
 * requests analysis; it only reads what the backend has stored.
 * Per-field values and confidence sit beside each field in the
 * verification panel.
 */
export default function AiAnalysisCard({
  analysis,
  onRetry,
  onApplyCandidate,
  readOnly = false,
}: {
  analysis: AiAnalysis;
  onRetry: () => void;
  onApplyCandidate?: (candidate: Candidate) => void;
  readOnly?: boolean;
}) {
  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm sm:p-6">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gray-50">
            <span
              aria-hidden="true"
              className="material-symbols-outlined text-[18px] text-gray-600"
            >
              auto_awesome
            </span>
          </div>
          <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-500">
            AI analysis
          </h2>
        </div>
        <span className="inline-flex items-center rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-600">
          Suggestion only
        </span>
      </div>

      <div className="mt-4">
        <Body
          analysis={analysis}
          onRetry={onRetry}
          onApplyCandidate={onApplyCandidate}
          readOnly={readOnly}
        />
      </div>
    </section>
  );
}
