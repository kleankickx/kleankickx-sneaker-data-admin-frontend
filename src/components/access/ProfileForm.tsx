import { useState } from "react";

import type { AuthUser } from "../../lib/api";
import { updateMyProfile } from "../../lib/access-api";
import { readApiError } from "../../lib/api-errors";

type Field = "first_name" | "last_name" | "email" | "current_password";

const input =
  "h-10 w-full rounded-lg border border-gray-300 px-3 text-sm outline-none focus:border-gray-500 focus:ring-2 focus:ring-gray-200 disabled:bg-gray-50 disabled:text-gray-500";

/** Your own name and email. Changing the email asks for your password. */
export default function ProfileForm({ user, onSaved }: { user: AuthUser; onSaved: (user: AuthUser) => void }) {
  const [form, setForm] = useState({
    first_name: user.first_name ?? "",
    last_name: user.last_name ?? "",
    email: user.email ?? "",
  });
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<Partial<Record<Field | "form", string>>>({});
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);

  const emailChanged = form.email.trim().toLowerCase() !== (user.email ?? "").toLowerCase();
  const changed =
    form.first_name.trim() !== (user.first_name ?? "") ||
    form.last_name.trim() !== (user.last_name ?? "") ||
    emailChanged;

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setErrors({});
    setSaved(false);
    try {
      // Only what changed, so an untouched email is never re-checked.
      const input: Parameters<typeof updateMyProfile>[0] = {};
      if (form.first_name.trim() !== (user.first_name ?? "")) input.first_name = form.first_name.trim();
      if (form.last_name.trim() !== (user.last_name ?? "")) input.last_name = form.last_name.trim();
      if (emailChanged) {
        input.email = form.email.trim();
        input.current_password = password;
      }
      const next = await updateMyProfile(input);
      setPassword("");
      setSaved(true);
      onSaved(next);
    } catch (err) {
      const { message, fields } = readApiError<Field>(err, "Couldn't save your details.");
      setErrors({ ...fields, form: Object.keys(fields).length ? undefined : message });
    } finally {
      setBusy(false);
    }
  }

  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setSaved(false);
    setForm({ ...form, [key]: e.target.value });
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor="profile-first" className="mb-1 block text-sm font-medium text-gray-700">First name</label>
          <input id="profile-first" value={form.first_name} onChange={set("first_name")} autoComplete="given-name" className={input} />
          {errors.first_name && <p className="mt-1 text-xs text-red-700">{errors.first_name}</p>}
        </div>
        <div>
          <label htmlFor="profile-last" className="mb-1 block text-sm font-medium text-gray-700">Last name</label>
          <input id="profile-last" value={form.last_name} onChange={set("last_name")} autoComplete="family-name" className={input} />
          {errors.last_name && <p className="mt-1 text-xs text-red-700">{errors.last_name}</p>}
        </div>
      </div>

      <div>
        <label htmlFor="profile-username" className="mb-1 block text-sm font-medium text-gray-700">Username</label>
        <input id="profile-username" value={user.username ?? ""} disabled className={`${input} font-mono`} aria-describedby="username-hint" />
        <p id="username-hint" className="mt-1 text-xs text-gray-500">You sign in with this. Ask an administrator to change it.</p>
      </div>

      <div>
        <label htmlFor="profile-email" className="mb-1 block text-sm font-medium text-gray-700">Email</label>
        <input id="profile-email" type="email" value={form.email} onChange={set("email")} autoComplete="email" className={input} />
        {errors.email && <p className="mt-1 text-xs text-red-700">{errors.email}</p>}
      </div>

      {emailChanged && (
        <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
          <label htmlFor="profile-password" className="mb-1 block text-sm font-medium text-gray-700">
            Current password
          </label>
          <input id="profile-password" type="password" required autoComplete="current-password" value={password}
            onChange={(e) => setPassword(e.target.value)} className={`${input} bg-white`} />
          <p className="mt-1 text-xs text-gray-500">To protect your account, confirm it's you before changing your email.</p>
          {errors.current_password && <p className="mt-1 text-xs text-red-700">{errors.current_password}</p>}
        </div>
      )}

      {errors.form && <p role="alert" className="text-sm text-red-700">{errors.form}</p>}

      <div className="flex items-center gap-3">
        <button type="submit" disabled={busy || !changed || (emailChanged && !password)}
          className="h-10 rounded-lg bg-gray-900 px-4 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-40">
          {busy ? "Saving…" : "Save details"}
        </button>
        {saved && <span role="status" className="text-sm text-emerald-700">Saved.</span>}
      </div>
    </form>
  );
}
