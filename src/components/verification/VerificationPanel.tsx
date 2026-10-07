import { useState, type FormEvent } from "react";

import {
  completeVerification,
  identifySneaker,
  startIdentification,
  updateSneaker,
  type SneakerPairEdit,
  type SneakerVerificationPayload,
} from "../../lib/api";
import { readApiError, type ApiFormError } from "../../lib/api-errors";
import { METADATA_MAX_LENGTH } from "../../lib/bulk-review";
import { CONDITION_OPTIONS, DEFAULT_CONDITION } from "../../lib/conditions";
import type { SneakerIdentification, SneakerPair } from "../../lib/types";

type Field = keyof SneakerVerificationPayload;
type TextField = Exclude<Field, "condition">;
type Values = SneakerVerificationPayload;

const TEXT_FIELDS: Array<{ field: TextField; label: string }> = [
  { field: "brand", label: "Brand" },
  { field: "model", label: "Model" },
  { field: "sku", label: "SKU" },
  { field: "size", label: "Size" },
];

const INPUT_CLASS =
  "h-11 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm outline-none focus:border-gray-500 focus:ring-2 focus:ring-gray-200 disabled:cursor-not-allowed disabled:bg-gray-50 disabled:text-gray-700";

function savedValues(pair: SneakerPair): Values {
  return {
    brand: pair.brand ?? "",
    model: pair.model ?? "",
    sku: pair.sku ?? "",
    size: pair.size ?? "",
    condition: pair.condition || DEFAULT_CONDITION,
  };
}

function normalise(values: Values): Values {
  return {
    brand: values.brand.trim(),
    model: values.model.trim(),
    sku: values.sku.trim(),
    size: values.size.trim(),
    condition: values.condition,
  };
}

/*
 * The backend's workflow before verification. Each step is its own
 * endpoint; the panel offers whichever one the pair is at.
 */
const STEPS = {
  received: {
    step: "Step 1 of 3",
    action: "Start identification",
    busy: "Starting…",
    text: "Moves the pair into identification so its details can be confirmed.",
    done: "Identification started.",
  },
  identification: {
    step: "Step 2 of 3",
    action: "Confirm identification",
    busy: "Confirming…",
    text: "Records the brand, model, SKU and size above as the identification and moves the pair to verification.",
    done: "Identification confirmed. Ready for verification.",
  },
} as const;

type Step = keyof typeof STEPS;

