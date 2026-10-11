import { useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";

import { CodeInput } from "../components/access/CodeInput";
import MfaEnrollment from "../components/access/MfaEnrollment";
import PasswordForm from "../components/access/PasswordForm";
import ProfileForm from "../components/access/ProfileForm";
import { RecoveryCodes } from "../components/access/SecretReveal";
import {
  disableMfa,
  regenerateRecoveryCodes,
  signOutEverywhere,
  type Permission,
} from "../lib/access-api";
import { readApiError } from "../lib/api-errors";
import { useAuth } from "../lib/auth-context";
import { PERMISSION_LABELS } from "../lib/permissions";

function Section({ title, description, children }: { title: string; description: string; children: ReactNode }) {
  return (
    <section className="grid gap-6 border-t border-gray-200 py-8 first:border-t-0 first:pt-0 lg:grid-cols-[280px_minmax(0,1fr)]">
      <div>
        <h2 className="text-base font-semibold text-gray-900">{title}</h2>
        <p className="mt-1 text-sm text-gray-500">{description}</p>
      </div>
      <div className="max-w-xl">{children}</div>
    </section>
  );
}

/** The signed-in user's own account and security. */
export default function AccountPage() {
  const { user, setUser, logout } = useAuth();
  const navigate = useNavigate();
  const [notice, setNotice] = useState("");
  const [mode, setMode] = useState<"idle" | "enrol" | "disable" | "codes">("idle");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [newCodes, setNewCodes] = useState<string[] | null>(null);

  if (!user) return null;
  const permissions = (user.is_superuser ? Object.keys(PERMISSION_LABELS) : user.permissions ?? []) as Permission[];

  function reset() {
    setMode("idle");
    setPassword("");
    setCode("");
    setError("");
  }

  async function turnOff(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      setUser(await disableMfa(password, code));
      reset();
      setNotice("Two-factor is off.");
    } catch (err) {
      setError(readApiError(err, "Couldn't turn two-factor off.").message);
    } finally {
      setBusy(false);
    }
  }

  async function newRecoveryCodes(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      setNewCodes(await regenerateRecoveryCodes(code));
      reset();
    } catch (err) {
      setError(readApiError(err, "Couldn't make new codes.").message);
    } finally {
      setBusy(false);
    }
  }

  async function everywhere() {
    if (!window.confirm("Sign out on every device, including this one?")) return;
    try {
      await signOutEverywhere();
    } finally {
      await logout().catch(() => {});
      navigate("/login", { replace: true });
    }
  }

  return (
    <div className="mx-auto max-w-5xl">
      <h1 className="text-2xl font-semibold tracking-tight text-gray-900">Account &amp; security</h1>
      <p className="mt-1 text-sm text-gray-500">Your details, password and sign-in protection.</p>

      {notice && (
        <p role="status" className="mt-6 rounded-lg bg-gray-900 px-4 py-2 text-sm text-white">{notice}</p>
      )}

      <div className="mt-8 rounded-2xl border border-gray-200 bg-white p-6 shadow-sm sm:p-8">
        <Section title="Profile" description="Your name and email. An administrator changes your username and roles.">
          <ProfileForm user={user} onSaved={setUser} />
          <dl className="mt-6 grid grid-cols-[120px_minmax(0,1fr)] gap-y-2 border-t border-gray-100 pt-5 text-sm">
            <dt className="text-gray-500">Roles</dt>
            <dd className="flex flex-wrap gap-1.5">
              {user.is_superuser && <span className="rounded-full bg-gray-900 px-2.5 py-0.5 text-xs font-medium text-white">Superuser</span>}
              {(user.roles ?? []).map((r) => (
                <span key={r} className="rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-700">{r}</span>
              ))}
              {!user.is_superuser && !(user.roles ?? []).length && <span className="text-gray-500">No role yet</span>}
            </dd>
          </dl>
          <details className="mt-4">
            <summary className="cursor-pointer text-sm font-medium text-gray-700">What you can do ({permissions.length})</summary>
            <ul className="mt-2 space-y-1 text-sm text-gray-600">
              {permissions.map((p) => (
                <li key={p} className="flex items-center gap-2">
                  <span aria-hidden="true" className="material-symbols-outlined text-[16px] text-emerald-600">check</span>
                  {PERMISSION_LABELS[p] ?? p}
                </li>
              ))}
            </ul>
          </details>
        </Section>

        <Section title="Password" description="Changing it signs you out on your other devices.">
          <PasswordForm onChanged={(u) => { setUser(u); setNotice("Password changed."); }} />
        </Section>

        <Section
          title="Two-factor sign-in"
          description="A code from an authenticator app on your phone, on top of your password."
        >
          <div className="flex items-center gap-2">
            <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset ${
              user.mfa_enabled ? "bg-emerald-50 text-emerald-700 ring-emerald-600/20" : "bg-gray-100 text-gray-700 ring-gray-500/20"
            }`}>
              <span aria-hidden="true" className="material-symbols-outlined text-[14px]">{user.mfa_enabled ? "verified_user" : "shield"}</span>
              {user.mfa_enabled ? "On" : "Off"}
            </span>
            {user.mfa_required && <span className="text-xs text-gray-500">Required by your role</span>}
          </div>

          {newCodes && <div className="mt-4"><RecoveryCodes codes={newCodes} /></div>}

          {!user.mfa_enabled && mode !== "enrol" && (
            <button type="button" onClick={() => setMode("enrol")}
              className="mt-4 rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800">
              Set up two-factor
            </button>
          )}
          {!user.mfa_enabled && mode === "enrol" && (
            <div className="mt-4">
              <MfaEnrollment onCancel={reset} onDone={(u) => { setUser(u); reset(); setNotice("Two-factor is on."); }} />
            </div>
          )}

          {user.mfa_enabled && mode === "idle" && (
            <div className="mt-4 flex flex-wrap gap-2">
              <button type="button" onClick={() => { setNewCodes(null); setMode("codes"); }}
                className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
                New recovery codes
              </button>
              <button type="button" disabled={user.mfa_required} onClick={() => setMode("disable")}
                title={user.mfa_required ? "Your role requires two-factor" : undefined}
                className="rounded-lg border border-red-200 bg-white px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50">
                Turn off
              </button>
            </div>
          )}

          {user.mfa_enabled && mode === "codes" && (
            <form onSubmit={newRecoveryCodes} className="mt-4 space-y-3">
              <p className="text-sm text-gray-600">Your old recovery codes will stop working.</p>
              <CodeInput value={code} onChange={setCode} label="Code from your authenticator app" autoFocus />
              {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
              <div className="flex gap-2">
                <button type="button" onClick={reset} className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700">Cancel</button>
                <button type="submit" disabled={busy || code.length !== 6} className="rounded-lg bg-gray-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-50">
                  Make new codes
                </button>
              </div>
            </form>
          )}

          {user.mfa_enabled && mode === "disable" && (
            <form onSubmit={turnOff} className="mt-4 space-y-3">
              <div>
                <label htmlFor="mfa-password" className="mb-1.5 block text-sm font-medium text-gray-700">Password</label>
                <input id="mfa-password" type="password" autoComplete="current-password" value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="h-11 w-full rounded-lg border border-gray-300 px-3 text-sm outline-none focus:border-gray-500 focus:ring-2 focus:ring-gray-200" />
              </div>
              <CodeInput value={code} onChange={setCode} label="Code from your authenticator app" />
              {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
              <div className="flex gap-2">
                <button type="button" onClick={reset} className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700">Cancel</button>
                <button type="submit" disabled={busy || !password || code.length !== 6} className="rounded-lg bg-red-600 px-3 py-2 text-sm font-medium text-white disabled:opacity-50">
                  Turn off two-factor
                </button>
              </div>
            </form>
          )}
        </Section>

        <Section title="Sessions" description="Lost a device or signed in somewhere shared? End every session.">
          <button type="button" onClick={everywhere}
            className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
            Sign out everywhere
          </button>
        </Section>
      </div>
    </div>
  );
}
