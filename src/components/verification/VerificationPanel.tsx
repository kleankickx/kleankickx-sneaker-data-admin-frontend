import { useImperativeHandle, useState, type FormEvent, type Ref } from "react";

import {
  completeVerification,
  identifySneaker,
  startIdentification,
  updateSneaker,
  type SneakerPairEdit,
  type VerifiedMaterial,
} from "../../lib/api";
import { readApiError, type ApiFormError } from "../../lib/api-errors";
import { METADATA_MAX_LENGTH } from "../../lib/bulk-review";
import {
  DEFAULT_CONDITION,
  GRADE_OPTIONS,
  conditionFromGrade,
  conditionLabel,
} from "../../lib/conditions";
import {
  MATERIAL_OPTIONS,
  REGION_OPTIONS,
  materialLabel,
  regionLabel,
} from "../../lib/materials";
import type { AnalysisField, AnalysisResult, SneakerPair } from "../../lib/types";
import {
  REVIEW_THRESHOLD,
  percent,
  type AiSuggestion,
} from "../../lib/verification";

type TextField = "brand" | "model" | "sku" | "size" | "colorway";
type Field = TextField | "condition";
type Values = Record<Field, string>;
type Candidate = AnalysisResult["candidate_matches"][number];

export interface VerificationPanelHandle {
  /** Fill brand, model and SKU from a candidate match. */
  applyCandidate: (candidate: Candidate) => void;
}

const TEXT_FIELDS: Array<{ field: TextField; label: string; maxLength: number }> = [
  { field: "brand", label: "Brand", maxLength: METADATA_MAX_LENGTH.brand },
  { field: "model", label: "Model", maxLength: METADATA_MAX_LENGTH.model },
  { field: "sku", label: "SKU", maxLength: METADATA_MAX_LENGTH.sku },
  { field: "size", label: "Size", maxLength: METADATA_MAX_LENGTH.size },
  { field: "colorway", label: "Colorway", maxLength: 255 },
];

const INPUT_CLASS =
  "h-11 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm outline-none focus:border-gray-500 focus:ring-2 focus:ring-gray-200 disabled:cursor-not-allowed disabled:bg-gray-50 disabled:text-gray-700";

const SMALL_SELECT =
  "h-9 min-w-0 flex-1 rounded-lg border border-gray-300 bg-white px-2 text-sm outline-none focus:border-gray-500 focus:ring-2 focus:ring-gray-200 disabled:bg-gray-50";

function savedValues(pair: SneakerPair): Values {
  return {
    brand: pair.brand ?? "",
    model: pair.model ?? "",
    sku: pair.sku ?? "",
    size: pair.size ?? "",
    colorway: pair.colorway ?? "",
    condition: pair.condition || DEFAULT_CONDITION,
  };
}

function savedMaterials(pair: SneakerPair): VerifiedMaterial[] {
  return (pair.materials ?? [])
    .filter((m) => m.source === "human")
    .map((m) => ({ material_type: m.material_type, location: m.location }));
}