function same(a: string, b: string) {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

/** One verified value, with the AI suggestion and saved value beside it. */
function VerificationField({
  field,
  label,
  value,
  saved,
  suggestion,
  error,
  disabled,
  onChange,
}: {
  field: TextField;
  label: string;
  value: string;
  saved: string;
  suggestion: string | undefined;
  error: string | undefined;
  disabled: boolean;
  onChange: (value: string) => void;
}) {
  const id = `verify-${field}`;
  const changed = value.trim() !== saved;

  return (
    <div>
      <label
        htmlFor={id}
        className="mb-1.5 block text-sm font-medium text-gray-700"
      >
        {label}
      </label>
      <input
        id={id}
        type="text"
        value={value}
        maxLength={METADATA_MAX_LENGTH[field]}
        disabled={disabled}
        placeholder="Not recorded"
        onChange={(event) => onChange(event.target.value)}
        aria-invalid={Boolean(error)}
        className={INPUT_CLASS}
      />

      {error && <p className="mt-1 text-xs text-red-700">{error}</p>}

      {!disabled && suggestion && (
        <div className="mt-1.5 flex min-w-0 items-center gap-1.5 text-xs">
          <span aria-hidden="true" className="material-symbols-outlined text-[14px] text-gray-400">
            auto_awesome
          </span>
          <span className="shrink-0 text-gray-500">AI suggests</span>
          <span className="truncate font-medium text-gray-700">
            {suggestion}
          </span>
          {same(suggestion, value) ? (
            <span className="shrink-0 text-emerald-700">· matches</span>
          ) : (
            <button
              type="button"
              onClick={() => onChange(suggestion)}
              className="shrink-0 font-medium text-gray-700 underline underline-offset-2 hover:text-gray-900"
            >
              Use
            </button>
          )}
        </div>
      )}

      {!disabled && changed && (
        <div className="mt-1 flex min-w-0 items-center gap-1.5 text-xs text-gray-500">
          <span className="shrink-0">Saved value</span>
          <span className="truncate font-medium text-gray-700">
            {saved || "empty"}
          </span>
          <button
            type="button"
            onClick={() => onChange(saved)}
            className="shrink-0 font-medium text-gray-700 underline underline-offset-2 hover:text-gray-900"
          >
            Undo
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * The verifier's decision: correct the pair's values, save them, move
 * the pair through identification, and mark it verified. AI suggestions sit beside each value but are
 * never applied unless the verifier chooses to.
 *
 * Render with key={pair.updated_at} so it resets when the pair changes.
 */
export default function VerificationPanel({
  pair,
  suggestion,
  blockers,
  checkingEligibility,
  onSaved,
  onAdvanced,
  onVerified,
}: {
  pair: SneakerPair;
  suggestion: SneakerIdentification | null;
  /* Why the pair can't be verified yet; empty when it can. */
  blockers: string[];
  checkingEligibility: boolean;
  onSaved: (pair: SneakerPair) => void;
  /* The pair moved to the next workflow step. */
  onAdvanced: (pair: SneakerPair, message: string) => void;
  onVerified: (pair: SneakerPair) => void;
}) {
  const [saved] = useState(() => savedValues(pair));
  const [values, setValues] = useState(saved);
  const [busy, setBusy] = useState<"save" | "advance" | "verify" | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<ApiFormError<Field> | null>(null);

  const status = pair.status.toLowerCase();
  const isVerified = status === "verified";
  const step = status in STEPS ? STEPS[status as Step] : null;
  const clean = normalise(values);
  const changes = (Object.keys(clean) as Field[]).reduce<SneakerPairEdit>(
    (diff, field) =>
      clean[field] !== saved[field] ? { ...diff, [field]: clean[field] } : diff,
    {},
  );
  const dirty = Object.keys(changes).length > 0;
  const canVerify = !isVerified && blockers.length === 0 && !checkingEligibility;

  function set(field: Field, value: string) {
    setValues((current) => ({ ...current, [field]: value }));
    setConfirming(false);
  }

  async function run(
    kind: "save" | "advance" | "verify",
    request: () => Promise<SneakerPair>,
    done: (pair: SneakerPair) => void,
  ) {
    if (busy) return;

    setBusy(kind);
    setError(null);
    try {
      done(await request());
    } catch (err) {
      setError(
        readApiError<Field>(
          err,
          {
            save: "Could not save changes. Please try again.",
            advance: "Could not update this pair. Please try again.",
            verify: "Could not verify this pair. Please try again.",
          }[kind],
        ),
      );
      setConfirming(false);
      setBusy(null);
    }
  }

  function handleSave(event: FormEvent) {
    event.preventDefault();
    if (!dirty) return;
    run("save", () => updateSneaker(pair.id, changes), onSaved);
  }

  function handleAdvance() {
    if (!step) return;

    run(
      "advance",
      async () => {
        // The step endpoints don't store the pair's own values, so
        // unsaved edits go through the normal update first.
        if (dirty) await updateSneaker(pair.id, changes);

        if (status === "received") return startIdentification(pair.id);

        const { brand, model, sku, size } = clean;
        return identifySneaker(pair.id, { brand, model, sku, size });
      },
      (updated) => onAdvanced(updated, step.done),
    );
  }

  function handleVerify() {
    if (!canVerify) return;
    run("verify", () => completeVerification(pair.id, clean), onVerified);
  }

  return (
    <section className="rounded-2xl border border-gray-200 bg-white shadow-sm">
      <div className="flex items-center justify-between gap-3 border-b border-gray-100 px-5 py-4 sm:px-6">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gray-50">
            <span aria-hidden="true" className="material-symbols-outlined text-[18px] text-gray-600">
              fact_check
            </span>
          </div>
          <div>
            <h2 className="text-base font-semibold text-gray-900">
              Verified data
            </h2>
            <p className="text-xs text-gray-500">
              {isVerified
                ? "These values are the verified record."
                : "Your decision. AI suggestions are only applied if you use them."}
            </p>
          </div>
        </div>
        {dirty && !isVerified && (
          <span className="inline-flex shrink-0 items-center rounded-full bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-700 ring-1 ring-inset ring-amber-600/10">
            Unsaved
          </span>
        )}
      </div>

      <form onSubmit={handleSave}>
        <div className="grid gap-4 px-5 py-5 sm:grid-cols-2 sm:px-6">
          {TEXT_FIELDS.map(({ field, label }) => (
            <VerificationField
              key={field}
              field={field}
              label={label}
              value={values[field]}
              saved={saved[field]}
              suggestion={suggestion?.[field] || undefined}
              error={error?.fields[field]}
              disabled={isVerified || busy !== null}
              onChange={(value) => set(field, value)}
            />
          ))}

          <div className="sm:col-span-2">
            <label
              htmlFor="verify-condition"
              className="mb-1.5 block text-sm font-medium text-gray-700"
            >
              Condition
            </label>
            <select
              id="verify-condition"
              value={values.condition}
              disabled={isVerified || busy !== null}
              onChange={(event) => set("condition", event.target.value)}
              className={INPUT_CLASS}
            >
              {CONDITION_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            {error?.fields.condition && (
              <p className="mt-1 text-xs text-red-700">
                {error.fields.condition}
              </p>
            )}
          </div>

          {error && Object.keys(error.fields).length === 0 && (
            <p
              role="alert"
              className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 sm:col-span-2"
            >
              {error.message}
            </p>
          )}
        </div>

        {isVerified ? (
          <div className="flex items-center gap-2 border-t border-gray-100 px-5 py-4 text-sm text-emerald-700 sm:px-6">
            <span aria-hidden="true" className="material-symbols-outlined text-[18px]">
              verified
            </span>
            This pair has been verified.
          </div>
        ) : (
          <div className="space-y-3 border-t border-gray-100 px-5 py-4 sm:px-6">
            {step && (
              <p className="text-xs text-gray-500">
                <span className="font-medium text-gray-700">
                  {step.step} · {step.action}.
                </span>{" "}
                {step.text}
              </p>
            )}

            {!step && !checkingEligibility && blockers.length > 0 && (
              <div className="rounded-lg bg-gray-50 px-3 py-2.5">
                <p className="text-xs font-medium text-gray-700">
                  Can't be marked verified yet:
                </p>
                <ul className="mt-1 list-disc space-y-0.5 pl-4 text-xs text-gray-600">
                  {blockers.map((reason) => (
                    <li key={reason}>{reason}</li>
                  ))}
                </ul>
              </div>
            )}

            {confirming ? (
              <div className="rounded-xl border border-gray-200 p-4">
                <p className="text-sm font-medium text-gray-900">
                  Mark this pair as verified?
                </p>
                <p className="mt-1 text-sm text-gray-500">
                  The values above
                  {dirty ? ", including your unsaved changes," : ""} become
                  the verified record, and the photos are locked.
                </p>
                <div className="mt-3 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                  <button
                    type="button"
                    onClick={() => setConfirming(false)}
                    disabled={busy !== null}
                    className="rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 transition hover:bg-gray-50 disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleVerify}
                    disabled={busy !== null}
                    className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {busy === "verify" && (
                      <span aria-hidden="true" className="material-symbols-outlined animate-spin text-[18px]">
                        progress_activity
                      </span>
                    )}
                    {busy === "verify" ? "Verifying…" : "Confirm verification"}
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
                <button
                  type="submit"
                  disabled={!dirty || busy !== null}
                  className="inline-flex items-center justify-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {busy === "save" && (
                    <span aria-hidden="true" className="material-symbols-outlined animate-spin text-[18px]">
                      progress_activity
                    </span>
                  )}
                  {busy === "save" ? "Saving…" : "Save changes"}
                </button>
                {step ? (
                  <button
                    type="button"
                    onClick={handleAdvance}
                    disabled={busy !== null}
                    className="inline-flex items-center justify-center gap-2 rounded-xl bg-gray-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <span
                      aria-hidden="true"
                      className={`material-symbols-outlined text-[18px] ${
                        busy === "advance" ? "animate-spin" : ""
                      }`}
                    >
                      {busy === "advance" ? "progress_activity" : "arrow_forward"}
                    </span>
                    {busy === "advance" ? step.busy : step.action}
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => setConfirming(true)}
                    disabled={!canVerify || busy !== null}
                    className="inline-flex items-center justify-center gap-2 rounded-xl bg-gray-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <span aria-hidden="true" className="material-symbols-outlined text-[18px]">
                      verified
                    </span>
                    {checkingEligibility ? "Checking…" : "Mark as verified"}
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </form>
    </section>
  );
}
