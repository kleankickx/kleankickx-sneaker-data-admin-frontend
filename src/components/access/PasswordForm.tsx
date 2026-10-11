import { useState } from "react";

import type { AuthUser } from "../../lib/api";
import { changePassword } from "../../lib/access-api";
import { readApiError } from "../../lib/api-errors";

const MIN_LENGTH = 10;

function strength(password: string) {
  let score = 0;
  if (password.length >= MIN_LENGTH) score += 1;
  if (password.length >= 14) score += 1;
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score += 1;
  if (/\d/.test(password)) score += 1;
  if (/[^A-Za-z0-9]/.test(password)) score += 1;
  return score;
}

const LEVELS = [
  { label: "Too short", bar: "bg-red-500" },
  { label: "Weak", bar: "bg-red-500" },
  { label: "Fair", bar: "bg-amber-500" },
  { label: "Good", bar: "bg-amber-400" },
  { label: "Strong", bar: "bg-emerald-500" },
  { label: "Very strong", bar: "bg-emerald-600" },
];

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
  const score = next ? (next.length < MIN_LENGTH ? 0 : strength(next)) : -1;

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
        {score >= 0 && (
          <div className="mt-2 flex items-center gap-2" aria-live="polite">
            <div className="flex flex-1 gap-1">
              {[0, 1, 2, 3, 4].map((i) => (
                <span key={i} className={`h-1 flex-1 rounded-full ${i < Math.max(score, 1) ? LEVELS[score].bar : "bg-gray-200"}`} />
              ))}
            </div>
            <span className="w-20 text-right text-xs text-gray-500">{LEVELS[score].label}</span>
          </div>
        )}
        <p id="password-hint" className="mt-1 text-xs text-gray-500">
          At least {MIN_LENGTH} characters. A few unrelated words make a strong, memorable password.
        </p>
        {errors.new_password && <p className="mt-1 text-xs text-red-700">{errors.new_password}</p>}
      </div>
      <div>
        <label htmlFor="confirm-password" className="mb-1.5 block text-sm font-medium text-gray-700">Confirm new password</label>
        <input id="confirm-password" type="password" autoComplete="new-password" required value={confirm}
          onChange={(e) => setConfirm(e.target.value)} className={field} />
        {errors.confirm && <p className="mt-1 text-xs text-red-700">{errors.confirm}</p>}
      </div>
      {errors.form && <p role="alert" className="text-sm text-red-700">{errors.form}</p>}
      <button type="submit" disabled={busy || !current || next.length < MIN_LENGTH || !confirm}
        className="h-11 w-full rounded-lg bg-gray-900 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50">
        {busy ? "Saving…" : submitLabel}
      </button>
    </form>
  );
}
