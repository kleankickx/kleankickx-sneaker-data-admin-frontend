import { useEffect, useState, type ReactNode } from "react";

import {
  createUser,
  listAuditEvents,
  resetUserPassword,
  runUserAction,
  updateUser,
  type AuditEvent,
  type ManagedUser,
  type Role,
  type UserAction,
} from "../../lib/access-api";
import { readApiError } from "../../lib/api-errors";
import { useAuth } from "../../lib/auth-context";
import { formatWhen } from "../../lib/permissions";
import { OneTimeSecret } from "./SecretReveal";

const field =
  "h-10 w-full rounded-lg border border-gray-300 px-3 text-sm outline-none focus:border-gray-500 focus:ring-2 focus:ring-gray-200";

/* Roles you can hand out: their permissions are a subset of yours. */
function useGrantable() {
  const { user } = useAuth();
  return (role: Role) =>
    Boolean(user?.is_superuser) || role.permissions.every((p) => user?.permissions?.includes(p));
}

export function StatusBadges({ user }: { user: ManagedUser }) {
  const badges: { label: string; tone: string }[] = [];
  if (!user.is_active) badges.push({ label: "Deactivated", tone: "bg-gray-100 text-gray-600 ring-gray-500/20" });
  else badges.push({ label: "Active", tone: "bg-emerald-50 text-emerald-700 ring-emerald-600/20" });
  if (user.locked_minutes > 0) badges.push({ label: `Locked ${user.locked_minutes} min`, tone: "bg-red-50 text-red-700 ring-red-600/20" });
  if (user.must_change_password) badges.push({ label: "Temporary password", tone: "bg-amber-50 text-amber-700 ring-amber-600/20" });
  if (user.is_superuser) badges.push({ label: "Superuser", tone: "bg-gray-900 text-white ring-gray-900" });
  return (
    <span className="flex flex-wrap gap-1">
      {badges.map((b) => (
        <span key={b.label} className={`rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset ${b.tone}`}>{b.label}</span>
      ))}
    </span>
  );
}