function normalise(values: Values): Values {
  return {
    brand: values.brand.trim(),
    model: values.model.trim(),
    sku: values.sku.trim(),
    size: values.size.trim(),
    colorway: values.colorway.trim(),
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

function sameMaterials(a: VerifiedMaterial[], b: VerifiedMaterial[]) {
  const key = (list: VerifiedMaterial[]) =>
    list.map((m) => `${m.material_type}|${m.location}`).sort().join(",");
  return key(a) === key(b);
}

/**
 * The AI's value for a field: value, confidence (amber below the review
 * threshold) and evidence, with "Use" when it differs from the input.
 */
function AiValue({
  field,
  shown,
  current,
  onUse,
}: {
  field: AnalysisField | undefined;
  /* What to display and apply, if different from field.value. */
  shown?: { label: string; value: string } | null;
  current: string;
  onUse: (value: string) => void;
}) {
  if (!field) return null;

  if (!field.value) {
    return (
      <p className="mt-1.5 text-xs text-gray-400">
        AI: no value{field.evidence ? ` (${field.evidence})` : ""}
      </p>
    );
  }

  const display = shown ?? { label: field.value, value: field.value };
  const low = field.confidence < REVIEW_THRESHOLD;

  return (
    <div className="mt-1.5 text-xs">
      <div className="flex min-w-0 items-center gap-1.5">
        <span
          aria-hidden="true"
          className="material-symbols-outlined text-[14px] text-gray-400"
        >
          auto_awesome
        </span>
        <span className="shrink-0 text-gray-500">AI</span>
        <span className="truncate font-medium text-gray-700">{display.label}</span>
        <span
          className={`shrink-0 rounded px-1 font-medium ${
            low ? "bg-amber-50 text-amber-700" : "bg-gray-100 text-gray-600"
          }`}
          title={low ? "Below the review threshold" : undefined}
        >
          {percent(field.confidence)}
        </span>
        {same(display.value, current) ? (
          <span className="shrink-0 text-emerald-700">· matches</span>
        ) : (
          <button
            type="button"
            onClick={() => onUse(display.value)}
            className="shrink-0 font-medium text-gray-700 underline underline-offset-2 hover:text-gray-900"
          >
            Use
          </button>
        )}
      </div>
      {field.evidence && (
        <p className="mt-0.5 line-clamp-2 text-gray-500" title={field.evidence}>
          {field.evidence}
        </p>
      )}
    </div>
  );
}

/** One verified value, with the AI's value and the saved value beside it. */
function VerificationField({
  field,
  label,
  maxLength,
  value,
  saved,
  ai,
  error,
  disabled,
  onChange,
}: {
  field: TextField;
  label: string;
  maxLength: number;
  value: string;
  saved: string;
  ai: AnalysisField | undefined;
  error: string | undefined;
  disabled: boolean;
  onChange: (value: string) => void;
}) {
  const id = `verify-${field}`;
  const changed = value.trim() !== saved;

  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium text-gray-700">
        {label}
      </label>
      <input
        id={id}
        type="text"
        value={value}
        maxLength={maxLength}
        disabled={disabled}
        placeholder="Not recorded"
        onChange={(event) => onChange(event.target.value)}
        aria-invalid={Boolean(error)}
        className={INPUT_CLASS}
      />

      {error && <p className="mt-1 text-xs text-red-700">{error}</p>}

      {!disabled && <AiValue field={ai} current={value} onUse={onChange} />}

      {!disabled && changed && (
        <div className="mt-1 flex min-w-0 items-center gap-1.5 text-xs text-gray-500">
          <span className="shrink-0">Saved value</span>
          <span className="truncate font-medium text-gray-700">{saved || "empty"}</span>
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

/** Materials by region; saved with "Mark as verified". */
function MaterialsEditor({
  materials,
  aiMaterials,
  disabled,
  onChange,
}: {
  materials: VerifiedMaterial[];
  aiMaterials: VerifiedMaterial[];
  disabled: boolean;
  onChange: (materials: VerifiedMaterial[]) => void;
}) {
  const update = (index: number, patch: Partial<VerifiedMaterial>) =>
    onChange(materials.map((m, i) => (i === index ? { ...m, ...patch } : m)));

  return (
    <fieldset className="sm:col-span-2">
      <legend className="mb-1.5 text-sm font-medium text-gray-700">Materials</legend>

      {materials.length === 0 ? (
        <p className="text-sm text-gray-400">No materials recorded.</p>
      ) : (
        <ul className="space-y-2">
          {materials.map((m, index) => (
            <li key={index} className="flex items-center gap-2">
              <select
                aria-label={`Material ${index + 1}`}
                value={m.material_type}
                disabled={disabled}
                onChange={(event) => update(index, { material_type: event.target.value })}
                className={SMALL_SELECT}
              >
                {MATERIAL_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
              <select
                aria-label={`Region ${index + 1}`}
                value={m.location}
                disabled={disabled}
                onChange={(event) => update(index, { location: event.target.value })}
                className={SMALL_SELECT}
              >
                <option value="">Region…</option>
                {REGION_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
              {!disabled && (
                <button
                  type="button"
                  onClick={() => onChange(materials.filter((_, i) => i !== index))}
                  aria-label={`Remove material ${index + 1}`}
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-gray-400 transition hover:bg-gray-100 hover:text-gray-700"
                >
                  <span aria-hidden="true" className="material-symbols-outlined text-[18px]">
                    close
                  </span>
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {!disabled && (
        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
          <button
            type="button"
            onClick={() =>
              onChange([...materials, { material_type: "leather", location: "" }])
            }
            className="font-medium text-gray-700 underline underline-offset-2 hover:text-gray-900"
          >
            Add material
          </button>
          {aiMaterials.length > 0 &&
            (sameMaterials(aiMaterials, materials) ? (
              <span className="text-emerald-700">Matches the AI's materials</span>
            ) : (
              <button
                type="button"
                onClick={() => onChange(aiMaterials)}
                className="font-medium text-gray-700 underline underline-offset-2 hover:text-gray-900"
                title={aiMaterials
                  .map((m) => `${materialLabel(m.material_type)} (${regionLabel(m.location)})`)
                  .join(", ")}
              >
                Use AI materials ({aiMaterials.length})
              </button>
            ))}
        </div>
      )}
    </fieldset>
  );
}

/**
 * The verifier's decision: review each field against the AI's value,
 * save corrections, move the pair through identification, and mark it
 * verified. AI values are only applied when the verifier chooses to.
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
  ref,
}: {
  pair: SneakerPair;
  suggestion: AiSuggestion | null;
  /* Why the pair can't be verified yet; empty when it can. */
  blockers: string[];
  checkingEligibility: boolean;
  onSaved: (pair: SneakerPair) => void;
  /* The pair moved to the next workflow step. */
  onAdvanced: (pair: SneakerPair, message: string) => void;
  onVerified: (pair: SneakerPair) => void;
  ref?: Ref<VerificationPanelHandle>;
}) {
  const [saved] = useState(() => savedValues(pair));
  const [values, setValues] = useState(saved);
  const [initialMaterials] = useState(() => savedMaterials(pair));
  const [materials, setMaterials] = useState(initialMaterials);
  const [busy, setBusy] = useState<"save" | "advance" | "verify" | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<ApiFormError<string> | null>(null);

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
  const materialsChanged = !sameMaterials(materials, initialMaterials);
  const graded = clean.condition !== DEFAULT_CONDITION;
  const canVerify =
    !isVerified && blockers.length === 0 && !checkingEligibility && graded;

  const ai = suggestion?.result;
  const aiCondition = ai ? conditionFromGrade(ai.condition.value) : null;

  function set(field: Field, value: string) {
    setValues((current) => ({ ...current, [field]: value }));
    setConfirming(false);
  }

  useImperativeHandle(ref, () => ({
    applyCandidate(candidate) {
      setValues((current) => ({
        ...current,
        brand: candidate.brand ?? current.brand,
        model: candidate.model ?? current.model,
        sku: candidate.sku ?? current.sku,
      }));
      setConfirming(false);
    },
  }));

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
        readApiError(
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
    run(
      "verify",
      () => completeVerification(pair.id, { ...clean, materials }),
      onVerified,
    );
  }

  const disabled = isVerified || busy !== null;

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
            <h2 className="text-base font-semibold text-gray-900">Verified data</h2>
            <p className="text-xs text-gray-500">
              {isVerified
                ? "These values are the verified record."
                : "Your decision. AI values are only applied if you use them."}
            </p>
          </div>
        </div>
        {(dirty || materialsChanged) && !isVerified && (
          <span className="inline-flex shrink-0 items-center rounded-full bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-700 ring-1 ring-inset ring-amber-600/10">
            Unsaved
          </span>
        )}
      </div>

      <form onSubmit={handleSave}>
        <div className="grid gap-4 px-5 py-5 sm:grid-cols-2 sm:px-6">
          {TEXT_FIELDS.map(({ field, label, maxLength }) => (
            <VerificationField
              key={field}
              field={field}
              label={label}
              maxLength={maxLength}
              value={values[field]}
              saved={saved[field]}
              ai={ai?.[field]}
              error={error?.fields[field]}
              disabled={disabled}
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
              disabled={disabled}
              onChange={(event) => set("condition", event.target.value)}
              className={INPUT_CLASS}
            >
              <option value={DEFAULT_CONDITION} disabled={isVerified}>
                {isVerified ? "Unknown" : "Choose a grade…"}
              </option>
              {GRADE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            {pair.legacy_condition && (
              <p className="mt-1 text-xs text-gray-500">
                Earlier A–D grade: {pair.legacy_condition.toUpperCase()}. It isn't
                carried over to the new grades.
              </p>
            )}
            {error?.fields.condition && (
              <p className="mt-1 text-xs text-red-700">{error.fields.condition}</p>
            )}
            {!disabled && ai && (
              <AiValue
                field={ai.condition}
                shown={
                  aiCondition
                    ? { label: conditionLabel(aiCondition), value: aiCondition }
                    : null
                }
                current={values.condition}
                onUse={(value) => set("condition", value)}
              />
            )}
          </div>

          <MaterialsEditor
            materials={materials}
            aiMaterials={suggestion?.regions ?? []}
            disabled={disabled}
            onChange={(next) => {
              setMaterials(next);
              setConfirming(false);
            }}
          />
          {error?.fields.materials && (
            <p className="text-xs text-red-700 sm:col-span-2">{error.fields.materials}</p>
          )}

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

            {!step && !checkingEligibility && (blockers.length > 0 || !graded) && (
              <div className="rounded-lg bg-gray-50 px-3 py-2.5">
                <p className="text-xs font-medium text-gray-700">
                  Can't be marked verified yet:
                </p>
                <ul className="mt-1 list-disc space-y-0.5 pl-4 text-xs text-gray-600">
                  {blockers.map((reason) => (
                    <li key={reason}>{reason}</li>
                  ))}
                  {!graded && <li>Choose a condition grade.</li>}
                </ul>
              </div>
            )}

            {materialsChanged && !step && (
              <p className="text-xs text-gray-500">
                Materials are saved when you mark the pair verified.
              </p>
            )}

            {confirming ? (
              <div className="rounded-xl border border-gray-200 p-4">
                <p className="text-sm font-medium text-gray-900">
                  Mark this pair as verified?
                </p>
                <p className="mt-1 text-sm text-gray-500">
                  The values above
                  {dirty || materialsChanged ? ", including your unsaved changes," : ""}{" "}
                  become the verified record and update the catalog, and the
                  photos are locked.
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
