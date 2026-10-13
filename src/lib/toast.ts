/**
 * Pop-up notifications ("toasts") for things that happened: saves,
 * failures, background work finishing. Call from anywhere:
 *
 *   toast.success("Batch created.");
 *   toast.error("Couldn't save.", { title: "Export failed" });
 *   toast.info("Bulk run finished", { action: { label: "View", to: "/..." } });
 *
 * <Toaster /> (in the admin layout) shows them.
 */

export type ToastTone = "success" | "error" | "info" | "warning";

export interface ToastAction {
  label: string;
  /* An in-app link, or a callback. */
  to?: string;
  onClick?: () => void;
}

export interface Toast {
  id: number;
  tone: ToastTone;
  message: string;
  title?: string;
  action?: ToastAction;
  /* ms; 0 keeps it until dismissed. */
  duration: number;
}

export interface ToastOptions {
  title?: string;
  action?: ToastAction;
  duration?: number;
}

const DEFAULT_DURATION: Record<ToastTone, number> = {
  success: 4000,
  info: 6000,
  warning: 8000,
  error: 8000,
};
const MAX_VISIBLE = 4;

type Listener = (toasts: Toast[]) => void;

let toasts: Toast[] = [];
let nextId = 1;
const listeners = new Set<Listener>();

function emit() {
  for (const listener of listeners) listener(toasts);
}

function show(tone: ToastTone, message: string, options: ToastOptions = {}): number {
  const id = nextId++;
  const item: Toast = {
    id,
    tone,
    message,
    title: options.title,
    action: options.action,
    duration: options.duration ?? DEFAULT_DURATION[tone],
  };
  // Same message again: replace it rather than stacking duplicates.
  toasts = [...toasts.filter((t) => !(t.message === message && t.tone === tone)), item].slice(-MAX_VISIBLE);
  emit();
  return id;
}

export function dismissToast(id: number) {
  toasts = toasts.filter((t) => t.id !== id);
  emit();
}

export function subscribeToasts(listener: Listener): () => void {
  listeners.add(listener);
  listener(toasts);
  return () => {
    listeners.delete(listener);
  };
}

export const toast = {
  success: (message: string, options?: ToastOptions) => show("success", message, options),
  error: (message: string, options?: ToastOptions) => show("error", message, options),
  info: (message: string, options?: ToastOptions) => show("info", message, options),
  warning: (message: string, options?: ToastOptions) => show("warning", message, options),
  dismiss: dismissToast,
  /* Tests: start from no toasts. */
  reset() {
    toasts = [];
    emit();
  },
};
