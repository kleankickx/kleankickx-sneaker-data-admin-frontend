import { useState, type KeyboardEvent, type ReactNode } from "react";

import { CAPTURE_ANGLES, type AngleSlot } from "../../lib/verification";

type LoadState = "loading" | "loaded" | "error";

function Placeholder({
  icon,
  title,
  text,
  children,
}: {
  icon: string;
  title: string;
  text: string;
  children?: ReactNode;
}) {
  return (
    <div className="flex h-full flex-col items-center justify-center px-6 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white shadow-sm">
        <span aria-hidden="true" className="material-symbols-outlined text-[28px] text-gray-400">
          {icon}
        </span>
      </div>
      <h3 className="mt-4 text-sm font-semibold text-gray-900">{title}</h3>
      <p className="mt-1 max-w-sm text-sm text-gray-500">{text}</p>
      {children}
    </div>
  );
}

/* Keyed by image id by the caller, so load state resets per photo. */
function MainImage({ slot, alt }: { slot: AngleSlot; alt: string }) {
  const [state, setState] = useState<LoadState>("loading");
  const [attempt, setAttempt] = useState(0);
  const url = slot.image?.image_url;

  if (!slot.image) {
    return (
      <Placeholder
        icon="hide_image"
        title={`No ${slot.label.toLowerCase()} photo`}
        text="This angle hasn't been captured for this pair."
      />
    );
  }

  if (!url) {
    return (
      <Placeholder
        icon="broken_image"
        title="Photo unavailable"
        text="The photo was uploaded but a link to it couldn't be created. Try refreshing the pair."
      />
    );
  }

  if (state === "error") {
    return (
      <Placeholder
        icon="broken_image"
        title="Couldn't load this photo"
        text="The image failed to load. Check your connection and try again."
      >
        <button
          type="button"
          onClick={() => {
            setState("loading");
            setAttempt((n) => n + 1);
          }}
          className="mt-4 inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 transition hover:bg-gray-50"
        >
          <span aria-hidden="true" className="material-symbols-outlined text-[16px]">refresh</span>
          Try again
        </button>
      </Placeholder>
    );
  }

  return (
    <>
      {state === "loading" && (
        <div
          className="absolute inset-0 flex items-center justify-center"
          aria-hidden="true"
        >
          <span aria-hidden="true" className="material-symbols-outlined animate-spin text-[28px] text-gray-300">
            progress_activity
          </span>
        </div>
      )}
      <img
        key={attempt}
        src={url}
        alt={alt}
        onLoad={() => setState("loaded")}
        onError={() => setState("error")}
        className={`h-full w-full object-contain transition-opacity duration-150 ${
          state === "loaded" ? "opacity-100" : "opacity-0"
        }`}
      />
    </>
  );
}

function Thumbnail({
  slot,
  selected,
  onSelect,
}: {
  slot: AngleSlot;
  selected: boolean;
  onSelect: () => void;
}) {
  const [broken, setBroken] = useState(false);
  const url = slot.image?.image_url;

  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      aria-label={`${slot.label}${slot.image ? "" : " (missing)"}`}
      className={`group relative overflow-hidden rounded-xl border-2 text-left transition ${
        selected
          ? "border-gray-900"
          : "border-transparent hover:border-gray-300"
      }`}
    >
      <div
        className={`flex aspect-square items-center justify-center ${
          slot.image ? "bg-gray-100" : "border border-dashed border-gray-300 bg-gray-50"
        }`}
      >
        {url && !broken ? (
          <img
            src={url}
            alt=""
            loading="lazy"
            onError={() => setBroken(true)}
            className="h-full w-full object-cover"
          />
        ) : (
          <span aria-hidden="true" className="material-symbols-outlined text-[22px] text-gray-400">
            {slot.image ? "broken_image" : "hide_image"}
          </span>
        )}
      </div>

      <p
        className={`truncate px-1 pb-1 pt-1.5 text-[11px] font-medium ${
          slot.image ? "text-gray-700" : "text-gray-400"
        }`}
      >
        {slot.label}
      </p>
    </button>
  );
}

/* Unique per slot; several "other" photos share one angle. */
function slotKey(slot: AngleSlot): string {
  return slot.image?.id ?? slot.angle;
}

