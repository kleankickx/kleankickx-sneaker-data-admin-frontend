import { Fragment, useEffect, useState } from "react";

import { getAuditActions, listAuditEvents, type AuditEvent, type AuditFilters } from "../lib/access-api";
import { readApiError } from "../lib/api-errors";
import { formatWhen } from "../lib/permissions";

const PAGE_SIZE = 50;

const TONE: Record<string, string> = {
  login_failed: "bg-red-50 text-red-700 ring-red-600/20",
  login_locked: "bg-red-50 text-red-700 ring-red-600/20",
  mfa_failed: "bg-red-50 text-red-700 ring-red-600/20",
  user_deactivated: "bg-amber-50 text-amber-700 ring-amber-600/20",
  role_deleted: "bg-amber-50 text-amber-700 ring-amber-600/20",
  mfa_disabled: "bg-amber-50 text-amber-700 ring-amber-600/20",
  mfa_reset: "bg-amber-50 text-amber-700 ring-amber-600/20",
  password_reset: "bg-amber-50 text-amber-700 ring-amber-600/20",
  password_reset_requested: "bg-sky-50 text-sky-700 ring-sky-600/20",
  password_reset_by_email: "bg-amber-50 text-amber-700 ring-amber-600/20",
  login_succeeded: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
};

function describe(details: Record<string, unknown>) {
  const parts: string[] = [];
  const list = (v: unknown) => (Array.isArray(v) ? v.join(", ") : String(v));
  if (details.added && list(details.added)) parts.push(`added ${list(details.added)}`);
  if (details.removed && list(details.removed)) parts.push(`removed ${list(details.removed)}`);
  if (details.roles && list(details.roles)) parts.push(`roles ${list(details.roles)}`);
  if (details.from !== undefined && details.to !== undefined) parts.push(`${String(details.from)} → ${String(details.to)}`);
  if (details.changes && typeof details.changes === "object") {
    parts.push(`changed ${Object.keys(details.changes).map((k) => k.replace("_", " ")).join(", ")}`);
  }
  if (details.method) parts.push(String(details.method).replace("mfa_", "two-factor ").replace("_", " "));
  if (details.reason) parts.push(String(details.reason).replace("_", " "));
  return parts.join(" · ");
}

