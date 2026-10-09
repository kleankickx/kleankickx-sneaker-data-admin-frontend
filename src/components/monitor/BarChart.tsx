import { useState } from "react";

export interface Bar {
  key: string;
  /* Axis label, e.g. "Oct 7". */
  label: string;
  value: number;
}

/**
 * One series of vertical bars (counts over time). Single hue, so no
 * legend: the card title names the series. Each bar shows its value on
 * hover or keyboard focus; a hidden table carries the same numbers for
 * screen readers.
 */
export default function BarChart({
  bars,
  unit,
  height = 120,
}: {
  bars: Bar[];
  /* Singular noun for the tooltip, e.g. "run". */
  unit: string;
  height?: number;
}) {
  const [active, setActive] = useState<string | null>(null);
  const max = Math.max(1, ...bars.map((b) => b.value));

  if (bars.length === 0) {
    return <p className="py-8 text-center text-sm text-gray-400">No data in this range.</p>;
  }

  // Label every bar when few, else about six evenly spaced ones.
  const step = Math.max(1, Math.ceil(bars.length / 6));

  return (
    <div>
      <div
        className="flex items-end gap-[2px] border-b border-gray-200"
        style={{ height }}
        aria-hidden="true"
      >
        {bars.map((bar) => {
          const shown = active === bar.key;
          return (
            <div
              key={bar.key}
              tabIndex={0}
              onMouseEnter={() => setActive(bar.key)}
              onMouseLeave={() => setActive(null)}
              onFocus={() => setActive(bar.key)}
              onBlur={() => setActive(null)}
              className="group relative flex h-full flex-1 items-end outline-none"
            >
              <div
                className={`w-full rounded-t-[4px] transition-colors ${
                  shown ? "bg-gray-900" : "bg-gray-700"
                }`}
                style={{ height: `${(bar.value / max) * 100}%`, minHeight: bar.value ? 2 : 0 }}
              />
              {shown && (
                <div className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1.5 -translate-x-1/2 whitespace-nowrap rounded-md bg-gray-900 px-2 py-1 text-xs text-white shadow">
                  <span className="font-semibold">{bar.value}</span>{" "}
                  {bar.value === 1 ? unit : `${unit}s`} · {bar.label}
                </div>
              )}
            </div>
          );
        })}
      </div>
      <div className="mt-1 flex gap-[2px]" aria-hidden="true">
        {bars.map((bar, i) => (
          <span key={bar.key} className="flex-1 truncate text-center text-[10px] text-gray-400">
            {i % step === 0 ? bar.label : ""}
          </span>
        ))}
      </div>
      <table className="sr-only">
        <tbody>
          {bars.map((bar) => (
            <tr key={bar.key}>
              <th scope="row">{bar.label}</th>
              <td>{bar.value}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
