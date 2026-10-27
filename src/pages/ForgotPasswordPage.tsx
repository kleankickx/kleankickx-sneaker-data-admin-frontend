import { useState } from "react";
import { useLocation } from "react-router-dom";

import AuthShell from "../components/access/AuthShell";
import { requestPasswordReset } from "../lib/access-api";
import { readApiError } from "../lib/api-errors";

/** "Forgot password": ask for a reset link by email. */
export default function ForgotPasswordPage() {
  const location = useLocation();
  const [identifier, setIdentifier] = useState(
    () => ((location.state as { username?: string } | null)?.username ?? ""),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  /* After asking: whether the server could send the email. */
  const [sent, setSent] = useState<null | { emailEnabled: boolean }>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      setSent(await requestPasswordReset(identifier.trim()));
    } catch (err) {
      setError(readApiError(err, "Couldn't send the reset email. Try again in a moment.").message);
    } finally {
      setBusy(false);
    }
  }

  if (sent?.emailEnabled === false) {
    return (
      <AuthShell icon="support_agent" title="Ask an administrator" subtitle="Password reset by email isn't set up yet.">
        <p className="text-sm text-gray-700">
          An administrator can reset your password from <strong>Settings → Users</strong>. You'll get a temporary
          password and choose your own when you next sign in.
        </p>
      </AuthShell>
    );
  }

  if (sent) {
    return (
      <AuthShell icon="mark_email_read" title="Check your email">
        <div role="status" className="space-y-3 text-sm text-gray-700">
          <p>
            If <strong>{identifier.trim()}</strong> matches an account with an email address, we've sent it a link to
            choose a new password.
          </p>
          <p className="text-gray-500">
            The link works once, for an hour. Nothing there? Check your spam folder, or ask an administrator: not every
            account has an email address.
          </p>
        </div>
        <button type="button" onClick={() => setSent(null)}
          className="mt-5 text-sm font-medium text-gray-700 underline underline-offset-2 hover:text-gray-900">
          Try a different username or email
        </button>
      </AuthShell>
    );
  }

  return (
    <AuthShell icon="lock_reset" title="Forgot your password?" subtitle="We'll email you a link to choose a new one.">
      <form onSubmit={submit} className="space-y-5">
        {error && (
          <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3.5 text-sm text-red-700">{error}</div>
        )}
        <div>
          <label htmlFor="identifier" className="mb-1.5 block text-sm font-medium text-gray-700">Username or email</label>
          <input id="identifier" type="text" autoComplete="username" autoCapitalize="none" autoCorrect="off"
            spellCheck={false} required autoFocus value={identifier} onChange={(e) => setIdentifier(e.target.value)}
            className="h-11 w-full rounded-lg border border-gray-300 px-3 text-sm outline-none placeholder:text-gray-400 focus:border-gray-500 focus:ring-2 focus:ring-gray-200" />
        </div>
        <button type="submit" disabled={busy || !identifier.trim()}
          className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-gray-900 px-4 text-sm font-medium text-white transition hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-60">
          {busy ? "Sending…" : "Email me a reset link"}
        </button>
      </form>
    </AuthShell>
  );
}
