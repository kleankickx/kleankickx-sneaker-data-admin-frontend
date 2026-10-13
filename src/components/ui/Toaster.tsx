import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";

import { dismissToast, subscribeToasts, type Toast, type ToastTone } from "../../lib/toast";

const TONE: Record<ToastTone, { icon: string; iconClass: string; border: string }> = {
  success: { icon: "check_circle", iconClass: "text-emerald-600", border: "border-emerald-200" },
  error: { icon: "error", iconClass: "text-red-600", border: "border-red-200" },
  warning: { icon: "warning", iconClass: "text-amber-600", border: "border-amber-200" },
  info: { icon: "info", iconClass: "text-sky-600", border: "border-sky-200" },
};

function ToastItem({ toast }: { toast: Toast }) {
  const [paused, setPaused] = useState(false);
  const remaining = useRef(toast.duration);
  const started = useRef(0);

  // Auto-dismiss, paused while hovered or focused so it can be read.
  useEffect(() => {
    if (!toast.duration || paused) return;
    started.current = Date.now();
    const timer = window.setTimeout(() => dismissToast(toast.id), remaining.current);
    return () => {
      window.clearTimeout(timer);
      remaining.current -= Date.now() - started.current;
    };
  }, [toast.id, toast.duration, paused]);

  const tone = TONE[toast.tone];
  const urgent = toast.tone === "error" || toast.tone === "warning";

  return (
    <li
      role={urgent ? "alert" : "status"}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
      className={`pointer-events-auto flex w-full items-start gap-3 rounded-xl border bg-white p-4 shadow-xl motion-safe:animate-fade-up ${tone.border}`}
    >
      <span aria-hidden="true" className={`material-symbols-outlined text-[20px] ${tone.iconClass}`}>{tone.icon}</span>
      <div className="min-w-0 flex-1">
        {toast.title && <p className="text-sm font-semibold text-gray-900">{toast.title}</p>}
        <p className={`text-sm ${toast.title ? "text-gray-600" : "font-medium text-gray-800"}`}>{toast.message}</p>
        {toast.action && (
          toast.action.to ? (
            <Link
              to={toast.action.to}
              onClick={() => dismissToast(toast.id)}
              className="mt-1.5 inline-block text-sm font-medium text-gray-900 underline underline-offset-2"
            >
              {toast.action.label}
            </Link>
          ) : (
            <button
              type="button"
              onClick={() => {
                toast.action?.onClick?.();
                dismissToast(toast.id);
              }}
              className="mt-1.5 text-sm font-medium text-gray-900 underline underline-offset-2"
            >
              {toast.action.label}
            </button>
          )
        )}
      </div>
      <button
        type="button"
        onClick={() => dismissToast(toast.id)}
        aria-label="Dismiss notification"
        className="text-gray-400 transition hover:text-gray-700"
      >
        <span aria-hidden="true" className="material-symbols-outlined text-[18px]">close</span>
      </button>
    </li>
  );
}

/** Shows the notifications raised with toast.*(); mount once, inside the router. */
export default function Toaster() {
  const [items, setItems] = useState<Toast[]>([]);

  useEffect(() => subscribeToasts(setItems), []);

  return (
    <section aria-label="Notifications" className="pointer-events-none fixed inset-x-0 top-0 z-[70] flex justify-center p-4 sm:inset-x-auto sm:right-0 sm:justify-end">
      <ol className="flex w-full max-w-sm flex-col gap-2">
        {items.map((item) => (
          <ToastItem key={item.id} toast={item} />
        ))}
      </ol>
    </section>
  );
}
