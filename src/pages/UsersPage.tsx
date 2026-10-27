import { useCallback, useEffect, useState } from "react";

import { AddUserModal, StatusBadges, UserPanel } from "../components/access/UserPanels";
import { listRoles, listUsers, type ManagedUser, type Role, type UserFilters } from "../lib/access-api";
import InfoTip from "../components/ui/InfoTip";
import { readApiError } from "../lib/api-errors";
import { formatWhen } from "../lib/permissions";

const PAGE_SIZE = 25;

function initials(user: ManagedUser) {
  const parts = (user.name || user.username).split(/[\s._-]+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "?") + (parts[1]?.[0] ?? "")).toUpperCase();
}

/** Settings → Users (manage_users). */
export default function UsersPage() {
  const [users, setUsers] = useState<ManagedUser[] | null>(null);
  const [count, setCount] = useState(0);
  const [roles, setRoles] = useState<Role[]>([]);
  const [error, setError] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [filters, setFilters] = useState<UserFilters>({ page: 1, page_size: PAGE_SIZE });
  const [adding, setAdding] = useState(false);
  const [open, setOpen] = useState<ManagedUser | null>(null);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    const timer = window.setTimeout(() => setFilters((f) => ({ ...f, search: searchInput.trim(), page: 1 })), 300);
    return () => window.clearTimeout(timer);
  }, [searchInput]);

  useEffect(() => {
    listRoles().then(setRoles).catch(() => {});
  }, []);

  useEffect(() => {
    let live = true;
    listUsers(filters).then(
      (page) => {
        if (!live) return;
        setUsers(page.results);
        setCount(page.count);
        setError("");
      },
      (err) => live && setError(readApiError(err, "Couldn't load users.").message),
    );
    return () => {
      live = false;
    };
  }, [filters, version]);

  const refresh = useCallback(() => setVersion((v) => v + 1), []);
  const page = filters.page ?? 1;
  const pages = Math.max(1, Math.ceil(count / PAGE_SIZE));
  const select = "h-10 rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-700 outline-none focus:border-gray-500 focus:ring-2 focus:ring-gray-200";

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-gray-900">Users</h1>
          <p className="mt-1 text-sm text-gray-500">Who can sign in, their roles, and their sign-in security.</p>
        </div>
        <button type="button" onClick={() => setAdding(true)}
          className="inline-flex h-10 items-center gap-2 rounded-lg bg-gray-900 px-4 text-sm font-medium text-white hover:bg-gray-800">
          <span aria-hidden="true" className="material-symbols-outlined text-[18px]">person_add</span>
          Add user
        </button>
      </div>

      <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
        <div className="flex flex-col gap-3 border-b border-gray-200 bg-gray-50/60 px-5 py-4 lg:flex-row">
          <div className="relative flex-1">
            <span aria-hidden="true" className="material-symbols-outlined pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[20px] text-gray-400">search</span>
            <input value={searchInput} onChange={(e) => setSearchInput(e.target.value)} placeholder="Search name, username or email"
              aria-label="Search users"
              className="h-10 w-full rounded-lg border border-gray-300 bg-white pl-10 pr-3 text-sm outline-none focus:border-gray-500 focus:ring-2 focus:ring-gray-200" />
          </div>
          <select aria-label="Role" value={filters.role ?? ""} onChange={(e) => setFilters({ ...filters, role: e.target.value, page: 1 })} className={select}>
            <option value="">All roles</option>
            {roles.map((r) => <option key={r.id} value={String(r.id)}>{r.name}</option>)}
            <option value="none">No role</option>
          </select>
          <select aria-label="Status" value={filters.status ?? ""} onChange={(e) => setFilters({ ...filters, status: e.target.value as UserFilters["status"], page: 1 })} className={select}>
            <option value="">Any status</option>
            <option value="active">Active</option>
            <option value="inactive">Deactivated</option>
            <option value="locked">Locked</option>
          </select>
          <select aria-label="Two-factor" value={filters.mfa ?? ""} onChange={(e) => setFilters({ ...filters, mfa: e.target.value as UserFilters["mfa"], page: 1 })} className={select}>
            <option value="">Two-factor: any</option>
            <option value="on">Two-factor on</option>
            <option value="off">Two-factor off</option>
          </select>
        </div>

        {error && <p role="alert" className="border-b border-red-200 bg-red-50 px-5 py-3 text-sm text-red-700">{error}</p>}

        <div className="relative overflow-x-auto">
          <table className="w-full min-w-[820px]">
            <thead>
              <tr className="border-b border-gray-200 text-left text-[11px] font-semibold uppercase tracking-wider text-gray-400">
                <th className="px-5 py-3">User</th>
                <th className="px-5 py-3">Roles</th>
                <th className="px-5 py-3">
                  <span className="inline-flex items-center gap-1">
                    Status
                    <InfoTip label="About user status" side="bottom">
                      <b>Temporary password</b>: they must choose their own at next sign-in.{" "}
                      <b>Locked</b>: too many wrong passwords; it unlocks by itself or an admin can unlock it.{" "}
                      <b>Deactivated</b>: can't sign in, but their history is kept.
                    </InfoTip>
                  </span>
                </th>
                <th className="px-5 py-3">
                  <span className="inline-flex items-center gap-1">
                    Two-factor
                    <InfoTip label="About two-factor" side="bottom">
                      Whether they sign in with a code from an authenticator app as well as their password. A role can require it;
                      anyone without it set up is asked to at their next sign-in.
                    </InfoTip>
                  </span>
                </th>
                <th className="px-5 py-3">Last sign-in</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 text-sm">
              {users === null && !error && (
                <tr><td colSpan={5} className="px-5 py-10"><div className="h-6 animate-pulse rounded bg-gray-100" aria-label="Loading users" /></td></tr>
              )}
              {users?.length === 0 && (
                <tr><td colSpan={5} className="px-5 py-12 text-center text-sm text-gray-500">No users match.</td></tr>
              )}
              {users?.map((u) => (
                <tr key={u.id} onClick={() => setOpen(u)} className={`cursor-pointer transition hover:bg-gray-50 ${u.is_active ? "" : "opacity-60"}`}>
                  <td className="px-5 py-3">
                    <button type="button" onClick={(e) => { e.stopPropagation(); setOpen(u); }} className="flex items-center gap-3 text-left">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gray-900 text-xs font-semibold text-white">{initials(u)}</span>
                      <span className="min-w-0">
                        <span className="block font-medium text-gray-900">{u.name}</span>
                        <span className="block truncate text-xs text-gray-500">
                          <span className="font-mono">{u.username}</span>{u.email ? ` · ${u.email}` : ""}
                        </span>
                      </span>
                    </button>
                  </td>
                  <td className="px-5 py-3">
                    <span className="flex flex-wrap gap-1">
                      {u.roles.map((r) => <span key={r.id} className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-700">{r.name}</span>)}
                      {!u.roles.length && <span className="text-xs text-gray-400">No role</span>}
                    </span>
                  </td>
                  <td className="px-5 py-3"><StatusBadges user={u} /></td>
                  <td className="px-5 py-3">
                    <span className={`inline-flex items-center gap-1 text-xs ${u.mfa_enabled ? "text-emerald-700" : "text-gray-400"}`}>
                      <span aria-hidden="true" className="material-symbols-outlined text-[16px]">{u.mfa_enabled ? "verified_user" : "remove_moderator"}</span>
                      {u.mfa_enabled ? "On" : "Off"}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-xs text-gray-500">{formatWhen(u.last_login)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {pages > 1 && (
          <div className="flex items-center justify-between border-t border-gray-200 px-5 py-3 text-sm text-gray-600">
            <span>{count.toLocaleString()} users</span>
            <div className="flex gap-2">
              <button type="button" disabled={page <= 1} onClick={() => setFilters({ ...filters, page: page - 1 })} className="rounded-lg border border-gray-300 px-3 py-1 disabled:opacity-40">Previous</button>
              <span className="px-2 py-1">{page} / {pages}</span>
              <button type="button" disabled={page >= pages} onClick={() => setFilters({ ...filters, page: page + 1 })} className="rounded-lg border border-gray-300 px-3 py-1 disabled:opacity-40">Next</button>
            </div>
          </div>
        )}
      </section>

      {adding && <AddUserModal roles={roles} onClose={() => setAdding(false)} onCreated={refresh} />}
      {open && (
        <UserPanel key={open.id} user={open} roles={roles} onClose={() => setOpen(null)}
          onChanged={(u) => setUsers((list) => list?.map((x) => (x.id === u.id ? u : x)) ?? list)} />
      )}
    </div>
  );
}
