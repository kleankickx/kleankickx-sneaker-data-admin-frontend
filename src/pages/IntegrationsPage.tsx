import { useCallback, useEffect, useState } from "react";

import { field, Modal } from "../components/access/UserPanels";
import { OneTimeSecret } from "../components/access/SecretReveal";
import InfoTip from "../components/ui/InfoTip";
import { useConfirm } from "../components/ui/useConfirm";
import {
  deactivateIntegrationKey,
  issueIntegrationKey,
  listIntegrationKeys,
  type IntegrationKey,
} from "../lib/access-api";
import { readApiError } from "../lib/api-errors";
import { formatWhen } from "../lib/permissions";
import { toast } from "../lib/toast";

/** Settings → Integrations (manage_integrations): keys other systems use to send pairs. */
export default function IntegrationsPage() {
  const [keys, setKeys] = useState<IntegrationKey[] | null>(null);
  const [error, setError] = useState("");
  const [issuing, setIssuing] = useState(false);
  const [version, setVersion] = useState(0);
  const { confirm, dialog } = useConfirm();

  useEffect(() => {
    let live = true;
    listIntegrationKeys().then(
      (list) => {
        if (!live) return;
        setKeys(list);
        setError("");
      },
      (err) => live && setError(readApiError(err, "Couldn't load integration keys.").message),
    );
    return () => {
      live = false;
    };
  }, [version]);

  const refresh = useCallback(() => setVersion((v) => v + 1), []);

  async function deactivate(key: IntegrationKey) {
    const ok = await confirm({
      title: `Deactivate "${key.name}"?`,
      message: "Anything using this key stops sending pairs at once. This can't be undone; issue a new key to reconnect.",
      confirmLabel: "Deactivate",
      tone: "danger",
      icon: "key_off",
    });
    if (!ok) return;
    try {
      const updated = await deactivateIntegrationKey(key.id);
      setKeys((list) => list?.map((k) => (k.id === updated.id ? updated : k)) ?? list);
      toast.success(`${key.name} deactivated.`);
    } catch (err) {
      toast.error(readApiError(err, "Couldn't deactivate the key.").message);
    }
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-gray-900">Integrations</h1>
          <p className="mt-1 text-sm text-gray-500">
            Keys that let other systems, such as KleanKickx orders, send pairs to the platform.
          </p>
        </div>
        <button type="button" onClick={() => setIssuing(true)}
          className="inline-flex h-10 items-center gap-2 rounded-lg bg-gray-900 px-4 text-sm font-medium text-white hover:bg-gray-800">
          <span aria-hidden="true" className="material-symbols-outlined text-[18px]">add</span>
          Issue key
        </button>
      </div>

      <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
        {error && <p role="alert" className="border-b border-red-200 bg-red-50 px-5 py-3 text-sm text-red-700">{error}</p>}
        <div className="relative overflow-x-auto">
          <table className="w-full min-w-[760px]">
            <thead>
              <tr className="border-b border-gray-200 text-left text-[11px] font-semibold uppercase tracking-wider text-gray-400">
                <th className="px-5 py-3">Key</th>
                <th className="px-5 py-3">Status</th>
                <th className="px-5 py-3">
                  <span className="inline-flex items-center gap-1">
                    Last used
                    <InfoTip label="About last used" side="bottom">
                      When the key last sent pairs, to within a few minutes. A key that's never used, or not used for a
                      long time, may belong to something that's been switched off.
                    </InfoTip>
                  </span>
                </th>
                <th className="px-5 py-3">Pairs sent</th>
                <th className="px-5 py-3">Issued</th>
                <th className="px-5 py-3"><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 text-sm">
              {keys === null && !error && (
                <tr><td colSpan={6} className="px-5 py-10"><div className="h-6 animate-pulse rounded bg-gray-100" aria-label="Loading keys" /></td></tr>
              )}
              {keys?.length === 0 && (
                <tr><td colSpan={6} className="px-5 py-12 text-center text-sm text-gray-500">No integration keys yet.</td></tr>
              )}
              {keys?.map((k) => (
                <tr key={k.id} className={k.is_active ? "" : "opacity-60"}>
                  <td className="px-5 py-3">
                    <span className="block font-medium text-gray-900">{k.name}</span>
                    <span className="block font-mono text-xs text-gray-500">{k.key_id}</span>
                  </td>
                  <td className="px-5 py-3">
                    {k.is_active ? (
                      <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700 ring-1 ring-inset ring-emerald-600/20">Active</span>
                    ) : (
                      <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600 ring-1 ring-inset ring-gray-500/20">Deactivated</span>
                    )}
                  </td>
                  <td className="px-5 py-3 text-xs text-gray-500">{formatWhen(k.last_used_at)}</td>
                  <td className="px-5 py-3 text-xs text-gray-700">{k.pair_count?.toLocaleString() ?? "—"}</td>
                  <td className="px-5 py-3 text-xs text-gray-500">
                    {formatWhen(k.created_at)}
                    {k.created_by && <span className="block">by <span className="font-mono">{k.created_by}</span></span>}
                  </td>
                  <td className="px-5 py-3 text-right">
                    {k.is_active && (
                      <button type="button" onClick={() => deactivate(k)}
                        className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50">
                        Deactivate
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {issuing && <IssueKeyModal onClose={() => setIssuing(false)} onIssued={refresh} />}
      {dialog}
    </div>
  );
}

function IssueKeyModal({ onClose, onIssued }: { onClose: () => void; onIssued: () => void }) {
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [issued, setIssued] = useState<{ key: IntegrationKey; token: string } | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const result = await issueIntegrationKey(name);
      setIssued(result);
      onIssued();
    } catch (err) {
      const { message, fields } = readApiError(err, "Couldn't issue the key.");
      setError(fields.name ?? message);
    } finally {
      setBusy(false);
    }
  }

  if (issued) {
    return (
      <Modal title="Key issued" onClose={onClose}>
        <p className="text-sm text-gray-600">
          Set this token as <code className="rounded bg-gray-100 px-1 font-mono text-xs">SNEAKER_PLATFORM_API_KEY</code> on
          the server that uses <strong>{issued.key.name}</strong>, then restart it.
        </p>
        <div className="mt-4">
          <OneTimeSecret label="Integration token" value={issued.token}
            note="It won't be shown again. If it's lost, deactivate this key and issue a new one." />
        </div>
        <button type="button" onClick={onClose} className="mt-5 h-10 w-full rounded-lg bg-gray-900 text-sm font-medium text-white hover:bg-gray-800">
          Done
        </button>
      </Modal>
    );
  }

  return (
    <Modal title="Issue integration key" onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <div>
          <label htmlFor="key-name" className="mb-1 block text-sm font-medium text-gray-700">Name</label>
          <input id="key-name" required autoFocus value={name} onChange={(e) => setName(e.target.value)}
            placeholder="KleanKickx orders (production)" className={field} />
          <p className="mt-1 text-xs text-gray-500">Which system and environment will use it, so you can tell keys apart.</p>
          {error && <p className="mt-1 text-xs text-red-700">{error}</p>}
        </div>
        <button type="submit" disabled={busy}
          className="h-10 w-full rounded-lg bg-gray-900 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-60">
          {busy ? "Issuing…" : "Issue key"}
        </button>
      </form>
    </Modal>
  );
}
