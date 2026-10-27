import { useState } from "react";

import type { AuthUser } from "../../lib/api";
import { changePassword } from "../../lib/access-api";
import { readApiError } from "../../lib/api-errors";
import { MIN_PASSWORD_LENGTH } from "../../lib/password";
import PasswordStrength from "./PasswordStrength";

/** Change your own password (current + new + confirm). */
export default function PasswordForm({
  currentLabel = "Current password",
  submitLabel = "Change password",
  onChanged,
}: {
  currentLabel?: string;
  submitLabel?: string;
  onChanged: (user: AuthUser) => void;
}) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (next !== confirm) {
      setErrors({ confirm: "The passwords don't match." });
      return;
    }
    setBusy(true);
    setErrors({});
    try {
      onChanged(await changePassword(current, next));
      setCurrent("");
      setNext("");
      setConfirm("");
    } catch (err) {
      const { message, fields } = readApiError<"current_password" | "new_password">(err, "Couldn't change the password.");
      setErrors({ form: fields.current_password || fields.new_password ? "" : message, ...fields });
    } finally {
      setBusy(false);
    }
  }

  const field = "h-11 w-full rounded-lg border border-gray-300 px-3 text-sm outline-none focus:border-gray-500 focus:ring-2 focus:ring-gray-200";

  return (
    <form onSubmit={submit} className="space-y-4">
      <div>
        <label htmlFor="current-password" className="mb-1.5 block text-sm font-medium text-gray-700">{currentLabel}</label>
        <input id="current-password" type="password" autoComplete="current-password" required value={current}
          onChange={(e) => setCurrent(e.target.value)} className={field} />
        {errors.current_password && <p className="mt-1 text-xs text-red-700">{errors.current_password}</p>}
      </div>
      <div>
        <label htmlFor="new-password" className="mb-1.5 block text-sm font-medium text-gray-700">New password</label>
        <input id="new-password" type="password" autoComplete="new-password" required value={next}
          onChange={(e) => setNext(e.target.value)} className={field} aria-describedby="password-hint" />
        <PasswordStrength password={next} hintId="password-hint" />
        {errors.new_password && <p className="mt-1 text-xs text-red-700">{errors.new_password}</p>}
      </div>
      <div>
        <label htmlFor="confirm-password" className="mb-1.5 block text-sm font-medium text-gray-700">Confirm new password</label>
        <input id="confirm-password" type="password" autoComplete="new-password" required value={confirm}
          onChange={(e) => setConfirm(e.target.value)} className={field} />
        {errors.confirm && <p className="mt-1 text-xs text-red-700">{errors.confirm}</p>}
      </div>
      {errors.form && <p role="alert" className="text-sm text-red-700">{errors.form}</p>}
      <button type="submit" disabled={busy || !current || next.length < MIN_PASSWORD_LENGTH || !confirm}
        className="h-11 w-full rounded-lg bg-gray-900 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50">
        {busy ? "Saving…" : submitLabel}
      </button>
    </form>
  );
}
