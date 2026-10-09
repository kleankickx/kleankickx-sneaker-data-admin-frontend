import type { PipelineStage, PipelineStageStatus } from "../../lib/api";
import { duration } from "../../lib/monitor";
import { STAGE_META, STAGE_STATUS } from "../../lib/pipeline";

const NODE: Record<PipelineStageStatus, string> = {
  waiting: "border-gray-200 bg-white text-gray-400",
  running: "border-sky-500 bg-sky-50 text-sky-700 motion-safe:animate-pulse-ring",
  done: "border-emerald-500 bg-emerald-50 text-emerald-700",
  failed: "border-red-500 bg-red-50 text-red-700",
  skipped: "border-dashed border-gray-300 bg-gray-50 text-gray-300",
  reused: "border-violet-500 bg-violet-50 text-violet-700",
};

const BADGE: Partial<Record<PipelineStageStatus, string>> = {
  done: "bg-emerald-600",
  failed: "bg-red-600",
  reused: "bg-violet-600",
  running: "bg-sky-600",
};

/* The link between two stages: filled once data has passed, flowing
   while it is passing. */
function Link({ from, to }: { from: PipelineStageStatus; to: PipelineStageStatus }) {
  const passed = ["done", "reused"].includes(from) && to !== "waiting" && to !== "skipped";
  const flowing = ["done", "reused"].includes(from) && to === "running";
  return (
    <svg className="mt-6 h-2 min-w-6 flex-1" viewBox="0 0 100 8" preserveAspectRatio="none" aria-hidden="true">
      <line x1="0" y1="4" x2="100" y2="4" stroke="#e5e7eb" strokeWidth="2" vectorEffect="non-scaling-stroke" />
      {(passed || flowing) && (
        <line
          x1="0" y1="4" x2="100" y2="4"
          stroke={flowing ? "#0284c7" : "#111827"}
          strokeWidth="2"
          strokeDasharray={flowing ? "6 10" : undefined}
          vectorEffect="non-scaling-stroke"
          className={flowing ? "motion-safe:animate-flow" : "origin-left motion-safe:animate-grow-x"}
        />
      )}
    </svg>
  );
}

/**
 * The seven stages as a connected flow. Each node is a button: it
 * selects the stage (to inspect it, and as the stage a run starts or
 * stops at).
 */
export default function PipelineFlow({
  stages,
  selected,
  onSelect,
}: {
  stages: PipelineStage[];
  selected: number;
  onSelect: (stage: number) => void;
}) {
  return (
    <div className="-mx-1 overflow-x-auto px-1 pb-1">
      <ol className="flex min-w-[640px] items-start" aria-label="Pipeline stages">
        {stages.map((stage, index) => {
          const meta = STAGE_META[stage.stage];
          const status = STAGE_STATUS[stage.status];
          const isSelected = selected === stage.stage;
          return (
            <li key={stage.stage} className="contents">
              {index > 0 && <Link from={stages[index - 1].status} to={stage.status} />}
              <div className="flex w-20 shrink-0 flex-col items-center text-center">
                <button
                  type="button"
                  onClick={() => onSelect(stage.stage)}
                  aria-pressed={isSelected}
                  aria-label={`${stage.stage}. ${stage.name}: ${status.label}`}
                  className={`relative flex h-14 w-14 items-center justify-center rounded-2xl border-2 transition-all duration-300 ${
                    NODE[stage.status]
                  } ${isSelected ? "ring-2 ring-gray-900 ring-offset-2" : "hover:-translate-y-0.5 hover:shadow-md"}`}
                >
                  <span aria-hidden="true" className="material-symbols-outlined text-[24px]">
                    {meta.icon}
                  </span>
                  {BADGE[stage.status] && (
                    <span
                      className={`absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full text-white ring-2 ring-white ${BADGE[stage.status]}`}
                    >
                      <span
                        aria-hidden="true"
                        className={`material-symbols-outlined text-[13px] ${
                          stage.status === "running" ? "motion-safe:animate-spin" : ""
                        }`}
                      >
                        {status.icon}
                      </span>
                    </span>
                  )}
                </button>
                <span className="mt-2 text-xs font-semibold text-gray-900">
                  <span className="text-gray-400">{stage.stage}</span> {meta.short}
                </span>
                <span className={`text-[11px] ${status.text}`}>
                  {stage.status === "done" && stage.duration_ms !== null
                    ? duration(stage.duration_ms)
                    : status.label}
                </span>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
