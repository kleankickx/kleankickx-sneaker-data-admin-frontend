import type { ReactNode } from "react";

import { formatConfidence, type AiAnalysis } from "../../lib/verification";

const SUGGESTED_FIELDS = [
  { field: "brand", label: "Brand" },
  { field: "model", label: "Model" },
  { field: "sku", label: "SKU" },
  { field: "size", label: "Size" },
] as const;

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

function Body({
  analysis,
  onRetry,
}: {
  analysis: AiAnalysis;
  onRetry: () => void;
}) {
  switch (analysis.kind) {
    case "loading":
      return (
        <div className="animate-pulse space-y-3" aria-label="Loading AI analysis">
          <div className="h-4 w-40 rounded bg-gray-200" />
          <div className="h-2 w-full rounded bg-gray-200" />
          <div className="grid grid-cols-2 gap-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-10 rounded bg-gray-200" />
            ))}
          </div>
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
      const { identification } = analysis;
      const confidence = formatConfidence(identification.confidence);
      const percent = confidence ? Number.parseInt(confidence, 10) : null;
      const generated = formatDateTime(identification.created_at);

      return (
        <div>
          <div className="flex items-baseline justify-between gap-3">
            <p className="text-sm font-medium text-gray-700">
              Overall confidence
            </p>
            <p className="text-sm font-semibold text-gray-900">
              {confidence ?? "Not reported"}
            </p>
          </div>
          {percent !== null && (
            <div
              className="mt-2 h-1.5 overflow-hidden rounded-full bg-gray-100"
              role="meter"
              aria-label="AI confidence"
              aria-valuenow={percent}
              aria-valuemin={0}
              aria-valuemax={100}
            >
              <div
                className={`h-full rounded-full ${
                  percent < 60 ? "bg-amber-400" : "bg-gray-700"
                }`}
                style={{ width: `${percent}%` }}
              />
            </div>
          )}
          {percent !== null && percent < 60 && (
            <p className="mt-1.5 text-xs text-amber-700">
              Low confidence. Check each value carefully.
            </p>
          )}

          <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3">
            {SUGGESTED_FIELDS.map(({ field, label }) => (
              <div key={field} className="min-w-0">
                <dt className="text-xs font-medium uppercase tracking-wide text-gray-400">
                  {label}
                </dt>
                <dd className="mt-0.5 truncate text-sm font-medium text-gray-900">
                  {identification[field] || (
                    <span className="font-normal text-gray-400">
                      No suggestion
                    </span>
                  )}
                </dd>
              </div>
            ))}
          </dl>

          <p className="mt-4 text-xs text-gray-500">
            Confidence applies to the whole suggestion. Condition is not
            assessed by AI.
            {generated && ` Generated ${generated}.`}
          </p>
        </div>
      );
    }
  }
}

/**
 * The pair's latest AI identification, shown as a suggestion. Nothing
 * here requests analysis; it only reads what the backend has stored.
 */
export default function AiAnalysisCard({
  analysis,
  onRetry,
}: {
  analysis: AiAnalysis;
  onRetry: () => void;
}) {
  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm sm:p-6">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gray-50">
            <span aria-hidden="true" className="material-symbols-outlined text-[18px] text-gray-600">
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
        <Body analysis={analysis} onRetry={onRetry} />
      </div>
    </section>
  );
}
