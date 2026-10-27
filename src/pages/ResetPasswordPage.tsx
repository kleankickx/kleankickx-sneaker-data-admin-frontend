import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";

import AuthShell from "../components/access/AuthShell";
import PasswordStrength from "../components/access/PasswordStrength";
import { confirmPasswordReset } from "../lib/access-api";
import { readApiError } from "../lib/api-errors";
import { MIN_PASSWORD_LENGTH } from "../lib/password";

/** Choose a new password from an emailed link (?uid=...&token=...). */
export default function ResetPasswordPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const uid = params.get("uid") ?? "";
  const token = params.get("token") ?? "";
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<{ form?: string; new_password?: string; confirm?: string }>({});
  const [linkDead, setLinkDead] = useState(!uid || !token);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (password !== confirm) {
      setErrors({ confirm: "The passwords don't match." });
      return;
    }
    setBusy(true);
    setErrors({});
    try {
      const username = await confirmPasswordReset(uid, token, password);
      navigate("/login?reason=password_reset", { replace: true, state: { username } });
    } catch (err) {
      const { message, code, fields } = readApiError<"new_password">(err, "Couldn't change the password.");
      if (code === "reset_link_invalid") setLinkDead(true);
      else setErrors(fields.new_password ? { new_password: fields.new_password } : { form: message });
      setBusy(false);
    }
  }

  if (linkDead) {
    return (
      <AuthShell icon="link_off" title="This link doesn't work" subtitle="It's invalid, already used, or expired.">
        <p className="text-sm text-gray-700">Reset links work once, for an hour. Ask for a new one.</p>
        <Link to="/forgot-password"
          className="mt-5 inline-flex h-11 w-full items-center justify-center rounded-lg bg-gray-900 px-4 text-sm font-medium text-white hover:bg-gray-800">
          Email me a new link
        </Link>
      </AuthShell>
    );
  }

  const field = "h-11 w-full rounded-lg border border-gray-300 px-3 text-sm outline-none focus:border-gray-500 focus:ring-2 focus:ring-gray-200";

  return (
    <AuthShell icon="lock_reset" title="Choose a new password" subtitle="You'll be signed out everywhere else.">
      <form onSubmit={submit} className="space-y-4">
        {errors.form && <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3.5 text-sm text-red-700">{errors.form}</div>}
        <div>
          <label htmlFor="new-password" className="mb-1.5 block text-sm font-medium text-gray-700">New password</label>
          <div className="relative">
            <input id="new-password" type={show ? "text" : "password"} autoComplete="new-password" required autoFocus
              value={password} onChange={(e) => setPassword(e.target.value)} className={`${field} pr-11`}
              aria-describedby="reset-password-hint" />
            <button type="button" onClick={() => setShow((v) => !v)} aria-label={show ? "Hide password" : "Show password"}
              className="absolute right-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-md text-gray-400 hover:bg-gray-100 hover:text-gray-700">
              <span aria-hidden="true" className="material-symbols-outlined text-[20px]">{show ? "visibility_off" : "visibility"}</span>
            </button>
          </div>
          <PasswordStrength password={password} hintId="reset-password-hint" />
          {errors.new_password && <p className="mt-1 text-xs text-red-700">{errors.new_password}</p>}
        </div>
        <div>
          <label htmlFor="confirm-password" className="mb-1.5 block text-sm font-medium text-gray-700">Confirm new password</label>
          <input id="confirm-password" type={show ? "text" : "password"} autoComplete="new-password" required
            value={confirm} onChange={(e) => setConfirm(e.target.value)} className={field} />
          {errors.confirm && <p className="mt-1 text-xs text-red-700">{errors.confirm}</p>}
        </div>
        <button type="submit" disabled={busy || password.length < MIN_PASSWORD_LENGTH || !confirm}
          className="h-11 w-full rounded-lg bg-gray-900 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50">
          {busy ? "Saving…" : "Set new password"}
        </button>
      </form>
    </AuthShell>
  );
}
