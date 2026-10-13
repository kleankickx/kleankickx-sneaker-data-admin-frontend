import { useEffect, useId, useRef, type ReactNode } from "react";

export interface ConfirmOptions {
  title: string;
  message?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  /* "danger" for destructive actions (red button). */
  tone?: "primary" | "danger";
  icon?: string;
}

/** A confirmation modal; use it through useConfirm(). */
export default function ConfirmDialog({
  title,
  message,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  tone = "primary",
  icon,
  onConfirm,
  onCancel,
}: ConfirmOptions & { onConfirm: () => void; onCancel: () => void }) {
  const titleId = useId();
  const messageId = useId();
  const cancelRef = useRef<HTMLButtonElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);

  // Focus the safe choice for destructive actions; restore focus after.
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    (tone === "danger" ? cancelRef : confirmRef).current?.focus();
    return () => previous?.focus?.();
  }, [tone]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.stopPropagation();
        onCancel();
      }
      // Keep Tab inside the dialog.
      if (event.key === "Tab") {
        const buttons = [cancelRef.current, confirmRef.current].filter(Boolean) as HTMLElement[];
        const index = buttons.indexOf(document.activeElement as HTMLElement);
        event.preventDefault();
        buttons[(index + (event.shiftKey ? buttons.length - 1 : 1)) % buttons.length]?.focus();
      }
    }
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onCancel]);

  const danger = tone === "danger";

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4" onClick={onCancel}>
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={message ? messageId : undefined}
        className="w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-2xl motion-safe:animate-fade-up"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start gap-4 px-6 pt-6">
          <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full ${danger ? "bg-red-100" : "bg-gray-100"}`}>
            <span aria-hidden="true" className={`material-symbols-outlined text-[22px] ${danger ? "text-red-600" : "text-gray-700"}`}>
              {icon ?? (danger ? "warning" : "help")}
            </span>
          </div>
          <div className="min-w-0 flex-1">
            <h2 id={titleId} className="text-base font-semibold text-gray-900">{title}</h2>
            {message && <div id={messageId} className="mt-1.5 text-sm leading-6 text-gray-500">{message}</div>}
          </div>
        </div>
        <div className="mt-6 flex justify-end gap-2 border-t border-gray-100 bg-gray-50/60 px-6 py-4">
          <button
            ref={cancelRef}
            type="button"
            onClick={onCancel}
            className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50"
          >
            {cancelLabel}
          </button>
          <button
            ref={confirmRef}
            type="button"
            onClick={onConfirm}
            className={`rounded-lg px-4 py-2 text-sm font-medium text-white transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 ${
              danger ? "bg-red-600 hover:bg-red-700 focus-visible:outline-red-600" : "bg-gray-900 hover:bg-gray-800 focus-visible:outline-gray-900"
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
