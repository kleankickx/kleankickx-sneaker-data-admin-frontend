import { useEffect, useState } from "react";

import type { AuthUser } from "../../lib/api";
import { confirmMfaSetup, startMfaSetup, type MfaSetup } from "../../lib/access-api";
import { readApiError } from "../../lib/api-errors";
import { CodeInput } from "./CodeInput";
import { RecoveryCodes } from "./SecretReveal";

/**
 * Add an authenticator app: scan the QR code (or type the key), enter a
 * code, then save the recovery codes. With `mfaToken` this runs during
 * sign-in (a role requires two-factor).
 */
export default function MfaEnrollment({
  mfaToken,
  onDone,
  onCancel,
}: {
  mfaToken?: string;
  onDone: (user: AuthUser) => void;
  onCancel?: () => void;
}) {
  const [setup, setSetup] = useState<MfaSetup | null>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [showKey, setShowKey] = useState(false);
  const [result, setResult] = useState<{ codes: string[]; user: AuthUser } | null>(null);

  useEffect(() => {
    let live = true;
    startMfaSetup(mfaToken).then(
      (data) => live && setSetup(data),
      (err) => live && setError(readApiError(err, "Couldn't start two-factor set-up.").message),
    );
    return () => {
      live = false;
    };
  }, [mfaToken]);

  async function confirm(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const data = await confirmMfaSetup(code, mfaToken);
      setResult({ codes: data.recovery_codes, user: data.user });
    } catch (err) {
      setError(readApiError(err, "That code didn't work.").message);
      setCode("");
    } finally {
      setBusy(false);
    }
  }

  if (result) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2 text-sm font-medium text-emerald-700">
          <span aria-hidden="true" className="material-symbols-outlined text-[20px]">verified_user</span>
          Two-factor is on.
        </div>
        <RecoveryCodes codes={result.codes} />
        <button type="button" onClick={() => onDone(result.user)}
          className="h-11 w-full rounded-lg bg-gray-900 text-sm font-medium text-white hover:bg-gray-800">
          I've saved my codes, continue
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={confirm} className="space-y-4">
      <ol className="space-y-1 text-sm text-gray-600">
        <li>1. Open an authenticator app (Google Authenticator, Microsoft Authenticator, 1Password…).</li>
        <li>2. Scan this QR code, or enter the key.</li>
        <li>3. Type the 6-digit code it shows.</li>
      </ol>

      <div className="flex flex-col items-center gap-2 rounded-xl border border-gray-200 bg-white p-4">
        {setup ? (
          // As an image, nothing in the SVG can run as script
          <img
            src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(setup.qr_svg)}`}
            alt="QR code for your authenticator app"
            className="h-44 w-44"
          />
        ) : (
          <div className="h-44 w-44 animate-pulse rounded-lg bg-gray-100" aria-label="Loading QR code" />
        )}
        {setup && (
          <button type="button" onClick={() => setShowKey((v) => !v)} className="text-xs font-medium text-gray-600 underline underline-offset-2">
            {showKey ? "Hide the key" : "Can't scan? Show the key"}
          </button>
        )}
        {setup && showKey && (
          <code className="select-all break-all rounded bg-gray-100 px-2 py-1 font-mono text-xs tracking-wider text-gray-800">
            {setup.secret.replace(/(.{4})/g, "$1 ").trim()}
          </code>
        )}
      </div>

      <CodeInput value={code} onChange={setCode} label="6-digit code" autoFocus />

      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}

      <div className="flex gap-2">
        {onCancel && (
          <button type="button" onClick={onCancel}
            className="h-11 flex-1 rounded-lg border border-gray-300 bg-white text-sm font-medium text-gray-700 hover:bg-gray-50">
            Cancel
          </button>
        )}
        <button type="submit" disabled={busy || code.length !== 6 || !setup}
          className="h-11 flex-1 rounded-lg bg-gray-900 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50">
          {busy ? "Checking…" : "Turn on two-factor"}
        </button>
      </div>
    </form>
  );
}
