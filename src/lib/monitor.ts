/* Formatting for the pipeline monitor. */

export function pct(rate: number | null | undefined): string {
  if (rate === null || rate === undefined) return "—";
  const value = rate * 100;
  return `${value >= 10 || value === 0 ? Math.round(value) : value.toFixed(1)}%`;
}

export function duration(ms: number | null | undefined): string {
  if (ms === null || ms === undefined) return "—";
  if (ms < 1000) return `${Math.round(ms)} ms`;
  const seconds = ms / 1000;
  return seconds < 60 ? `${seconds.toFixed(1)} s` : `${Math.floor(seconds / 60)} min ${Math.round(seconds % 60)} s`;
}

export function age(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined) return "—";
  if (seconds < 60) return `${seconds} s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours} h`;
  return `${Math.floor(hours / 24)} days`;
}

/* YYYY-MM-DD for a Date, in local time (matches <input type="date">). */
export function isoDay(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function lastNDays(n: number, today = new Date()): { from: string; to: string } {
  const start = new Date(today);
  start.setDate(start.getDate() - (n - 1));
  return { from: isoDay(start), to: isoDay(today) };
}

export const STAGE_LABELS: Record<string, string> = {
  download: "Download photos",
  quality_check: "Quality check",
  label_reader: "Label reader",
  vision_model: "Vision model",
  fusion: "Fusion",
};

export const FUNNEL_LABELS: Record<string, string> = {
  created: "Captures created",
  complete: "Complete (all 6 angles)",
  analyzed: "Analyzed",
  needs_review: "Needs review",
  verified: "Verified",
};

export const FIELD_LABELS: Record<string, string> = {
  brand: "Brand",
  model: "Model",
  sku: "SKU",
  size: "Size",
  colorway: "Colorway",
  condition: "Condition",
  materials: "Materials",
};

export const VIEW_LABELS: Record<string, string> = {
  overview: "Overview",
  lateral: "Left side",
  medial: "Right side",
  top: "Top",
  sole: "Sole",
  label: "Label",
};

/** "2026-10-07" -> "Oct 7" */
export function shortDay(day: string): string {
  const date = new Date(`${day}T00:00:00`);
  return Number.isNaN(date.getTime())
    ? day
    : new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(date);
}
