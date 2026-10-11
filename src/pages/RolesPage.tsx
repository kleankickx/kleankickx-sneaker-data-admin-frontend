import { useEffect, useMemo, useState } from "react";

import {
  createRole,
  deleteRole,
  getPermissionCatalog,
  getRole,
  listRoles,
  updateRole,
  type Permission,
  type PermissionArea,
  type Role,
} from "../lib/access-api";
import { readApiError } from "../lib/api-errors";
import { useAuth } from "../lib/auth-context";

type Draft = { name: string; description: string; permissions: Permission[]; require_mfa: boolean };

const EMPTY: Draft = { name: "", description: "", permissions: [], require_mfa: false };

/** Settings → Roles (manage_roles): roles and the permissions they grant. */
export default function RolesPage() {
  const { user, can } = useAuth();
  const [roles, setRoles] = useState<Role[] | null>(null);
  const [catalog, setCatalog] = useState<PermissionArea[]>([]);
  const [selected, setSelected] = useState<number | "new" | null>(null);
  const [role, setRole] = useState<Role | null>(null);
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const canEdit = can("manage_roles");

  const held = useMemo(() => new Set(user?.is_superuser ? catalog.flatMap((a) => a.permissions.map((p) => p.codename)) : user?.permissions ?? []), [user, catalog]);

  async function reload(keep?: number) {
    const list = await listRoles();
    setRoles(list);
    if (keep !== undefined) setSelected(keep);
    else if (selected === null && list.length) setSelected(list[0].id);
  }

  useEffect(() => {
    getPermissionCatalog().then(setCatalog).catch(() => {});
    listRoles().then((list) => {
      setRoles(list);
      if (list.length) setSelected(list[0].id);
    }).catch((err) => setMessage({ tone: "error", text: readApiError(err, "Couldn't load roles.").message }));
  }, []);

  function startNew() {
    setSelected("new");
    setRole(null);
    setDraft(EMPTY);
  }

  useEffect(() => {
    if (selected === null || selected === "new") return;
    let live = true;
    getRole(selected).then((r) => {
      if (!live) return;
      setRole(r);
      setDraft({ name: r.name, description: r.description, permissions: r.permissions, require_mfa: r.require_mfa });
    });
    return () => {
      live = false;
    };
  }, [selected]);

  function toggle(codename: Permission) {
    setDraft((d) => ({
      ...d,
      permissions: d.permissions.includes(codename) ? d.permissions.filter((p) => p !== codename) : [...d.permissions, codename],
    }));
  }

  async function save() {
    setBusy(true);
    setMessage(null);
    try {
      if (selected === "new") {
        const created = await createRole(draft);
        await reload(created.id);
        setMessage({ tone: "ok", text: `${created.name} created.` });
      } else if (role) {
        const changes: Partial<Draft> = {};
        if (draft.name !== role.name) changes.name = draft.name;
        if (draft.description !== role.description) changes.description = draft.description;
        if (draft.require_mfa !== role.require_mfa) changes.require_mfa = draft.require_mfa;
        if (draft.permissions.slice().sort().join() !== role.permissions.slice().sort().join()) changes.permissions = draft.permissions;
        const updated = await updateRole(role.id, changes);
        setRole(updated);
        await reload(updated.id);
        setMessage({
          tone: "ok",
          text: changes.permissions && updated.user_count
            ? `Saved. Its ${updated.user_count} member${updated.user_count === 1 ? " was" : "s were"} signed out so the change applies.`
            : "Saved.",
        });
      }
    } catch (err) {
      const { message, fields } = readApiError(err, "Couldn't save the role.");
      setMessage({ tone: "error", text: Object.values(fields)[0] || message });
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!role || !window.confirm(`Delete the ${role.name} role?`)) return;
    setBusy(true);
    try {
      await deleteRole(role.id);
      setSelected(null);
      const list = await listRoles();
      setRoles(list);
      setSelected(list[0]?.id ?? null);
      setMessage({ tone: "ok", text: "Role deleted." });
    } catch (err) {
      setMessage({ tone: "error", text: readApiError(err, "Couldn't delete the role.").message });
    } finally {
      setBusy(false);
    }
  }

  const isAdminRole = Boolean(role?.is_administrator);
  const dirty = selected === "new"
    ? draft.name.trim() !== ""
    : role !== null && (
      draft.name !== role.name || draft.description !== role.description || draft.require_mfa !== role.require_mfa ||
      draft.permissions.slice().sort().join() !== role.permissions.slice().sort().join()
    );

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-gray-900">Roles</h1>
          <p className="mt-1 text-sm text-gray-500">A role is a set of permissions. Users get everything their roles allow.</p>
        </div>
        {canEdit && (
          <button type="button" onClick={startNew}
            className="inline-flex h-10 items-center gap-2 rounded-lg bg-gray-900 px-4 text-sm font-medium text-white hover:bg-gray-800">
            <span aria-hidden="true" className="material-symbols-outlined text-[18px]">add</span>
            New role
          </button>
        )}
      </div>

      {message && (
        <p role="status" className={`rounded-lg px-4 py-2 text-sm ${message.tone === "ok" ? "bg-gray-900 text-white" : "bg-red-50 text-red-700"}`}>
          {message.text}
        </p>
      )}

      <div className="grid gap-6 lg:grid-cols-[280px_minmax(0,1fr)]">
        <nav aria-label="Roles" className="space-y-1">
          {roles === null && <div className="h-40 animate-pulse rounded-xl bg-gray-100" />}
          {roles?.map((r) => (
            <button key={r.id} type="button" onClick={() => setSelected(r.id)} aria-current={selected === r.id}
              className={`flex w-full items-center justify-between gap-3 rounded-xl border px-4 py-3 text-left transition ${
                selected === r.id ? "border-gray-900 bg-white shadow-sm" : "border-transparent hover:bg-white"
              }`}>
              <span className="min-w-0">
                <span className="flex items-center gap-2 text-sm font-medium text-gray-900">
                  {r.name}
                  {r.is_system && <span className="rounded bg-gray-100 px-1.5 text-[10px] font-semibold uppercase text-gray-500">System</span>}
                </span>
                <span className="block text-xs text-gray-500">{r.permissions.length} permissions{r.require_mfa ? " · 2FA required" : ""}</span>
              </span>
              <span className="shrink-0 rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600" title="Users">{r.user_count}</span>
            </button>
          ))}
          {selected === "new" && (
            <div className="rounded-xl border border-dashed border-gray-400 bg-white px-4 py-3 text-sm font-medium text-gray-700">New role</div>
          )}
        </nav>

        {selected !== null && (selected === "new" || role) && (
          <section className="rounded-2xl border border-gray-200 bg-white shadow-sm">
            <div className="space-y-4 border-b border-gray-200 p-6">
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label htmlFor="role-name" className="mb-1 block text-sm font-medium text-gray-700">Name</label>
                  <input id="role-name" value={draft.name} disabled={!canEdit || role?.is_system}
                    onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                    className="h-10 w-full rounded-lg border border-gray-300 px-3 text-sm outline-none focus:border-gray-500 focus:ring-2 focus:ring-gray-200 disabled:bg-gray-50" />
                </div>
                <div>
                  <label htmlFor="role-description" className="mb-1 block text-sm font-medium text-gray-700">Description</label>
                  <input id="role-description" value={draft.description} disabled={!canEdit}
                    onChange={(e) => setDraft({ ...draft, description: e.target.value })}
                    className="h-10 w-full rounded-lg border border-gray-300 px-3 text-sm outline-none focus:border-gray-500 focus:ring-2 focus:ring-gray-200 disabled:bg-gray-50" />
                </div>
              </div>
              <label className="flex items-start gap-3">
                <input type="checkbox" className="mt-0.5 h-4 w-4 accent-gray-900" checked={draft.require_mfa} disabled={!canEdit}
                  onChange={(e) => setDraft({ ...draft, require_mfa: e.target.checked })} />
                <span>
                  <span className="block text-sm font-medium text-gray-900">Require two-factor sign-in</span>
                  <span className="block text-xs text-gray-500">Members set up an authenticator app at their next sign-in and can't turn it off.</span>
                </span>
              </label>
            </div>

            <div className="space-y-6 p-6">
              {isAdminRole && (
                <p className="rounded-lg bg-gray-50 px-3 py-2 text-sm text-gray-600">The Administrator role always has every permission.</p>
              )}
              {catalog.map((area) => (
                <fieldset key={area.area}>
                  <legend className="text-xs font-semibold uppercase tracking-wider text-gray-400">{area.area}</legend>
                  <div className="mt-2 grid gap-2 sm:grid-cols-2">
                    {area.permissions.map((p) => {
                      const checked = isAdminRole || draft.permissions.includes(p.codename);
                      const mine = held.has(p.codename);
                      const disabled = !canEdit || isAdminRole || !mine;
                      return (
                        <label key={p.codename}
                          title={!mine && !isAdminRole ? "You can only grant permissions you have yourself." : undefined}
                          className={`flex items-start gap-3 rounded-lg border px-3 py-2.5 transition ${
                            checked ? "border-gray-900 bg-gray-50" : "border-gray-200"
                          } ${disabled ? "opacity-60" : "cursor-pointer hover:border-gray-300"}`}>
                          <input type="checkbox" className="mt-0.5 h-4 w-4 accent-gray-900" checked={checked} disabled={disabled}
                            onChange={() => toggle(p.codename)} aria-describedby={`perm-${p.codename}`} />
                          <span>
                            <span className="block text-sm font-medium text-gray-900">{p.label}</span>
                            <span id={`perm-${p.codename}`} className="block text-xs leading-5 text-gray-500">{p.description}</span>
                          </span>
                        </label>
                      );
                    })}
                  </div>
                </fieldset>
              ))}
            </div>

            {role?.members && (
              <div className="border-t border-gray-200 p-6">
                <h3 className="text-sm font-semibold text-gray-900">Members ({role.members.length})</h3>
                {role.members.length ? (
                  <ul className="mt-2 flex flex-wrap gap-1.5">
                    {role.members.map((m) => (
                      <li key={m.id} className={`rounded-full bg-gray-100 px-2.5 py-1 text-xs text-gray-700 ${m.is_active ? "" : "line-through opacity-60"}`}>
                        {m.name}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-1 text-sm text-gray-500">No one has this role.</p>
                )}
              </div>
            )}

            {canEdit && (
              <div className="flex items-center justify-between gap-3 border-t border-gray-200 bg-gray-50/60 px-6 py-4">
                {role && !role.is_system ? (
                  <button type="button" onClick={remove} disabled={busy || role.user_count > 0}
                    title={role.user_count > 0 ? "Give its members another role first" : undefined}
                    className="text-sm font-medium text-red-600 hover:text-red-700 disabled:cursor-not-allowed disabled:opacity-40">
                    Delete role
                  </button>
                ) : <span />}
                <div className="flex gap-2">
                  {selected === "new" && (
                    <button type="button" onClick={() => setSelected(roles?.[0]?.id ?? null)} className="h-10 rounded-lg border border-gray-300 bg-white px-4 text-sm font-medium text-gray-700">
                      Cancel
                    </button>
                  )}
                  <button type="button" onClick={save} disabled={busy || !dirty}
                    className="h-10 rounded-lg bg-gray-900 px-4 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-40">
                    {busy ? "Saving…" : selected === "new" ? "Create role" : "Save changes"}
                  </button>
                </div>
              </div>
            )}
          </section>
        )}
      </div>
    </div>
  );
}
