import { useEffect, useState } from "react";

import { getBatchSummary, type BatchSummary } from "../../lib/api";
import InfoTip from "../ui/InfoTip";

function tone(images: number, required: number) {
  if (images === required) return { bar: "bg-emerald-500", text: "text-emerald-700" };
  if (images >= 3) return { bar: "bg-amber-400", text: "text-amber-700" };
  if (images >= 1) return { bar: "bg-orange-500", text: "text-orange-700" };
  return { bar: "bg-red-400", text: "text-red-700" };
}

function Stat({ label, value, hint, accent }: { label: string; value: string; hint?: string; accent?: string }) {
  return (
    <div className="rounded-xl border border-gray-200 px-4 py-3">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">{label}</p>
      <p className={`mt-1 text-xl font-semibold tabular-nums ${accent ?? "text-gray-900"}`}>{value}</p>
      {hint && <p className="mt-0.5 text-xs text-gray-500">{hint}</p>}
    </div>
  );
}

/**
 * How complete the batch's captures are: pairs by number of the required
 * photos uploaded (6 of 6 down to 0), and which angles are missing.
 * Picking an image count filters the pairs table to it.
 */
export default function BatchSummaryPanel({
  batchId,
  version,
  selected,
  onSelect,
}: {
  batchId: string;
  /** Bump to reload, e.g. after an upload or a cleanup. */
  version: number;
  selected: number | null;
  onSelect: (images: number | null) => void;
}) {
  const [summary, setSummary] = useState<BatchSummary | null>(null);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let live = true;
    getBatchSummary(batchId)
      .then((data) => {
        if (!live) return;
        setSummary(data);
        setError("");
      })
      .catch(() => {
        if (live) setError("Couldn't load the batch summary.");
      });
    return () => {
      live = false;
    };
  }, [batchId, version, attempt]);

  if (error && !summary) {
    return (
      <section className="flex items-center justify-between gap-4 rounded-2xl border border-red-200 bg-red-50 px-6 py-4">
        <p className="text-sm text-red-700">{error}</p>
        <button type="button" onClick={() => setAttempt((n) => n + 1)} className="text-sm font-medium text-red-700 underline">
          Retry
        </button>
      </section>
    );
  }

  if (!summary) {
    return <div aria-label="Loading batch summary" className="h-64 animate-pulse rounded-2xl border border-gray-200 bg-white" />;
  }

  const { total_pairs: total, required_images: required } = summary;
  const pct = (n: number) => (total ? `${Math.round((n / total) * 100)}%` : "0%");
  const partial = total - summary.complete_pairs - summary.pairs_without_images;
  const peak = Math.max(1, ...summary.by_image_count.map((b) => b.pairs));
  const missing = summary.missing_by_angle.filter((m) => m.pairs > 0);

  return (
    <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm" aria-labelledby="batch-summary-title">
      <div className="border-b border-gray-200 px-6 py-5 sm:px-7">
        <h2 id="batch-summary-title" className="text-base font-semibold text-gray-900">Batch summary</h2>
        <p className="mt-1 text-sm text-gray-500">
          Pairs by how many of the {required} required photos are uploaded. Pick a row to list those pairs.
        </p>
      </div>

      <div className="grid gap-3 px-6 pt-5 sm:grid-cols-2 sm:px-7 xl:grid-cols-5">
        <Stat
          label="Pairs"
          value={total.toLocaleString()}
          hint={summary.expected_quantity ? `of ${summary.expected_quantity.toLocaleString()} expected` : undefined}
        />
        <Stat label={`All ${required} images`} value={summary.complete_pairs.toLocaleString()} hint={`${pct(summary.complete_pairs)} of pairs`} accent="text-emerald-700" />
        <Stat label="Missing some" value={partial.toLocaleString()} hint={`1–${required - 1} images · ${pct(partial)}`} accent={partial ? "text-amber-700" : undefined} />
        <Stat label="No images" value={summary.pairs_without_images.toLocaleString()} hint={pct(summary.pairs_without_images)} accent={summary.pairs_without_images ? "text-red-700" : undefined} />
        <Stat
          label="Images uploaded"
          value={summary.total_images.toLocaleString()}
          hint={`${summary.with_sku.toLocaleString()} pairs with a SKU`}
        />
      </div>

      <div className="grid gap-6 px-6 py-5 sm:px-7 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <div>
          <h3 className="flex items-center gap-1 text-xs font-semibold uppercase tracking-wider text-gray-400">
            Pairs by images uploaded
            <InfoTip label="About image counts" side="bottom">
              Counts each pair's photos across all its capture sessions. A pair needs all {required} angles to be
              analysed and verified. Select a row to export just those pairs.
            </InfoTip>
          </h3>
          <ul className="mt-3 space-y-1">
            {summary.by_image_count.map((b, i) => {
              const t = tone(b.images, required);
              const active = selected === b.images;
              return (
                <li key={b.images}>
                  <button
                    type="button"
                    disabled={!b.pairs && !active}
                    aria-pressed={active}
                    aria-label={`${b.images} of ${required} images: ${b.pairs} pairs`}
                    onClick={() => onSelect(active ? null : b.images)}
                    className={`group grid w-full grid-cols-[4.5rem_minmax(0,1fr)_5.5rem] items-center gap-3 rounded-lg px-2 py-1.5 text-left transition disabled:cursor-default ${
                      active ? "bg-gray-900 text-white" : "hover:bg-gray-50 disabled:hover:bg-transparent"
                    }`}
                  >
                    <span className={`text-sm font-medium tabular-nums ${active ? "text-white" : "text-gray-700"}`}>
                      {b.images} of {required}
                    </span>
                    <span className={`h-2.5 overflow-hidden rounded-full ${active ? "bg-white/20" : "bg-gray-100"}`}>
                      <span
                        className={`block h-full origin-left rounded-full motion-safe:animate-grow-x ${t.bar}`}
                        style={{ width: `${(b.pairs / peak) * 100}%`, animationDelay: `${i * 50}ms` }}
                      />
                    </span>
                    <span className="text-right text-sm tabular-nums">
                      <span className={`font-semibold ${active ? "text-white" : b.pairs ? t.text : "text-gray-300"}`}>
                        {b.pairs.toLocaleString()}
                      </span>
                      <span className={`ml-1.5 text-xs ${active ? "text-white/70" : "text-gray-400"}`}>{Math.round(b.percent)}%</span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>

        <div className="space-y-5">
          <div>
            <h3 className="flex items-center gap-1 text-xs font-semibold uppercase tracking-wider text-gray-400">
              Pairs missing each angle
              <InfoTip label="About missing angles" side="bottom">
                How many pairs have no photo for each angle. A pair missing two angles is counted under both.
              </InfoTip>
            </h3>
            {missing.length ? (
              <ul className="mt-3 grid grid-cols-3 gap-2">
                {summary.missing_by_angle.map((m) => (
                  <li key={m.angle} className="rounded-lg border border-gray-200 px-3 py-2">
                    <p className="text-xs capitalize text-gray-500">{m.angle}</p>
                    <p className={`text-base font-semibold tabular-nums ${m.pairs ? "text-gray-900" : "text-gray-300"}`}>
                      {m.pairs.toLocaleString()}
                    </p>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-sm text-gray-500">{total ? "Every pair has all its angles." : "No pairs yet."}</p>
            )}
          </div>

          {summary.by_status.length > 0 && (
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-400">By status</h3>
              <ul className="mt-2 flex flex-wrap gap-1.5">
                {summary.by_status.map((s) => (
                  <li key={s.status} className="rounded-full bg-gray-100 px-2.5 py-1 text-xs text-gray-700">
                    {s.label} <span className="font-semibold tabular-nums">{s.pairs.toLocaleString()}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {summary.by_condition.length > 0 && (
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-400">By condition</h3>
              <ul className="mt-2 flex flex-wrap gap-1.5">
                {summary.by_condition.map((c) => (
                  <li key={c.condition} className="rounded-full bg-gray-100 px-2.5 py-1 text-xs text-gray-700">
                    {c.condition} <span className="font-semibold tabular-nums">{c.pairs.toLocaleString()}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