/**
 * The pair's photos: a large viewer for the selected angle and a
 * thumbnail per angle, including placeholders for missing angles.
 * Arrow keys step through the angles while the viewer has focus.
 */
export default function ImageViewer({
  slots,
  pairLabel,
  actions,
}: {
  slots: AngleSlot[];
  pairLabel: string;
  actions?: ReactNode;
}) {
  const firstWithImage = slots.find((slot) => slot.image);
  // The angle is kept too, so a replaced photo stays selected.
  const [choice, setChoice] = useState(
    firstWithImage && {
      key: slotKey(firstWithImage),
      angle: firstWithImage.angle,
    },
  );
  const choose = (slot: AngleSlot) =>
    setChoice({ key: slotKey(slot), angle: slot.angle });

  const capturedCount = slots.filter(
    (slot, index) => index < CAPTURE_ANGLES.length && slot.image,
  ).length;
  const hasAny = slots.some((slot) => slot.image);

  const byKey = slots.findIndex((slot) => slotKey(slot) === choice?.key);
  const index = Math.max(
    0,
    byKey !== -1
      ? byKey
      : slots.findIndex((slot) => slot.angle === choice?.angle),
  );
  const selected = slots[index];

  function step(delta: number) {
    const next = (index + delta + slots.length) % slots.length;
    choose(slots[next]);
  }

  function handleKeyDown(event: KeyboardEvent) {
    if (event.key === "ArrowRight") {
      event.preventDefault();
      step(1);
    } else if (event.key === "ArrowLeft") {
      event.preventDefault();
      step(-1);
    }
  }

  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-gray-900">Photos</h2>
          <p className="mt-0.5 text-sm text-gray-500">
            {capturedCount} of {CAPTURE_ANGLES.length} angles captured
          </p>
        </div>
        {actions}
      </div>

      <div
        tabIndex={hasAny ? 0 : -1}
        onKeyDown={hasAny ? handleKeyDown : undefined}
        aria-label="Photo viewer. Use the arrow keys to change angle."
        className="relative mt-4 aspect-[4/3] overflow-hidden rounded-xl border border-gray-200 bg-gray-50 outline-none focus-visible:ring-2 focus-visible:ring-gray-300"
      >
        {!hasAny ? (
          <Placeholder
            icon="photo_camera"
            title="No photos available"
            text="No photos have been uploaded for this pair yet, so there is nothing to inspect."
          />
        ) : (
          <>
            <MainImage
              key={slotKey(selected)}
              slot={selected}
              alt={`${selected.label} view of ${pairLabel}`}
            />

            <span className="absolute left-3 top-3 inline-flex items-center gap-1.5 rounded-lg bg-black/70 px-2.5 py-1 text-xs font-medium text-white">
              <span aria-hidden="true" className="material-symbols-outlined text-[15px]">
                photo_camera
              </span>
              {selected.label}
            </span>

            {selected.image?.image_url && (
              <a
                href={selected.image.image_url}
                target="_blank"
                rel="noreferrer"
                aria-label="Open full size in a new tab"
                title="Open full size"
                className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-lg bg-white/90 text-gray-700 shadow-sm transition hover:bg-white"
              >
                <span aria-hidden="true" className="material-symbols-outlined text-[18px]">
                  open_in_full
                </span>
              </a>
            )}

            <div className="absolute inset-x-3 bottom-3 flex justify-between">
              {[
                { delta: -1, icon: "chevron_left", label: "Previous angle" },
                { delta: 1, icon: "chevron_right", label: "Next angle" },
              ].map(({ delta, icon, label }) => (
                <button
                  key={icon}
                  type="button"
                  onClick={() => step(delta)}
                  aria-label={label}
                  className="flex h-8 w-8 items-center justify-center rounded-full bg-white/90 text-gray-700 shadow-sm transition hover:bg-white"
                >
                  <span aria-hidden="true" className="material-symbols-outlined text-[20px]">
                    {icon}
                  </span>
                </button>
              ))}
            </div>
          </>
        )}
      </div>

      {hasAny && (
        <div className="mt-4 grid grid-cols-3 gap-2.5 sm:grid-cols-6">
          {slots.map((slot) => (
            <Thumbnail
              key={slotKey(slot)}
              slot={slot}
              selected={slot === selected}
              onSelect={() => choose(slot)}
            />
          ))}
        </div>
      )}
    </section>
  );
}
