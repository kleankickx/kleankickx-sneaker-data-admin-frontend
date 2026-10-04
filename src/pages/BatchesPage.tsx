import { useEffect, useMemo, useRef, useState } from "react";
import {
  closeBatch,
  createBatch,
  deleteBatch,
  getBatches,
  openBatch,
  updateBatch,
} from "../lib/api";
import type { Batch } from "../lib/types";
import BatchFormModal from "../components/batches/BatchFormModal";
import { Link } from "react-router-dom";

type SortField =
  | "batch_id"
  | "name"
  | "source"
  | "expected_quantity"
  | "status"
  | "received_at";

type SortDirection = "asc" | "desc";

type ActionType = "open" | "close" | "delete";

type ToastType = "success" | "error";

type Toast = {
  type: ToastType;
  message: string;
};

const PAGE_SIZE = 10;

export default function BatchesPage() {
  const [batches, setBatches] = useState<Batch[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [sourceFilter, setSourceFilter] = useState("");

  const [sortField, setSortField] =
    useState<SortField>("batch_id");

  const [sortDirection, setSortDirection] =
    useState<SortDirection>("desc");

  const [currentPage, setCurrentPage] = useState(1);

  // Batch form state
  const [formOpen, setFormOpen] = useState(false);
  const [editingBatch, setEditingBatch] =
    useState<Batch | null>(null);

  // Action state
  const [actionBatch, setActionBatch] =
    useState<Batch | null>(null);

  const [actionType, setActionType] =
    useState<ActionType | null>(null);

  const [submitting, setSubmitting] =
    useState(false);

  // Row action menu
  const [actionMenuBatchId, setActionMenuBatchId] =
    useState<string | null>(null);

  const actionMenuRef =
    useRef<HTMLDivElement | null>(null);

  // Toast
  const [toast, setToast] =
    useState<Toast | null>(null);

  useEffect(() => {
    loadBatches();
  }, []);

  /**
   * Automatically close the row action menu
   * when the user clicks somewhere else.
   */
  useEffect(() => {
    function handleDocumentClick(event: MouseEvent) {
      if (
        actionMenuRef.current &&
        !actionMenuRef.current.contains(
          event.target as Node,
        )
      ) {
        setActionMenuBatchId(null);
      }
    }

    document.addEventListener(
      "mousedown",
      handleDocumentClick,
    );

    return () => {
      document.removeEventListener(
        "mousedown",
        handleDocumentClick,
      );
    };
  }, []);

  /**
   * Automatically dismiss toast after 4 seconds.
   */
  useEffect(() => {
    if (!toast) {
      return;
    }

    const timer = window.setTimeout(() => {
      setToast(null);
    }, 4000);

    return () => {
      window.clearTimeout(timer);
    };
  }, [toast]);

  async function loadBatches() {
    try {
      setLoading(true);
      setError(null);

      const response = await getBatches();

      setBatches(response.results);
    } catch (err) {
      console.error(
        "Failed to load batches:",
        err,
      );

      setError(
        getErrorMessage(
          err,
          "Unable to load batches. Please try again.",
        ),
      );
    } finally {
      setLoading(false);
    }
  }

  function showToast(
    type: ToastType,
    message: string,
  ) {
    setToast({
      type,
      message,
    });
  }

  const statuses = useMemo(() => {
    return Array.from(
      new Set(
        batches
          .map((batch) => batch.status)
          .filter(Boolean),
      ),
    ).sort();
  }, [batches]);

  const sources = useMemo(() => {
    return Array.from(
      new Set(
        batches
          .map((batch) => batch.source)
          .filter(Boolean),
      ),
    ).sort();
  }, [batches]);

  const filteredAndSortedBatches =
    useMemo(() => {
      const normalizedSearch = search
        .trim()
        .toLowerCase();

      const filtered = batches.filter(
        (batch) => {
          const matchesSearch =
            !normalizedSearch ||
            [
              batch.batch_id,
              batch.name,
              batch.source,
            ].some((value) =>
              value
                ?.toLowerCase()
                .includes(
                  normalizedSearch,
                ),
            );

          const matchesStatus =
            !statusFilter ||
            batch.status === statusFilter;

          const matchesSource =
            !sourceFilter ||
            batch.source === sourceFilter;

          return (
            matchesSearch &&
            matchesStatus &&
            matchesSource
          );
        },
      );

      return [...filtered].sort(
        (a, b) => {
          const direction =
            sortDirection === "asc"
              ? 1
              : -1;

          switch (sortField) {
            case "batch_id":
              return (
                compareValues(
                  a.batch_id ?? a.id,
                  b.batch_id ?? b.id,
                ) * direction
              );

            case "name":
              return (
                compareValues(
                  a.name,
                  b.name,
                ) * direction
              );

            case "source":
              return (
                compareValues(
                  a.source,
                  b.source,
                ) * direction
              );

            case "expected_quantity":
              return (
                (a.expected_quantity -
                  b.expected_quantity) *
                direction
              );

            case "status":
              return (
                compareValues(
                  a.status,
                  b.status,
                ) * direction
              );

            case "received_at":
              return (
                compareDates(
                  a.received_at,
                  b.received_at,
                ) * direction
              );

            default:
              return 0;
          }
        },
      );
    }, [
      batches,
      search,
      statusFilter,
      sourceFilter,
      sortField,
      sortDirection,
    ]);

  const totalPages = Math.max(
    1,
    Math.ceil(
      filteredAndSortedBatches.length /
        PAGE_SIZE,
    ),
  );

  const paginatedBatches = useMemo(() => {
    const start =
      (currentPage - 1) * PAGE_SIZE;

    return filteredAndSortedBatches.slice(
      start,
      start + PAGE_SIZE,
    );
  }, [
    filteredAndSortedBatches,
    currentPage,
  ]);

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

  useEffect(() => {
    setCurrentPage(1);
  }, [
    search,
    statusFilter,
    sourceFilter,
  ]);

  function handleSort(field: SortField) {
    if (sortField === field) {
      setSortDirection((current) =>
        current === "asc"
          ? "desc"
          : "asc",
      );

      return;
    }

    setSortField(field);
    setSortDirection("asc");
  }

  function clearFilters() {
    setSearch("");
    setStatusFilter("");
    setSourceFilter("");
    setCurrentPage(1);
  }

  function hasActiveFilters() {
    return Boolean(
      search ||
        statusFilter ||
        sourceFilter,
    );
  }

  function openCreateModal() {
    setEditingBatch(null);
    setFormOpen(true);
    setError(null);
  }

  function openEditModal(batch: Batch) {
    setActionMenuBatchId(null);
    setEditingBatch(batch);
    setFormOpen(true);
    setError(null);
  }

  function requestAction(
    batch: Batch,
    type: ActionType,
  ) {
    setActionMenuBatchId(null);
    setActionBatch(batch);
    setActionType(type);
    setError(null);
  }

  function closeActionModal() {
    if (submitting) {
      return;
    }

    setActionBatch(null);
    setActionType(null);
  }

  async function handleSaveBatch(data: {
    name: string;
    source: string;
    expected_quantity: number;
  }) {
    try {
      setSubmitting(true);
      setError(null);

      if (editingBatch) {
        const updated =
          await updateBatch(
            editingBatch.id,
            data,
          );

        setBatches((current) =>
          current.map((batch) =>
            batch.id === updated.id
              ? updated
              : batch,
          ),
        );

        setFormOpen(false);
        setEditingBatch(null);

        showToast(
          "success",
          "Batch updated successfully.",
        );
      } else {
        const created =
          await createBatch(data);

        setBatches((current) => [
          created,
          ...current,
        ]);

        setFormOpen(false);
        setEditingBatch(null);

        showToast(
          "success",
          "Batch created successfully.",
        );
      }
    } catch (err) {
      console.error(
        "Failed to save batch:",
        err,
      );

      showToast(
        "error",
        getErrorMessage(
          err,
          "Unable to save the batch.",
        ),
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function handleBatchAction() {
    if (!actionBatch || !actionType) {
      return;
    }

    const currentAction = actionType;

    try {
      setSubmitting(true);
      setError(null);

      if (currentAction === "open") {
        const updated =
          await openBatch(
            actionBatch.id,
          );

        setBatches((current) =>
          current.map((batch) =>
            batch.id === updated.id
              ? updated
              : batch,
          ),
        );

        showToast(
          "success",
          "Batch opened successfully.",
        );
      }

      if (currentAction === "close") {
        const updated =
          await closeBatch(
            actionBatch.id,
          );

        setBatches((current) =>
          current.map((batch) =>
            batch.id === updated.id
              ? updated
              : batch,
          ),
        );

        showToast(
          "success",
          "Batch closed successfully.",
        );
      }

      if (currentAction === "delete") {
        await deleteBatch(
          actionBatch.id,
        );

        setBatches((current) =>
          current.filter(
            (batch) =>
              batch.id !==
              actionBatch.id,
          ),
        );

        showToast(
          "success",
          "Batch deleted successfully.",
        );
      }

      setActionBatch(null);
      setActionType(null);
    } catch (err) {
      console.error(
        "Batch action failed:",
        err,
      );

      showToast(
        "error",
        getErrorMessage(
          err,
          getActionErrorMessage(
            currentAction,
          ),
        ),
      );
    } finally {
      setSubmitting(false);
    }
  }

  const actionTitle =
    getActionTitle(actionType);

  const actionDescription =
    getActionDescription(
      actionType,
      actionBatch,
    );

  const actionButtonLabel =
    getActionButtonLabel(actionType);

  return (
    <div className="min-h-full bg-gray-50">
      {/* Toast notification */}
      <ToastNotification
        toast={toast}
        onClose={() => setToast(null)}
      />

      <div className="mx-auto max-w-[1600px] px-4 py-6 sm:px-6 lg:px-8">
        {/* Page header */}
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-gray-900">
              Batches
            </h1>

            <p className="mt-1 text-sm text-gray-500">
              Manage sneaker intake batches
              and their collection status.
            </p>
          </div>

          <button
            type="button"
            onClick={openCreateModal}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-gray-900 px-4 text-sm font-medium text-white transition hover:bg-gray-800"
          >
            <span className="material-symbols-outlined text-[20px]">
              add
            </span>

            New batch
          </button>
        </div>

        {/* Error banner */}
        {error && (
          <div className="mb-5 flex items-start justify-between gap-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3">
            <div className="flex items-start gap-3">
              <span className="material-symbols-outlined mt-0.5 text-[20px] text-red-600">
                error
              </span>

              <div>
                <p className="text-sm font-medium text-red-800">
                  Something went wrong
                </p>

                <p className="mt-0.5 text-xs text-red-700">
                  {error}
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() =>
                setError(null)
              }
              className="text-red-500 transition hover:text-red-700"
              aria-label="Dismiss error"
            >
              <span className="material-symbols-outlined text-[20px]">
                close
              </span>
            </button>
          </div>
        )}

        {/* Filters */}
        <div className="mb-5 rounded-xl border border-gray-200 bg-white p-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
            {/* Search */}
            <div className="relative min-w-0 flex-1">
              <span className="material-symbols-outlined pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[20px] text-gray-400">
                search
              </span>

              <input
                type="text"
                value={search}
                onChange={(event) =>
                  setSearch(
                    event.target.value,
                  )
                }
                placeholder="Search by batch ID, name or source..."
                className="h-10 w-full rounded-lg border border-gray-200 bg-white pl-10 pr-3 text-sm text-gray-900 outline-none transition placeholder:text-gray-400 focus:border-gray-400 focus:ring-2 focus:ring-gray-100"
              />
            </div>

            {/* Status filter */}
            <select
              value={statusFilter}
              onChange={(event) =>
                setStatusFilter(
                  event.target.value,
                )
              }
              className="h-10 rounded-lg border border-gray-200 bg-white px-3 text-sm text-gray-700 outline-none focus:border-gray-400 focus:ring-2 focus:ring-gray-100"
            >
              <option value="">
                All statuses
              </option>

              {statuses.map((status) => (
                <option
                  key={status}
                  value={status}
                >
                  {formatStatus(status)}
                </option>
              ))}
            </select>

            {/* Source filter */}
            <select
              value={sourceFilter}
              onChange={(event) =>
                setSourceFilter(
                  event.target.value,
                )
              }
              className="h-10 rounded-lg border border-gray-200 bg-white px-3 text-sm text-gray-700 outline-none focus:border-gray-400 focus:ring-2 focus:ring-gray-100"
            >
              <option value="">
                All sources
              </option>

              {sources.map((source) => (
                <option
                  key={source}
                  value={source}
                >
                  {source}
                </option>
              ))}
            </select>

            {/* Clear filters */}
            {hasActiveFilters() && (
              <button
                type="button"
                onClick={clearFilters}
                className="inline-flex h-10 items-center justify-center gap-1.5 rounded-lg px-3 text-sm font-medium text-gray-600 transition hover:bg-gray-100 hover:text-gray-900"
              >
                <span className="material-symbols-outlined text-[18px]">
                  close
                </span>

                Clear
              </button>
            )}
          </div>
        </div>

        {/* Table */}
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
          {loading ? (
            <LoadingTable />
          ) : filteredAndSortedBatches.length ===
            0 ? (
            <EmptyState
              hasFilters={hasActiveFilters()}
              onClearFilters={
                clearFilters
              }
              onCreate={
                openCreateModal
              }
            />
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[850px] text-left">
                  <thead className="border-b border-gray-200 bg-gray-50">
                    <tr>
                      <SortableHeader
                        label="Batch"
                        field="batch_id"
                        sortField={
                          sortField
                        }
                        sortDirection={
                          sortDirection
                        }
                        onSort={
                          handleSort
                        }
                      />

                      <SortableHeader
                        label="Name"
                        field="name"
                        sortField={
                          sortField
                        }
                        sortDirection={
                          sortDirection
                        }
                        onSort={
                          handleSort
                        }
                      />

                      <SortableHeader
                        label="Source"
                        field="source"
                        sortField={
                          sortField
                        }
                        sortDirection={
                          sortDirection
                        }
                        onSort={
                          handleSort
                        }
                      />

                      <SortableHeader
                        label="Quantity"
                        field="expected_quantity"
                        sortField={
                          sortField
                        }
                        sortDirection={
                          sortDirection
                        }
                        onSort={
                          handleSort
                        }
                      />

                      <SortableHeader
                        label="Status"
                        field="status"
                        sortField={
                          sortField
                        }
                        sortDirection={
                          sortDirection
                        }
                        onSort={
                          handleSort
                        }
                      />

                      <th className="w-[180px] px-5 py-3 text-right text-xs font-semibold uppercase tracking-wide text-gray-500">
                        Actions
                      </th>
                    </tr>
                  </thead>

                  <tbody className="divide-y divide-gray-100">
                    {paginatedBatches.map(
                      (batch) => (
                        <tr
                          key={batch.id}
                          className="transition hover:bg-gray-50/70"
                        >
                          {/* Batch */}
                          <td className="px-5 py-4">
                            <Link
                              to={`/batches/${batch.id}`}
                              className="font-mono text-sm font-medium text-gray-900 hover:text-gray-600 hover:underline"
                            >
                              {batch.batch_id ?? batch.id}
                            </Link>

                            <div className="mt-1 text-xs text-gray-400">
                              {formatDate(
                                batch.created_at,
                              )}
                            </div>
                          </td>

                          {/* Name */}
                          <td className="px-5 py-4">
                            <span className="text-sm font-medium text-gray-800">
                              {batch.name}
                            </span>
                          </td>

                          {/* Source */}
                          <td className="px-5 py-4">
                            <span className="text-sm text-gray-600">
                              {batch.source}
                            </span>
                          </td>

                          {/* Quantity */}
                          <td className="px-5 py-4">
                            <span className="text-sm font-medium text-gray-800">
                              {batch.expected_quantity.toLocaleString()}
                            </span>
                          </td>

                          {/* Status */}
                          <td className="px-5 py-4">
                            <StatusBadge
                              status={
                                batch.status
                              }
                            />
                          </td>

                          {/* Actions */}
                          <td className="px-5 py-4">
                            <div
                              className="relative flex justify-end"
                              ref={
                                actionMenuBatchId ===
                                batch.id
                                  ? actionMenuRef
                                  : undefined
                              }
                            >
                              <button
                                type="button"
                                onClick={() =>
                                  setActionMenuBatchId(
                                    (
                                      current,
                                    ) =>
                                      current ===
                                      batch.id
                                        ? null
                                        : batch.id,
                                  )
                                }
                                className="inline-flex h-8 items-center gap-1 rounded-lg border border-gray-200 px-2.5 text-xs font-medium text-gray-600 transition hover:bg-gray-50 hover:text-gray-900"
                                aria-label={`Actions for ${
                                  batch.batch_id ??
                                  batch.name
                                }`}
                              >
                                Actions

                                <span className="material-symbols-outlined text-[18px]">
                                  keyboard_arrow_down
                                </span>
                              </button>

                              {actionMenuBatchId ===
                                batch.id && (
                                <BatchActionMenu
                                  batch={
                                    batch
                                  }
                                  onEdit={() =>
                                    openEditModal(
                                      batch,
                                    )
                                  }
                                  onOpen={() =>
                                    requestAction(
                                      batch,
                                      "open",
                                    )
                                  }
                                  onClose={() =>
                                    requestAction(
                                      batch,
                                      "close",
                                    )
                                  }
                                  onDelete={() =>
                                    requestAction(
                                      batch,
                                      "delete",
                                    )
                                  }
                                />
                              )}
                            </div>
                          </td>
                        </tr>
                      ),
                    )}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              <div className="flex flex-col gap-3 border-t border-gray-200 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-xs text-gray-500">
                  Showing{" "}
                  <span className="font-medium text-gray-700">
                    {Math.min(
                      (currentPage - 1) *
                        PAGE_SIZE +
                        1,
                      filteredAndSortedBatches.length,
                    )}
                  </span>{" "}
                  to{" "}
                  <span className="font-medium text-gray-700">
                    {Math.min(
                      currentPage *
                        PAGE_SIZE,
                      filteredAndSortedBatches.length,
                    )}
                  </span>{" "}
                  of{" "}
                  <span className="font-medium text-gray-700">
                    {
                      filteredAndSortedBatches.length
                    }
                  </span>{" "}
                  batches
                </p>

                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    disabled={
                      currentPage ===
                      1
                    }
                    onClick={() =>
                      setCurrentPage(
                        (current) =>
                          Math.max(
                            1,
                            current - 1,
                          ),
                      )
                    }
                    className="flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 text-gray-500 transition hover:bg-gray-50 hover:text-gray-900 disabled:cursor-not-allowed disabled:opacity-40"
                    aria-label="Previous page"
                  >
                    <span className="material-symbols-outlined text-[18px]">
                      chevron_left
                    </span>
                  </button>

                  <div className="flex h-8 min-w-8 items-center justify-center rounded-lg bg-gray-900 px-2 text-xs font-medium text-white">
                    {currentPage}
                  </div>

                  <button
                    type="button"
                    disabled={
                      currentPage ===
                      totalPages
                    }
                    onClick={() =>
                      setCurrentPage(
                        (current) =>
                          Math.min(
                            totalPages,
                            current + 1,
                          ),
                      )
                    }
                    className="flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 text-gray-500 transition hover:bg-gray-50 hover:text-gray-900 disabled:cursor-not-allowed disabled:opacity-40"
                    aria-label="Next page"
                  >
                    <span className="material-symbols-outlined text-[18px]">
                      chevron_right
                    </span>
                  </button>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Create/Edit modal */}
        <BatchFormModal
          open={formOpen}
          batch={editingBatch}
          submitting={submitting}
          onClose={() => {
            if (submitting) {
              return;
            }

            setFormOpen(false);
            setEditingBatch(null);
          }}
          onSubmit={
            handleSaveBatch
          }
        />

        {/* Action confirmation modal */}
        {actionBatch &&
          actionType && (
            <ConfirmationModal
              title={actionTitle}
              description={
                actionDescription
              }
              actionLabel={
                actionButtonLabel
              }
              actionType={actionType}
              submitting={submitting}
              onCancel={
                closeActionModal
              }
              onConfirm={
                handleBatchAction
              }
            />
          )}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Toast                                                                      */
/* -------------------------------------------------------------------------- */

type ToastNotificationProps = {
  toast: Toast | null;
  onClose: () => void;
};

function ToastNotification({
  toast,
  onClose,
}: ToastNotificationProps) {
  if (!toast) {
    return null;
  }

  const isSuccess =
    toast.type === "success";

  return (
    <div
      className="fixed right-5 top-5 z-[100] w-[360px] max-w-[calc(100vw-2rem)]"
      role="alert"
    >
      <div
        className={`flex items-start gap-3 rounded-xl border bg-white px-4 py-3.5 shadow-lg ${
          isSuccess
            ? "border-green-200"
            : "border-red-200"
        }`}
      >
        <div
          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
            isSuccess
              ? "bg-green-50"
              : "bg-red-50"
          }`}
        >
          <span
            className={`material-symbols-outlined text-[19px] ${
              isSuccess
                ? "text-green-600"
                : "text-red-600"
            }`}
          >
            {isSuccess
              ? "check_circle"
              : "error"}
          </span>
        </div>

        <div className="min-w-0 flex-1">
          <p
            className={`text-sm font-semibold ${
              isSuccess
                ? "text-green-800"
                : "text-red-800"
            }`}
          >
            {isSuccess
              ? "Success"
              : "Action failed"}
          </p>

          <p className="mt-0.5 text-xs leading-5 text-gray-600">
            {toast.message}
          </p>
        </div>

        <button
          type="button"
          onClick={onClose}
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-gray-400 transition hover:bg-gray-100 hover:text-gray-700"
          aria-label="Close notification"
        >
          <span className="material-symbols-outlined text-[18px]">
            close
          </span>
        </button>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Table Components                                                           */
/* -------------------------------------------------------------------------- */

type SortableHeaderProps = {
  label: string;
  field: SortField;
  sortField: SortField;
  sortDirection: SortDirection;
  onSort: (field: SortField) => void;
};

function SortableHeader({
  label,
  field,
  sortField,
  sortDirection,
  onSort,
}: SortableHeaderProps) {
  const active =
    sortField === field;

  return (
    <th className="px-5 py-3">
      <button
        type="button"
        onClick={() => onSort(field)}
        className="inline-flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-gray-500 transition hover:text-gray-900"
      >
        {label}

        <span className="material-symbols-outlined text-[17px]">
          {active
            ? sortDirection ===
              "asc"
              ? "keyboard_arrow_up"
              : "keyboard_arrow_down"
            : "unfold_more"}
        </span>
      </button>
    </th>
  );
}

type StatusBadgeProps = {
  status: string;
};

function StatusBadge({
  status,
}: StatusBadgeProps) {
  const normalized =
    status.toLowerCase();

  let className =
    "border-gray-200 bg-gray-50 text-gray-600";

  if (normalized === "open") {
    className =
      "border-green-200 bg-green-50 text-green-700";
  }

  if (normalized === "closed") {
    className =
      "border-gray-200 bg-gray-100 text-gray-600";
  }

  if (
    normalized === "pending" ||
    normalized === "draft"
  ) {
    className =
      "border-amber-200 bg-amber-50 text-amber-700";
  }

  return (
    <span
      className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-medium ${className}`}
    >
      {formatStatus(status)}
    </span>
  );
}

/* -------------------------------------------------------------------------- */
/* Action Menu                                                                */
/* -------------------------------------------------------------------------- */

type BatchActionMenuProps = {
  batch: Batch;
  onEdit: () => void;
  onOpen: () => void;
  onClose: () => void;
  onDelete: () => void;
};

function BatchActionMenu({
  batch,
  onEdit,
  onOpen,
  onClose,
  onDelete,
}: BatchActionMenuProps) {
  const normalizedStatus =
    batch.status.toLowerCase();

  const isOpen =
    normalizedStatus === "open";

  return (
    <div className="absolute right-0 top-10 z-30 w-44 overflow-hidden rounded-lg border border-gray-200 bg-white py-1 shadow-lg">
      <button
        type="button"
        onClick={onEdit}
        className="flex w-full items-center gap-3 px-3 py-2 text-left text-sm text-gray-700 transition hover:bg-gray-50"
      >
        <span className="material-symbols-outlined text-[18px] text-gray-500">
          edit
        </span>

        Edit
      </button>

      {!isOpen && (
        <button
          type="button"
          onClick={onOpen}
          className="flex w-full items-center gap-3 px-3 py-2 text-left text-sm text-gray-700 transition hover:bg-gray-50"
        >
          <span className="material-symbols-outlined text-[18px] text-gray-500">
            lock_open
          </span>

          Open batch
        </button>
      )}

      {isOpen && (
        <button
          type="button"
          onClick={onClose}
          className="flex w-full items-center gap-3 px-3 py-2 text-left text-sm text-gray-700 transition hover:bg-gray-50"
        >
          <span className="material-symbols-outlined text-[18px] text-gray-500">
            lock
          </span>

          Close batch
        </button>
      )}

      <div className="my-1 border-t border-gray-100" />

      <button
        type="button"
        onClick={onDelete}
        className="flex w-full items-center gap-3 px-3 py-2 text-left text-sm text-red-600 transition hover:bg-red-50"
      >
        <span className="material-symbols-outlined text-[18px]">
          delete
        </span>

        Delete
      </button>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Confirmation Modal                                                         */
/* -------------------------------------------------------------------------- */

type ConfirmationModalProps = {
  title: string;
  description: string;
  actionLabel: string;
  actionType: ActionType;
  submitting: boolean;
  onCancel: () => void;
  onConfirm: () => void;
};

function ConfirmationModal({
  title,
  description,
  actionLabel,
  actionType,
  submitting,
  onCancel,
  onConfirm,
}: ConfirmationModalProps) {
  const isDelete =
    actionType === "delete";

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirmation-title"
    >
      <div className="w-full max-w-md overflow-hidden rounded-xl bg-white shadow-xl">
        <div className="px-6 py-6">
          <div className="flex items-start gap-4">
            <div
              className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${
                isDelete
                  ? "bg-red-50"
                  : "bg-gray-100"
              }`}
            >
              <span
                className={`material-symbols-outlined text-[21px] ${
                  isDelete
                    ? "text-red-600"
                    : "text-gray-600"
                }`}
              >
                {isDelete
                  ? "delete"
                  : actionType ===
                      "close"
                    ? "lock"
                    : "lock_open"}
              </span>
            </div>

            <div>
              <h2
                id="confirmation-title"
                className="text-base font-semibold text-gray-900"
              >
                {title}
              </h2>

              <p className="mt-2 text-sm leading-5 text-gray-500">
                {description}
              </p>
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-3 border-t border-gray-200 bg-gray-50 px-6 py-4">
          <button
            type="button"
            onClick={onCancel}
            disabled={submitting}
            className="h-9 rounded-lg px-4 text-sm font-medium text-gray-600 transition hover:bg-gray-200 disabled:opacity-50"
          >
            Cancel
          </button>

          <button
            type="button"
            onClick={onConfirm}
            disabled={submitting}
            className={`flex h-9 items-center gap-2 rounded-lg px-4 text-sm font-medium text-white transition disabled:cursor-not-allowed disabled:opacity-60 ${
              isDelete
                ? "bg-red-600 hover:bg-red-700"
                : "bg-gray-900 hover:bg-gray-800"
            }`}
          >
            {submitting && (
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
            )}

            {submitting
              ? "Processing..."
              : actionLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Loading State                                                              */
/* -------------------------------------------------------------------------- */

function LoadingTable() {
  return (
    <div className="animate-pulse">
      <div className="flex h-12 items-center gap-8 border-b border-gray-200 bg-gray-50 px-5">
        <div className="h-3 w-28 rounded bg-gray-200" />
        <div className="h-3 w-32 rounded bg-gray-200" />
        <div className="h-3 w-20 rounded bg-gray-200" />
        <div className="h-3 w-16 rounded bg-gray-200" />
        <div className="h-3 w-20 rounded bg-gray-200" />
        <div className="ml-auto h-3 w-20 rounded bg-gray-200" />
      </div>

      {Array.from({
        length: 6,
      }).map((_, index) => (
        <div
          key={index}
          className="flex h-[73px] items-center gap-8 border-b border-gray-100 px-5"
        >
          <div className="h-4 w-32 rounded bg-gray-100" />
          <div className="h-4 w-40 rounded bg-gray-100" />
          <div className="h-4 w-16 rounded bg-gray-100" />
          <div className="h-4 w-12 rounded bg-gray-100" />
          <div className="h-6 w-16 rounded-full bg-gray-100" />
          <div className="ml-auto h-8 w-20 rounded-lg bg-gray-100" />
        </div>
      ))}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Empty State                                                                */
/* -------------------------------------------------------------------------- */

type EmptyStateProps = {
  hasFilters: boolean;
  onClearFilters: () => void;
  onCreate: () => void;
};

function EmptyState({
  hasFilters,
  onClearFilters,
  onCreate,
}: EmptyStateProps) {
  return (
    <div className="flex min-h-[360px] flex-col items-center justify-center px-6 text-center">
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-gray-100">
        <span className="material-symbols-outlined text-[24px] text-gray-400">
          {hasFilters
            ? "search_off"
            : "inventory_2"}
        </span>
      </div>

      <h3 className="text-sm font-semibold text-gray-900">
        {hasFilters
          ? "No batches found"
          : "No batches yet"}
      </h3>

      <p className="mt-1 max-w-sm text-xs leading-5 text-gray-500">
        {hasFilters
          ? "No batches match your current search or filters."
          : "Create your first sneaker intake batch to get started."}
      </p>

      <div className="mt-4 flex items-center gap-2">
        {hasFilters && (
          <button
            type="button"
            onClick={onClearFilters}
            className="h-9 rounded-lg border border-gray-200 px-4 text-xs font-medium text-gray-600 transition hover:bg-gray-50 hover:text-gray-900"
          >
            Clear filters
          </button>
        )}

        {!hasFilters && (
          <button
            type="button"
            onClick={onCreate}
            className="h-9 rounded-lg bg-gray-900 px-4 text-xs font-medium text-white transition hover:bg-gray-800"
          >
            Create batch
          </button>
        )}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

function compareValues(
  a: string,
  b: string,
) {
  return a.localeCompare(
    b,
    undefined,
    {
      numeric: true,
      sensitivity: "base",
    },
  );
}

function compareDates(
  a: string | null,
  b: string | null,
) {
  if (!a && !b) {
    return 0;
  }

  if (!a) {
    return -1;
  }

  if (!b) {
    return 1;
  }

  return (
    new Date(a).getTime() -
    new Date(b).getTime()
  );
}

function formatDate(
  value: string | null,
) {
  if (!value) {
    return "Not received";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Not received";
  }

  return new Intl.DateTimeFormat(
    undefined,
    {
      day: "numeric",
      month: "short",
      year: "numeric",
    },
  ).format(date);
}

function formatStatus(status: string) {
  return status
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (letter) =>
      letter.toUpperCase(),
    );
}

function getActionTitle(
  actionType: ActionType | null,
) {
  switch (actionType) {
    case "open":
      return "Open batch?";

    case "close":
      return "Close batch?";

    case "delete":
      return "Delete batch?";

    default:
      return "";
  }
}

function getActionDescription(
  actionType: ActionType | null,
  batch: Batch | null,
) {
  const batchName =
    batch?.batch_id ??
    batch?.name ??
    "this batch";

  switch (actionType) {
    case "open":
      return `This will request that ${batchName} be opened. The backend will apply any lifecycle rules for the batch.`;

    case "close":
      return `This will request that ${batchName} be closed. Make sure you are ready to stop the batch before continuing.`;

    case "delete":
      return `This will permanently delete ${batchName}. If the batch has related records, the backend may prevent the deletion.`;

    default:
      return "";
  }
}

function getActionButtonLabel(
  actionType: ActionType | null,
) {
  switch (actionType) {
    case "open":
      return "Open batch";

    case "close":
      return "Close batch";

    case "delete":
      return "Delete batch";

    default:
      return "Confirm";
  }
}

function getActionErrorMessage(
  actionType: ActionType,
) {
  switch (actionType) {
    case "open":
      return "The batch could not be opened.";

    case "close":
      return "The batch could not be closed.";

    case "delete":
      return "The batch could not be deleted.";

    default:
      return "The batch action could not be completed.";
  }
}

function getErrorMessage(
  error: unknown,
  fallback: string,
) {
  if (
    typeof error === "object" &&
    error !== null &&
    "response" in error
  ) {
    const response = (
      error as {
        response?: {
          data?: {
            message?: string;
            error?: {
              message?: string;
            };
          };
        };
      }
    ).response;

    const message =
      response?.data?.error
        ?.message ??
      response?.data?.message;

    if (message) {
      return message;
    }
  }

  if (
    error instanceof Error &&
    error.message
  ) {
    return error.message;
  }

  return fallback;
}