import { useState, type FormEvent } from "react";

import { updateSneaker, type SneakerPairEdit } from "../../lib/api";
import { METADATA_MAX_LENGTH } from "../../lib/bulk-review";
import { CONDITION_OPTIONS, DEFAULT_CONDITION } from "../../lib/conditions";
import type { SneakerPair } from "../../lib/types";

type Field = keyof SneakerPairEdit;

const TEXT_FIELDS: Array<{ field: Exclude<Field, "condition">; label: string }> = [
  { field: "brand", label: "Brand" },
  { field: "model", label: "Model" },
  { field: "sku", label: "SKU" },
  { field: "size", label: "Size" },
];

interface ApiError {
  message: string;
  fields: Partial<Record<Field, string>>;
}

function readApiError(error: unknown): ApiError {
  const e = error as {
    response?: {
      data?: {
        error?: { message?: string; fields?: Record<string, unknown> };
      };
    };
    message?: string;
  };
  const body = e?.response?.data?.error;

  const fields: ApiError["fields"] = {};
  for (const [field, value] of Object.entries(body?.fields ?? {})) {
    fields[field as Field] = Array.isArray(value)
      ? String(value[0])
      : String(value);
  }

  // A non-field error (e.g. "These fields can't be edited") reads best
  // as the main message.
  const nonField = fields["non_field_errors" as Field];
  delete fields["non_field_errors" as Field];

  return {
    message:
      nonField ||
      body?.message ||
      e?.message ||
      "Could not save changes.",
    fields,
  };
}

function initialValues(pair: SneakerPair): Required<SneakerPairEdit> {
  return {
    brand: pair.brand ?? "",
    model: pair.model ?? "",
    sku: pair.sku ?? "",
    size: pair.size ?? "",
    condition: pair.condition || DEFAULT_CONDITION,
  };
}

function EditPairForm({
  pair,
  onClose,
  onSaved,
}: {
  pair: SneakerPair;
  onClose: () => void;
  onSaved: (pair: SneakerPair) => void;
}) {
  const [initial] = useState(() => initialValues(pair));
  const [values, setValues] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);

  const changes = (Object.keys(values) as Field[]).reduce<SneakerPairEdit>(
    (diff, field) => {
      const value = field === "condition" ? values[field] : values[field].trim();
      return value !== initial[field] ? { ...diff, [field]: value } : diff;
    },
    {},
  );
  const dirty = Object.keys(changes).length > 0;

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!dirty || saving) return;

    setSaving(true);
    setError(null);
    try {
      onSaved(await updateSneaker(pair.id, changes));
    } catch (err) {
      setError(readApiError(err));
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="edit-pair-title"
      onKeyDown={(event) => {
        if (event.key === "Escape" && !saving) onClose();
      }}
    >
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-lg overflow-hidden rounded-2xl bg-white shadow-2xl"
      >
        <div className="flex items-center justify-between border-b border-gray-200 px-6 py-5">
          <div className="min-w-0">
            <h2
              id="edit-pair-title"
              className="text-lg font-semibold text-gray-900"
            >
              Edit pair
            </h2>
            <p className="mt-1 truncate text-sm text-gray-500">
              {pair.pair_id ?? pair.id}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="text-gray-400 hover:text-gray-700 disabled:opacity-40"
            aria-label="Close"
          >
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        <div className="grid gap-4 px-6 py-5 sm:grid-cols-2">
          {TEXT_FIELDS.map(({ field, label }) => (
            <label key={field} className="block">
              <span className="mb-1.5 block text-sm font-medium text-gray-700">
                {label}
              </span>
              <input
                type="text"
                value={values[field]}
                maxLength={METADATA_MAX_LENGTH[field]}
                onChange={(event) =>
                  setValues({ ...values, [field]: event.target.value })
                }
                aria-invalid={Boolean(error?.fields[field])}
                className="h-11 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm outline-none focus:border-gray-500 focus:ring-2 focus:ring-gray-200"
              />
              {error?.fields[field] && (
                <span className="mt-1 block text-xs text-red-700">
                  {error.fields[field]}
                </span>
              )}
            </label>
          ))}

          <label className="block sm:col-span-2">
            <span className="mb-1.5 block text-sm font-medium text-gray-700">
              Condition
            </span>
            <select
              value={values.condition}
              onChange={(event) =>
                setValues({ ...values, condition: event.target.value })
              }
              className="h-11 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm outline-none focus:border-gray-500 focus:ring-2 focus:ring-gray-200"
            >
              {CONDITION_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            {error?.fields.condition && (
              <span className="mt-1 block text-xs text-red-700">
                {error.fields.condition}
              </span>
            )}
          </label>

          {error && Object.keys(error.fields).length === 0 && (
            <p role="alert" className="text-sm text-red-700 sm:col-span-2">
              {error.message}
            </p>
          )}
        </div>

        <div className="flex justify-end gap-3 border-t border-gray-200 px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50 disabled:opacity-40"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={!dirty || saving}
            className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {saving ? "Saving…" : "Save changes"}
          </button>
        </div>
      </form>
    </div>
  );
}

/** Edit a pair's details. Open by passing a pair; close by passing null. */
export default function EditPairModal({
  pair,
  onClose,
  onSaved,
}: {
  pair: SneakerPair | null;
  onClose: () => void;
  onSaved: (pair: SneakerPair) => void;
}) {
  if (!pair) return null;
  return (
    <EditPairForm
      key={pair.id}
      pair={pair}
      onClose={onClose}
      onSaved={onSaved}
    />
  );
}