function RolePicker({
  roles,
  selected,
  onChange,
  disabled,
}: {
  roles: Role[];
  selected: number[];
  onChange: (ids: number[]) => void;
  disabled?: boolean;
}) {
  const grantable = useGrantable();
  return (
    <fieldset className="space-y-1.5" disabled={disabled}>
      <legend className="sr-only">Roles</legend>
      {roles.map((role) => {
        const allowed = grantable(role);
        const checked = selected.includes(role.id);
        return (
          <label
            key={role.id}
            title={allowed ? undefined : "This role has permissions you don't have, so you can't grant or remove it."}
            className={`flex cursor-pointer items-start gap-3 rounded-lg border px-3 py-2 transition ${
              checked ? "border-gray-900 bg-gray-50" : "border-gray-200 hover:border-gray-300"
            } ${allowed && !disabled ? "" : "cursor-not-allowed opacity-60"}`}
          >
            <input
              type="checkbox"
              className="mt-0.5 h-4 w-4 accent-gray-900"
              checked={checked}
              disabled={!allowed || disabled}
              onChange={(e) => onChange(e.target.checked ? [...selected, role.id] : selected.filter((id) => id !== role.id))}
            />
            <span className="min-w-0">
              <span className="flex items-center gap-2 text-sm font-medium text-gray-900">
                {role.name}
                {role.require_mfa && <span className="rounded bg-violet-50 px-1.5 text-[10px] font-semibold uppercase text-violet-700">2FA</span>}
              </span>
              {role.description && <span className="block text-xs text-gray-500">{role.description}</span>}
            </span>
          </label>
        );
      })}
    </fieldset>
  );
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true" aria-label={title}>
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
          <h2 className="text-base font-semibold text-gray-900">{title}</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="text-gray-400 hover:text-gray-700">
            <span aria-hidden="true" className="material-symbols-outlined">close</span>
          </button>
        </div>
        <div className="px-6 py-5">{children}</div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Add user                                                            */
/* ------------------------------------------------------------------ */

export function AddUserModal({ roles, onClose, onCreated }: {
  roles: Role[];
  onClose: () => void;
  onCreated: (user: ManagedUser) => void;
}) {
  const [form, setForm] = useState({ username: "", first_name: "", last_name: "", email: "" });
  const [roleIds, setRoleIds] = useState<number[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState<{ user: ManagedUser; password: string } | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setErrors({});
    try {
      const result = await createUser({ ...form, role_ids: roleIds });
      setCreated({ user: result.user, password: result.temporary_password });
      onCreated(result.user);
    } catch (err) {
      const { message, fields } = readApiError(err, "Couldn't create the user.");
      setErrors({ ...fields, form: Object.keys(fields).length ? "" : message });
    } finally {
      setBusy(false);
    }
  }

  if (created) {
    return (
      <Modal title="User created" onClose={onClose}>
        <p className="text-sm text-gray-600">
          Give <strong>{created.user.username}</strong> this temporary password in person or over a secure channel.
          They'll choose their own when they first sign in.
        </p>
        <div className="mt-4">
          <OneTimeSecret label="Temporary password" value={created.password} note="It won't be shown again. If it's lost, reset the password." />
        </div>
        <button type="button" onClick={onClose} className="mt-5 h-10 w-full rounded-lg bg-gray-900 text-sm font-medium text-white hover:bg-gray-800">
          Done
        </button>
      </Modal>
    );
  }

  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [key]: e.target.value });

  return (
    <Modal title="Add user" onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <div>
          <label htmlFor="new-username" className="mb-1 block text-sm font-medium text-gray-700">Username</label>
          <input id="new-username" required value={form.username} onChange={set("username")} autoCapitalize="none" spellCheck={false} className={field} />
          {errors.username && <p className="mt-1 text-xs text-red-700">{errors.username}</p>}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="new-first" className="mb-1 block text-sm font-medium text-gray-700">First name</label>
            <input id="new-first" value={form.first_name} onChange={set("first_name")} className={field} />
          </div>
          <div>
            <label htmlFor="new-last" className="mb-1 block text-sm font-medium text-gray-700">Last name</label>
            <input id="new-last" value={form.last_name} onChange={set("last_name")} className={field} />
          </div>
        </div>
        <div>
          <label htmlFor="new-email" className="mb-1 block text-sm font-medium text-gray-700">Email <span className="font-normal text-gray-400">(optional)</span></label>
          <input id="new-email" type="email" value={form.email} onChange={set("email")} className={field} />
          {errors.email && <p className="mt-1 text-xs text-red-700">{errors.email}</p>}
        </div>
        <div>
          <p className="mb-1.5 text-sm font-medium text-gray-700">Roles</p>
          <RolePicker roles={roles} selected={roleIds} onChange={setRoleIds} />
          {!roleIds.length && <p className="mt-1.5 text-xs text-amber-700">Without a role, the user can sign in but can't see anything.</p>}
        </div>
        {errors.form && <p role="alert" className="text-sm text-red-700">{errors.form}</p>}
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="h-10 rounded-lg border border-gray-300 px-4 text-sm font-medium text-gray-700 hover:bg-gray-50">Cancel</button>
          <button type="submit" disabled={busy || !form.username.trim()} className="h-10 rounded-lg bg-gray-900 px-4 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50">
            {busy ? "Creating…" : "Create user"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

/* ------------------------------------------------------------------ */
/* One user                                                            */
/* ------------------------------------------------------------------ */

const ACTION_CONFIRM: Partial<Record<UserAction | "reset-password", string>> = {
  deactivate: "Deactivate this user? They're signed out at once and can't sign in until reactivated.",
  "revoke-sessions": "Sign this user out on every device?",
  "reset-mfa": "Reset their two-factor? They'll set it up again (if their role requires it) at next sign-in.",
  "reset-password": "Reset their password? They're signed out and get a new temporary password.",
};

export function UserPanel({ user: initial, roles, onClose, onChanged }: {
  user: ManagedUser;
  roles: Role[];
  onClose: () => void;
  onChanged: (user: ManagedUser) => void;
}) {
  const { user: me, can } = useAuth();
  const [user, setUser] = useState(initial);
  const [details, setDetails] = useState({
    username: initial.username,
    first_name: initial.first_name,
    last_name: initial.last_name,
    email: initial.email,
  });
  const [roleIds, setRoleIds] = useState(initial.roles.map((r) => r.id));
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [tempPassword, setTempPassword] = useState("");
  const [busy, setBusy] = useState("");
  const [events, setEvents] = useState<AuditEvent[] | null>(null);
  const isMe = String(me?.id) === user.id;
  const locked = user.is_superuser && !me?.is_superuser;

  useEffect(() => {
    if (!can("view_audit_log")) return;
    let live = true;
    listAuditEvents({ target: initial.id, page_size: 8 }).then((page) => live && setEvents(page.results)).catch(() => {});
    return () => {
      live = false;
    };
  }, [initial.id, can]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  function done(next: ManagedUser, text: string) {
    setUser(next);
    setDetails({ username: next.username, first_name: next.first_name, last_name: next.last_name, email: next.email });
    setRoleIds(next.roles.map((r) => r.id));
    onChanged(next);
    setMessage({ tone: "ok", text });
  }

  async function run(name: string, work: () => Promise<void>) {
    setBusy(name);
    setMessage(null);
    try {
      await work();
    } catch (err) {
      setMessage({ tone: "error", text: readApiError(err, "That didn't work.").message });
    } finally {
      setBusy("");
    }
  }

  const saveDetails = () => {
    // Only what changed, so an untouched email or username is never re-checked.
    const changes = Object.fromEntries(
      (Object.keys(details) as (keyof typeof details)[])
        .filter((key) => details[key].trim() !== user[key])
        .map((key) => [key, details[key].trim()]),
    );
    if (changes.username && !window.confirm(
      `Rename ${user.username} to ${changes.username}? They'll be signed out and sign in with the new username.`,
    )) return;
    run("details", async () =>
      done(await updateUser(user.id, changes), changes.username ? "Saved. They've been signed out and use the new username from now on." : "Details saved."),
    );
  };
  const saveRoles = () => run("roles", async () => done(await updateUser(user.id, { role_ids: roleIds }), "Roles saved. They've been signed out so the change applies."));

  function action(name: UserAction | "reset-password", text: string) {
    if (ACTION_CONFIRM[name] && !window.confirm(ACTION_CONFIRM[name])) return;
    run(name, async () => {
      if (name === "reset-password") {
        const result = await resetUserPassword(user.id);
        setTempPassword(result.temporary_password);
        done(result.user, text);
      } else {
        done(await runUserAction(user.id, name), text);
      }
    });
  }

  const rolesChanged = roleIds.slice().sort().join() !== user.roles.map((r) => r.id).sort().join();
  const detailsChanged = (Object.keys(details) as (keyof typeof details)[]).some(
    (key) => details[key].trim() !== user[key],
  );

  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-black/30" role="dialog" aria-modal="true" aria-label={`User ${user.username}`}>
      <div className="h-full w-full max-w-xl overflow-y-auto bg-white shadow-2xl">
        <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-gray-200 bg-white px-6 py-4">
          <div className="min-w-0">
            <h2 className="truncate text-lg font-semibold text-gray-900">{user.name}</h2>
            <p className="font-mono text-xs text-gray-500">{user.username}{isMe ? " · you" : ""}</p>
            <div className="mt-2"><StatusBadges user={user} /></div>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="text-gray-400 hover:text-gray-700">
            <span aria-hidden="true" className="material-symbols-outlined">close</span>
          </button>
        </div>

        <div className="space-y-8 px-6 py-6">
          {message && (
            <p role="status" className={`rounded-lg px-3 py-2 text-sm ${message.tone === "ok" ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-700"}`}>
              {message.text}
            </p>
          )}
          {tempPassword && (
            <OneTimeSecret label="New temporary password" value={tempPassword} note="Share it securely. It won't be shown again." />
          )}
          {locked && <p className="rounded-lg bg-gray-100 px-3 py-2 text-sm text-gray-700">Only a superuser can change a superuser.</p>}

          <section>
            <h3 className="text-sm font-semibold text-gray-900">Details</h3>
            <div className="mt-3 grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <input aria-label="Username" value={details.username} disabled={locked || isMe} autoCapitalize="none" spellCheck={false}
                  onChange={(e) => setDetails({ ...details, username: e.target.value })} className={`${field} font-mono`} placeholder="Username" />
                <p className="mt-1 text-xs text-gray-500">
                  {isMe ? "Another administrator can change your username." : "Changing it signs them out; they sign in with the new one."}
                </p>
              </div>
              <input aria-label="First name" value={details.first_name} disabled={locked} onChange={(e) => setDetails({ ...details, first_name: e.target.value })} className={field} placeholder="First name" />
              <input aria-label="Last name" value={details.last_name} disabled={locked} onChange={(e) => setDetails({ ...details, last_name: e.target.value })} className={field} placeholder="Last name" />
              <input aria-label="Email" type="email" value={details.email} disabled={locked} onChange={(e) => setDetails({ ...details, email: e.target.value })} className={`${field} col-span-2`} placeholder="Email" />
            </div>
            <button type="button" disabled={!detailsChanged || busy !== ""} onClick={saveDetails}
              className="mt-3 rounded-lg bg-gray-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-40">
              Save details
            </button>
          </section>

          <section>
            <h3 className="text-sm font-semibold text-gray-900">Roles</h3>
            {isMe && <p className="mt-1 text-xs text-gray-500">You can't change your own roles. Ask another administrator.</p>}
            <div className="mt-3">
              <RolePicker roles={roles} selected={roleIds} onChange={setRoleIds} disabled={isMe || locked} />
            </div>
            <button type="button" disabled={!rolesChanged || busy !== ""} onClick={saveRoles}
              className="mt-3 rounded-lg bg-gray-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-40">
              Save roles
            </button>
          </section>

          <section>
            <h3 className="text-sm font-semibold text-gray-900">Security</h3>
            <dl className="mt-3 grid grid-cols-[150px_minmax(0,1fr)] gap-y-1.5 text-sm">
              <dt className="text-gray-500">Last sign-in</dt><dd className="text-gray-900">{formatWhen(user.last_login)}</dd>
              <dt className="text-gray-500">Password changed</dt><dd className="text-gray-900">{formatWhen(user.password_changed_at)}</dd>
              <dt className="text-gray-500">Two-factor</dt><dd className="text-gray-900">{user.mfa_enabled ? "On" : "Off"}</dd>
              <dt className="text-gray-500">Joined</dt><dd className="text-gray-900">{formatWhen(user.date_joined)}</dd>
            </dl>
            {!isMe && !locked && (
              <div className="mt-4 flex flex-wrap gap-2">
                <ActionButton busy={busy === "reset-password"} onClick={() => action("reset-password", "Password reset.")} icon="key">Reset password</ActionButton>
                <ActionButton busy={busy === "revoke-sessions"} onClick={() => action("revoke-sessions", "Signed out everywhere.")} icon="logout">Sign out everywhere</ActionButton>
                {user.locked_minutes > 0 && (
                  <ActionButton busy={busy === "unlock"} onClick={() => action("unlock", "Unlocked.")} icon="lock_open">Unlock</ActionButton>
                )}
                {user.mfa_enabled && (
                  <ActionButton busy={busy === "reset-mfa"} onClick={() => action("reset-mfa", "Two-factor reset.")} icon="phonelink_erase">Reset two-factor</ActionButton>
                )}
                {user.is_active ? (
                  <ActionButton danger busy={busy === "deactivate"} onClick={() => action("deactivate", "User deactivated.")} icon="person_off">Deactivate</ActionButton>
                ) : (
                  <ActionButton busy={busy === "activate"} onClick={() => action("activate", "User reactivated.")} icon="person_check">Reactivate</ActionButton>
                )}
              </div>
            )}
            {isMe && <p className="mt-3 text-xs text-gray-500">Manage your own password and two-factor on your account page.</p>}
          </section>

          {events && (
            <section>
              <h3 className="text-sm font-semibold text-gray-900">Recent activity</h3>
              {events.length ? (
                <ul className="mt-3 divide-y divide-gray-100 rounded-lg border border-gray-200">
                  {events.map((e) => (
                    <li key={e.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                      <span className="text-gray-800">{e.action_label}{e.actor_label && e.actor_label !== user.username ? ` by ${e.actor_label}` : ""}</span>
                      <span className="shrink-0 text-xs text-gray-500">{formatWhen(e.created_at)}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-2 text-sm text-gray-500">Nothing yet.</p>
              )}
            </section>
          )}
        </div>
      </div>
    </div>
  );
}

function ActionButton({ children, onClick, icon, busy, danger }: {
  children: ReactNode;
  onClick: () => void;
  icon: string;
  busy?: boolean;
  danger?: boolean;
}) {
  return (
    <button type="button" onClick={onClick} disabled={busy}
      className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium transition disabled:opacity-50 ${
        danger ? "border-red-200 text-red-700 hover:bg-red-50" : "border-gray-300 text-gray-700 hover:bg-gray-50"
      }`}>
      <span aria-hidden="true" className={`material-symbols-outlined text-[17px] ${busy ? "animate-spin" : ""}`}>{busy ? "progress_activity" : icon}</span>
      {children}
    </button>
  );
}
