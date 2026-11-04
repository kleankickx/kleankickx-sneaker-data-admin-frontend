/* Date presets for list filters ("Today", "This month", …), in the viewer's local time. */

export type DatePreset =
  | ""
  | "today"
  | "yesterday"
  | "this_week"
  | "last_7_days"
  | "this_month"
  | "last_month"
  | "this_year"
  | "custom";

export const DATE_PRESETS: { value: DatePreset; label: string }[] = [
  { value: "", label: "Any date" },
  { value: "today", label: "Today" },
  { value: "yesterday", label: "Yesterday" },
  { value: "this_week", label: "This week" },
  { value: "last_7_days", label: "Last 7 days" },
  { value: "this_month", label: "This month" },
  { value: "last_month", label: "Last month" },
  { value: "this_year", label: "This year" },
  { value: "custom", label: "Custom range…" },
];

export interface DateRange {
  start: Date | null; // inclusive
  end: Date | null;   // exclusive
}

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);

/** "2026-11-04" from an <input type="date"> as local midnight, or null. */
function parseDay(value?: string): Date | null {
  if (!value) return null;
  const [y, m, d] = value.split("-").map(Number);
  return y && m && d ? new Date(y, m - 1, d) : null;
}

export function dateRange(preset: DatePreset, from?: string, to?: string, now = new Date()): DateRange {
  const today = startOfDay(now);
  switch (preset) {
    case "today":
      return { start: today, end: addDays(today, 1) };
    case "yesterday":
      return { start: addDays(today, -1), end: today };
    case "this_week": {
      const sinceMonday = (today.getDay() + 6) % 7; // weeks start on Monday
      return { start: addDays(today, -sinceMonday), end: addDays(today, 1) };
    }
    case "last_7_days":
      return { start: addDays(today, -6), end: addDays(today, 1) };
    case "this_month":
      return { start: new Date(today.getFullYear(), today.getMonth(), 1), end: addDays(today, 1) };
    case "last_month":
      return {
        start: new Date(today.getFullYear(), today.getMonth() - 1, 1),
        end: new Date(today.getFullYear(), today.getMonth(), 1),
      };
    case "this_year":
      return { start: new Date(today.getFullYear(), 0, 1), end: addDays(today, 1) };
    case "custom": {
      const end = parseDay(to);
      return { start: parseDay(from), end: end ? addDays(end, 1) : null }; // "to" day included
    }
    default:
      return { start: null, end: null };
  }
}

export function inDateRange(value: string | null | undefined, range: DateRange): boolean {
  if (!range.start && !range.end) return true;
  if (!value) return false;
  const time = new Date(value).getTime();
  if (Number.isNaN(time)) return false;
  return (!range.start || time >= range.start.getTime()) && (!range.end || time < range.end.getTime());
}
