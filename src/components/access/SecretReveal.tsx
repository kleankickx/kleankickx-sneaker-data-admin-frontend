import { useState } from "react";

async function copy(text: string) {
  try {
    await navigator.clipboard?.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/** A value shown once (a temporary password), with a copy button. */
export function OneTimeSecret({ label, value, note }: { label: string; value: string; note: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-amber-800">{label}</p>
      <div className="mt-2 flex items-center gap-2">
        <code data-testid="one-time-secret" className="flex-1 select-all rounded-lg bg-white px-3 py-2 font-mono text-base tracking-wider text-gray-900 ring-1 ring-amber-200">
          {value}
        </code>
        <button
          type="button"
          onClick={() => copy(value).then(setCopied)}
          className="inline-flex h-10 items-center gap-1.5 rounded-lg bg-gray-900 px-3 text-sm font-medium text-white hover:bg-gray-800"
        >
          <span aria-hidden="true" className="material-symbols-outlined text-[18px]">{copied ? "check" : "content_copy"}</span>
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <p className="mt-2 text-xs leading-5 text-amber-800">{note}</p>
    </div>
  );
}

/** Two-factor recovery codes: shown once, copy or download. */
export function RecoveryCodes({ codes }: { codes: string[] }) {
  const [copied, setCopied] = useState(false);

  function download() {
    const blob = new Blob(
      [`KleanKickx Data recovery codes\nEach code works once.\n\n${codes.join("\n")}\n`],
      { type: "text/plain" },
    );
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "kleankickx-recovery-codes.txt";
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
      <p className="text-sm font-semibold text-gray-900">Save your recovery codes</p>
      <p className="mt-1 text-xs leading-5 text-gray-600">
        If you lose your phone, each code signs you in once. Keep them somewhere safe; they won't be shown again.
      </p>
      <ol data-testid="recovery-codes" className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5 font-mono text-sm text-gray-900">
        {codes.map((code) => (
          <li key={code}>{code}</li>
        ))}
      </ol>
      <div className="mt-3 flex gap-2">
        <button type="button" onClick={() => copy(codes.join("\n")).then(setCopied)}
          className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50">
          {copied ? "Copied" : "Copy"}
        </button>
        <button type="button" onClick={download}
          className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50">
          Download
        </button>
      </div>
    </div>
  );
}
