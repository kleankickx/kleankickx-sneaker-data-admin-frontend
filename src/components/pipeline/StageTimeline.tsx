import type { PipelineStage } from "../../lib/api";
import { duration } from "../../lib/monitor";
import { STAGE_STATUS } from "../../lib/pipeline";

function Json({ value }: { value: unknown }) {
  return (
    <pre className="max-h-80 overflow-auto rounded-lg bg-gray-50 p-3 text-xs text-gray-800">
      {JSON.stringify(value, null, 2)}
    </pre>
  );
}

/* A stage's full output; the vision model's raw JSON gets its own toggle. */
function StageOutput({ stage }: { stage: PipelineStage }) {
  if (!stage.output) {
    return <p className="text-xs text-gray-500">No output saved.</p>;
  }
  if (stage.stage === 5 && "raw" in stage.output) {
    const { raw, ...rest } = stage.output;
    return (
      <div className="space-y-2">
        <Json value={rest} />
        <details>
          <summary className="cursor-pointer text-xs font-medium text-gray-700">
            Vision model raw JSON
          </summary>
          <div className="mt-2">
            <Json value={raw} />
          </div>
        </details>
      </div>
    );
  }
  return <Json value={stage.output} />;
}

/**
 * The seven pipeline stages in order: status, duration and a one-line
 * summary each, expandable to the stage's full saved output.
 */
export default function StageTimeline({
  stages,
  selected,
  onSelect,
}: {
  stages: PipelineStage[];
  /* Highlight a stage (the runner's stage selector). */
  selected?: number;
  onSelect?: (stage: number) => void;
}) {
  return (
    <ol className="relative space-y-3 border-l border-gray-200 pl-6">
      {stages.map((stage) => {
        const style = STAGE_STATUS[stage.status];
        const isSelected = selected === stage.stage;
        return (
          <li key={stage.stage} className="relative">
            <span
              className={`absolute -left-[31px] top-1 flex h-4 w-4 items-center justify-center rounded-full ring-4 ring-white ${style.dot}`}
            >
              <span
                aria-hidden="true"
                className={`material-symbols-outlined text-[12px] text-white ${
                  stage.status === "running" ? "animate-spin" : ""
                }`}
              >
                {style.icon}
              </span>
            </span>
            <details
              className={`rounded-lg border px-3 py-2 ${
                isSelected ? "border-gray-900" : "border-transparent hover:border-gray-200"
              }`}
            >
              <summary className="flex cursor-pointer list-none flex-wrap items-baseline gap-x-3 gap-y-0.5">
                {onSelect ? (
                  <button
                    type="button"
                    onClick={(event) => {
                      event.preventDefault();
                      onSelect(stage.stage);
                    }}
                    className="text-sm font-semibold text-gray-900 hover:underline"
                    aria-pressed={isSelected}
                  >
                    {stage.stage}. {stage.name}
                  </button>
                ) : (
                  <span className="text-sm font-semibold text-gray-900">
                    {stage.stage}. {stage.name}
                  </span>
                )}
                <span className={`text-xs font-medium ${style.text}`}>{style.label}</span>
                {stage.duration_ms !== null && stage.status !== "reused" && (
                  <span className="text-xs text-gray-500">{duration(stage.duration_ms)}</span>
                )}
                {stage.reused_from_run && (
                  <span className="text-xs text-gray-400">
                    from run {stage.reused_from_run.slice(0, 8)}
                  </span>
                )}
                {stage.summary && (
                  <span className="basis-full text-sm text-gray-600">{stage.summary}</span>
                )}
              </summary>
              <div className="mt-2">
                {stage.error && (
                  <p className="mb-2 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">{stage.error}</p>
                )}
                <StageOutput stage={stage} />
              </div>
            </details>
          </li>
        );
      })}
    </ol>
  );
}
