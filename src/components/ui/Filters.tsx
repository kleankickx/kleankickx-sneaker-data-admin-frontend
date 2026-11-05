/* Toolbar filters: a button per filter that opens a small menu.
   Empty filters show as a dashed "+ Status" button; set ones show their value and an × to clear. */
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";

import { DATE_PRESETS, dateFilterLabel, type DatePreset } from "../../lib/date-ranges";

function usePopover() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return { open, setOpen, ref };
}

function Trigger({
  label,
  value,
  open,
  onToggle,
  onClear,
}: {
  label: string;
  value?: string;
  open: boolean;
  onToggle: () => void;
  onClear: () => void;
}) {
  if (!value) {
    return (
      <button
        type="button"
        onClick={onToggle}
        aria-haspopup="true"
        aria-expanded={open}
        className={`inline-flex h-9 items-center gap-1.5 rounded-full border border-dashed px-3 text-sm font-medium transition ${
          open
            ? "border-gray-400 bg-gray-50 text-gray-900"
            : "border-gray-300 text-gray-600 hover:border-gray-400 hover:bg-gray-50 hover:text-gray-900"
        }`}
      >
        <span aria-hidden="true" className="material-symbols-outlined text-[18px]">add_circle</span>
        {label}
      </button>
    );
  }

  return (
    <div className="inline-flex h-9 items-center rounded-full border border-gray-300 bg-white text-sm shadow-sm">
      <button
        type="button"
        onClick={onToggle}
        aria-haspopup="true"
        aria-expanded={open}
        className="inline-flex h-full items-center gap-1.5 rounded-l-full pl-3 pr-2 hover:bg-gray-50"
      >
        <span className="text-gray-500">{label}</span>
        <span className="max-w-[12rem] truncate font-medium text-gray-900">{value}</span>
        <span aria-hidden="true" className="material-symbols-outlined text-[18px] text-gray-400">expand_more</span>
      </button>
      <button
        type="button"
        onClick={onClear}
        aria-label={`Clear ${label.toLowerCase()} filter`}
        className="inline-flex h-full items-center rounded-r-full border-l border-gray-200 px-2 text-gray-400 hover:bg-gray-50 hover:text-gray-700"
      >
        <span aria-hidden="true" className="material-symbols-outlined text-[16px]">close</span>
      </button>
    </div>
  );
}

/* The menu is placed against the window (position: fixed), below its button, and slides
   left when the button is near the right edge, so it never widens the page or gets cut off. */
function Panel({ children, className = "" }: { children: ReactNode; className?: string }) {
  const panelRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const panel = panelRef.current;
    const anchor = panel?.parentElement;
    if (!panel || !anchor) return;

    function place() {
      if (!panel || !anchor) return;
      const gap = 8;
      const box = anchor.getBoundingClientRect();
      const width = panel.offsetWidth;
      const height = panel.offsetHeight;
      const left = Math.max(gap, Math.min(box.left, window.innerWidth - width - gap));
      const below = box.bottom + gap;
      const fitsBelow = below + height <= window.innerHeight - gap || box.top - gap - height < gap;
      panel.style.left = `${left}px`;
      panel.style.top = `${fitsBelow ? below : box.top - gap - height}px`;
    }

    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, []);

  return (
    <div
      ref={panelRef}
      style={{ left: 0, top: 0 }}
      className={`fixed z-50 max-w-[calc(100vw-1rem)] rounded-xl border border-gray-200 bg-white shadow-lg ring-1 ring-black/5 ${className}`}
    >
      {children}
    </div>
  );
}

/* --- Pick one value from a list ------------------------------------------- */

export interface FilterOption {
  value: string;
  label: string;
}