/** Settings → Audit log (view_audit_log). */
export default function AuditLogPage() {
  const [events, setEvents] = useState<AuditEvent[] | null>(null);
  const [count, setCount] = useState(0);
  const [actions, setActions] = useState<{ value: string; label: string }[]>([]);
  const [filters, setFilters] = useState<AuditFilters>({ page: 1, page_size: PAGE_SIZE });
  const [searchInput, setSearchInput] = useState("");
  const [error, setError] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    getAuditActions().then(setActions).catch(() => {});
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => setFilters((f) => ({ ...f, search: searchInput.trim(), page: 1 })), 300);
    return () => window.clearTimeout(timer);
  }, [searchInput]);

  useEffect(() => {
    let live = true;
    listAuditEvents(filters).then(
      (page) => {
        if (!live) return;
        setEvents(page.results);
        setCount(page.count);
        setError("");
      },
      (err) => live && setError(readApiError(err, "Couldn't load the audit log.").message),
    );
    return () => {
      live = false;
    };
  }, [filters]);

  const page = filters.page ?? 1;
  const pages = Math.max(1, Math.ceil(count / PAGE_SIZE));
  const control = "h-10 rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-700 outline-none focus:border-gray-500 focus:ring-2 focus:ring-gray-200";

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-gray-900">Audit log</h1>
        <p className="mt-1 text-sm text-gray-500">Every sign-in and every change to users and roles. Entries can't be edited or deleted.</p>
      </div>

      <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
        <div className="flex flex-col gap-3 border-b border-gray-200 bg-gray-50/60 px-5 py-4 lg:flex-row">
          <input value={searchInput} onChange={(e) => setSearchInput(e.target.value)} aria-label="Search the audit log"
            placeholder="Search user, target or IP" className={`${control} flex-1`} />
          <select aria-label="Event" value={filters.action ?? ""} onChange={(e) => setFilters({ ...filters, action: e.target.value, page: 1 })} className={control}>
            <option value="">All events</option>
            {actions.map((a) => <option key={a.value} value={a.value}>{a.label}</option>)}
          </select>
          <input type="date" aria-label="From" value={filters.from ?? ""} onChange={(e) => setFilters({ ...filters, from: e.target.value, page: 1 })} className={control} />
          <input type="date" aria-label="To" value={filters.to ?? ""} onChange={(e) => setFilters({ ...filters, to: e.target.value, page: 1 })} className={control} />
        </div>

        {error && <p role="alert" className="border-b border-red-200 bg-red-50 px-5 py-3 text-sm text-red-700">{error}</p>}

        <div className="relative overflow-x-auto">
          <table className="w-full min-w-[860px]">
            <thead>
              <tr className="border-b border-gray-200 text-left text-[11px] font-semibold uppercase tracking-wider text-gray-400">
                <th className="px-5 py-3">When</th>
                <th className="px-5 py-3">Event</th>
                <th className="px-5 py-3">By</th>
                <th className="px-5 py-3">Target</th>
                <th className="px-5 py-3">Details</th>
                <th className="px-5 py-3">IP address</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 text-sm">
              {events === null && !error && (
                <tr><td colSpan={6} className="px-5 py-10"><div className="h-6 animate-pulse rounded bg-gray-100" aria-label="Loading events" /></td></tr>
              )}
              {events?.length === 0 && (
                <tr><td colSpan={6} className="px-5 py-12 text-center text-gray-500">No events match.</td></tr>
              )}
              {events?.map((e) => (
                <Fragment key={e.id}>
                  <tr className="cursor-pointer hover:bg-gray-50" onClick={() => setExpanded(expanded === e.id ? null : e.id)}>
                    <td className="whitespace-nowrap px-5 py-3 text-xs text-gray-500">{formatWhen(e.created_at)}</td>
                    <td className="px-5 py-3">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${TONE[e.action] ?? "bg-gray-100 text-gray-700 ring-gray-500/20"}`}>
                        {e.action_label}
                      </span>
                    </td>
                    <td className="px-5 py-3 font-mono text-xs text-gray-800">{e.actor_label || "—"}</td>
                    <td className="px-5 py-3 text-gray-800">
                      {e.target_label || "—"}
                      {e.target_type === "role" && <span className="ml-1 text-xs text-gray-400">(role)</span>}
                    </td>
                    <td className="px-5 py-3 text-xs text-gray-600">{describe(e.details)}</td>
                    <td className="px-5 py-3 font-mono text-xs text-gray-500">{e.ip_address ?? "—"}</td>
                  </tr>
                  {expanded === e.id && (
                    <tr className="bg-gray-50">
                      <td colSpan={6} className="px-5 py-3">
                        <p className="text-xs text-gray-500">Device: {e.user_agent || "unknown"}</p>
                        <pre className="mt-2 max-h-48 overflow-auto rounded-lg bg-white p-3 text-xs text-gray-700 ring-1 ring-gray-200">
                          {JSON.stringify(e.details, null, 2)}
                        </pre>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>

        {pages > 1 && (
          <div className="flex items-center justify-between border-t border-gray-200 px-5 py-3 text-sm text-gray-600">
            <span>{count.toLocaleString()} events</span>
            <div className="flex gap-2">
              <button type="button" disabled={page <= 1} onClick={() => setFilters({ ...filters, page: page - 1 })} className="rounded-lg border border-gray-300 px-3 py-1 disabled:opacity-40">Newer</button>
              <span className="px-2 py-1">{page} / {pages}</span>
              <button type="button" disabled={page >= pages} onClick={() => setFilters({ ...filters, page: page + 1 })} className="rounded-lg border border-gray-300 px-3 py-1 disabled:opacity-40">Older</button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
