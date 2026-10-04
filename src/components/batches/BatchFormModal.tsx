import { useEffect, useState } from "react";
import type { Batch } from "../../lib/types";

type BatchFormData = {
  name: string;
  source: string;
  expected_quantity: string;
};

type BatchFormModalProps = {
  open: boolean;
  batch?: Batch | null;
  submitting?: boolean;
  onClose: () => void;
  onSubmit: (data: {
    name: string;
    source: string;
    expected_quantity: number;
  }) => void;
};

export default function BatchFormModal({
  open,
  batch,
  submitting = false,
  onClose,
  onSubmit,
}: BatchFormModalProps) {
  const [form, setForm] = useState<BatchFormData>({
    name: "",
    source: "",
    expected_quantity: "",
  });

  const [error, setError] = useState("");

  const isEditing = Boolean(batch);

  useEffect(() => {
    if (!open) {
      return;
    }

    setForm({
      name: batch?.name ?? "",
      source: batch?.source ?? "",
      expected_quantity:
        batch?.expected_quantity?.toString() ?? "",
    });

    setError("");
  }, [open, batch]);

  if (!open) {
    return null;
  }

  function handleChange(
    field: keyof BatchFormData,
    value: string,
  ) {
    setForm((current) => ({
      ...current,
      [field]: value,
    }));
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const name = form.name.trim();
    const source = form.source.trim();
    const expectedQuantity = Number(form.expected_quantity);

    if (!name) {
      setError("Batch name is required.");
      return;
    }

    if (!source) {
      setError("Source is required.");
      return;
    }

    if (
      !Number.isInteger(expectedQuantity) ||
      expectedQuantity <= 0
    ) {
      setError("Expected quantity must be a positive whole number.");
      return;
    }

    setError("");

    onSubmit({
      name,
      source,
      expected_quantity: expectedQuantity,
    });
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="batch-form-title"
    >
      <div className="w-full max-w-md overflow-hidden rounded-xl bg-white shadow-xl">
        {/* Header */}
        <div className="flex items-start justify-between border-b border-gray-200 px-6 py-5">
          <div>
            <h2
              id="batch-form-title"
              className="text-base font-semibold text-gray-900"
            >
              {isEditing ? "Edit batch" : "Create new batch"}
            </h2>

            <p className="mt-1 text-xs text-gray-500">
              {isEditing
                ? "Update the batch information."
                : "Create a new sneaker intake batch."}
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 transition hover:bg-gray-100 hover:text-gray-700 disabled:opacity-50"
            aria-label="Close"
          >
            <span className="material-symbols-outlined text-[20px]">
              close
            </span>
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit}>
          <div className="space-y-5 px-6 py-6">
            {error && (
              <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3">
                <p className="text-xs font-medium text-red-700">
                  {error}
                </p>
              </div>
            )}

            {/* Name */}
            <div>
              <label
                htmlFor="batch-name"
                className="mb-1.5 block text-sm font-medium text-gray-700"
              >
                Batch name
              </label>

              <input
                id="batch-name"
                type="text"
                value={form.name}
                onChange={(event) =>
                  handleChange("name", event.target.value)
                }
                placeholder="e.g. Life Check Waste"
                disabled={submitting}
                className="h-10 w-full rounded-lg border border-gray-200 px-3 text-sm text-gray-900 outline-none placeholder:text-gray-400 focus:border-gray-400 focus:ring-2 focus:ring-gray-100 disabled:bg-gray-50"
              />
            </div>

            {/* Source */}
            <div>
              <label
                htmlFor="batch-source"
                className="mb-1.5 block text-sm font-medium text-gray-700"
              >
                Source
              </label>

              <input
                id="batch-source"
                type="text"
                value={form.source}
                onChange={(event) =>
                  handleChange("source", event.target.value)
                }
                placeholder="e.g. EWC"
                disabled={submitting}
                className="h-10 w-full rounded-lg border border-gray-200 px-3 text-sm text-gray-900 outline-none placeholder:text-gray-400 focus:border-gray-400 focus:ring-2 focus:ring-gray-100 disabled:bg-gray-50"
              />
            </div>

            {/* Quantity */}
            <div>
              <label
                htmlFor="batch-quantity"
                className="mb-1.5 block text-sm font-medium text-gray-700"
              >
                Expected quantity
              </label>

              <input
                id="batch-quantity"
                type="number"
                min="1"
                step="1"
                value={form.expected_quantity}
                onChange={(event) =>
                  handleChange(
                    "expected_quantity",
                    event.target.value,
                  )
                }
                placeholder="e.g. 200"
                disabled={submitting}
                className="h-10 w-full rounded-lg border border-gray-200 px-3 text-sm text-gray-900 outline-none placeholder:text-gray-400 focus:border-gray-400 focus:ring-2 focus:ring-gray-100 disabled:bg-gray-50"
              />
            </div>
          </div>

          {/* Footer */}
          <div className="flex justify-end gap-3 border-t border-gray-200 bg-gray-50 px-6 py-4">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="h-9 rounded-lg px-4 text-sm font-medium text-gray-600 transition hover:bg-gray-200 disabled:opacity-50"
            >
              Cancel
            </button>

            <button
              type="submit"
              disabled={submitting}
              className="flex h-9 items-center gap-2 rounded-lg bg-gray-900 px-4 text-sm font-medium text-white transition hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {submitting && (
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
              )}

              {submitting
                ? "Saving..."
                : isEditing
                  ? "Save changes"
                  : "Create batch"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