export function SelectFilter({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: FilterOption[];
  onChange: (value: string) => void;
}) {
  const { open, setOpen, ref } = usePopover();
  const [query, setQuery] = useState("");
  const searchable = options.length > 7;
  const shown = query
    ? options.filter((option) => option.label.toLowerCase().includes(query.toLowerCase()))
    : options;
  const selected = options.find((option) => option.value === value);

  function pick(next: string) {
    onChange(next);
    setOpen(false);
  }

  return (
    <div ref={ref} className="relative">
      <Trigger
        label={label}
        value={selected?.label ?? (value || undefined)}
        open={open}
        onToggle={() => {
          setQuery("");
          setOpen(!open);
        }}
        onClear={() => pick("")}
      />

      {open && (
        <Panel className="w-60 p-1">
          {searchable && (
            <div className="border-b border-gray-100 p-1 pb-2">
              <input
                autoFocus
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={`Find ${label.toLowerCase()}…`}
                className="h-8 w-full rounded-md border border-gray-200 px-2 text-sm outline-none focus:border-gray-400"
              />
            </div>
          )}
          <ul role="menu" aria-label={label} className="max-h-64 overflow-y-auto py-1">
            {shown.length === 0 && <li className="px-3 py-2 text-sm text-gray-400">No matches</li>}
            {shown.map((option) => {
              const active = option.value === value;
              return (
                <li key={option.value}>
                  <button
                    type="button"
                    role="menuitemradio"
                    aria-checked={active}
                    onClick={() => pick(active ? "" : option.value)}
                    className={`flex w-full items-center justify-between gap-2 rounded-md px-3 py-2 text-left text-sm hover:bg-gray-50 ${
                      active ? "font-medium text-gray-900" : "text-gray-700"
                    }`}
                  >
                    <span className="truncate">{option.label}</span>
                    {active && (
                      <span aria-hidden="true" className="material-symbols-outlined text-[18px]">check</span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        </Panel>
      )}
    </div>
  );
}

/* --- Date: presets or a custom range -------------------------------------- */

export function DateFilter({
  label,
  preset,
  from,
  to,
  onChange,
}: {
  label: string;
  preset: DatePreset;
  from: string;
  to: string;
  onChange: (preset: DatePreset, from: string, to: string) => void;
}) {
  const { open, setOpen, ref } = usePopover();
  const [draftFrom, setDraftFrom] = useState(from);
  const [draftTo, setDraftTo] = useState(to);
  const presets = DATE_PRESETS.filter((p) => p.value && p.value !== "custom");
  const canApply = Boolean(draftFrom || draftTo) && (!draftFrom || !draftTo || draftFrom <= draftTo);

  function toggle() {
    setDraftFrom(preset === "custom" ? from : "");
    setDraftTo(preset === "custom" ? to : "");
    setOpen(!open);
  }

  function choose(next: DatePreset, nextFrom = "", nextTo = "") {
    onChange(next, nextFrom, nextTo);
    setOpen(false);
  }

  return (
    <div ref={ref} className="relative">
      <Trigger
        label={label}
        value={dateFilterLabel(preset, from, to)}
        open={open}
        onToggle={toggle}
        onClear={() => choose("")}
      />

      {open && (
        <Panel className="w-[34rem] overflow-hidden">
          <div className="grid sm:grid-cols-[11rem_1fr]">
            <ul
              role="menu"
              aria-label={`${label} presets`}
              className="border-b border-gray-100 p-1 sm:border-b-0 sm:border-r"
            >
              {presets.map((p) => {
                const active = p.value === preset;
                return (
                  <li key={p.value}>
                    <button
                      type="button"
                      role="menuitemradio"
                      aria-checked={active}
                      onClick={() => choose(p.value)}
                      className={`flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm hover:bg-gray-50 ${
                        active ? "bg-gray-100 font-medium text-gray-900" : "text-gray-700"
                      }`}
                    >
                      {p.label}
                      {active && (
                        <span aria-hidden="true" className="material-symbols-outlined text-[18px]">check</span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>

            <form
              className="flex flex-col gap-3 p-4"
              onSubmit={(event) => {
                event.preventDefault();
                if (canApply) choose("custom", draftFrom, draftTo);
              }}
            >
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Custom range</p>
              <div className="grid grid-cols-2 gap-3">
                <label className="flex flex-col gap-1 text-xs font-medium text-gray-600">
                  From
                  <input
                    type="date"
                    value={draftFrom}
                    max={draftTo || undefined}
                    onChange={(event) => setDraftFrom(event.target.value)}
                    className="h-9 rounded-lg border border-gray-200 px-2 text-sm text-gray-900 outline-none focus:border-gray-400 focus:ring-2 focus:ring-gray-100"
                  />
                </label>
                <label className="flex flex-col gap-1 text-xs font-medium text-gray-600">
                  To
                  <input
                    type="date"
                    value={draftTo}
                    min={draftFrom || undefined}
                    onChange={(event) => setDraftTo(event.target.value)}
                    className="h-9 rounded-lg border border-gray-200 px-2 text-sm text-gray-900 outline-none focus:border-gray-400 focus:ring-2 focus:ring-gray-100"
                  />
                </label>
              </div>
              <p className="text-xs text-gray-400">Leave one side empty for an open-ended range.</p>
              <div className="mt-auto flex justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="h-8 rounded-lg px-3 text-sm font-medium text-gray-600 hover:bg-gray-100"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!canApply}
                  className="h-8 rounded-lg bg-gray-900 px-3 text-sm font-medium text-white hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Apply
                </button>
              </div>
            </form>
          </div>
        </Panel>
      )}
    </div>
  );
}
