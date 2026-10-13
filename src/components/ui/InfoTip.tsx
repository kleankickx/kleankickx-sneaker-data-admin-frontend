import { useEffect, useId, useState, type ReactNode } from "react";

/**
 * A small "?" that explains something on hover, focus or tap.
 *
 *   <h3>Pairs by images uploaded <InfoTip>Counts the 6 required angles…</InfoTip></h3>
 */
export default function InfoTip({
  children,
  label = "More information",
  side = "top",
  className = "",
}: {
  children: ReactNode;
  /* Accessible name of the "?" button. */
  label?: string;
  side?: "top" | "bottom";
  className?: string;
}) {
  const id = useId();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <span
      className={`relative inline-flex align-middle ${className}`}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        type="button"
        aria-label={label}
        aria-describedby={open ? id : undefined}
        aria-expanded={open}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        className="inline-flex h-4 w-4 items-center justify-center rounded-full text-gray-400 transition hover:text-gray-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-gray-400"
      >
        <span aria-hidden="true" className="material-symbols-outlined text-[15px] leading-none">help</span>
      </button>
      {open && (
        <span
          id={id}
          role="tooltip"
          className={`absolute left-1/2 z-50 w-64 -translate-x-1/2 rounded-lg bg-gray-900 px-3 py-2 text-left text-xs font-normal normal-case leading-5 tracking-normal text-white shadow-xl ${
            side === "top" ? "bottom-full mb-2" : "top-full mt-2"
          }`}
        >
          {children}
        </span>
      )}
    </span>
  );
}
