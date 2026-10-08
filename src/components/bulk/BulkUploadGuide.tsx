import { useState, type ReactNode } from "react";

import { ANGLE_HINTS, ANGLE_LABELS, REQUIRED_ANGLES } from "../../lib/angles";
import { formatFileSize } from "../../lib/image-types";

function Icon({ name, className = "" }: { name: string; className?: string }) {
  return (
    <span
      className={`material-symbols-outlined ${className}`}
      aria-hidden="true"
    >
      {name}
    </span>
  );
}

function Tip({ children }: { children: ReactNode }) {
  return (
    <p className="flex gap-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900">
      <Icon name="lightbulb" className="text-[16px]" />
      <span>{children}</span>
    </p>
  );
}

function Rule({ ok, children }: { ok: boolean; children: ReactNode }) {
  return (
    <li className="flex gap-2">
      <Icon
        name={ok ? "check_circle" : "cancel"}
        className={`mt-px text-[16px] ${ok ? "text-green-600" : "text-red-500"}`}
      />
      <span>{children}</span>
    </li>
  );
}

function Code({ children }: { children: ReactNode }) {
  return (
    <code className="rounded bg-gray-100 px-1 py-0.5 text-[12px] text-gray-800">
      {children}
    </code>
  );
}

function FolderTree() {
  return (
    <pre className="overflow-x-auto rounded-lg border border-gray-200 bg-gray-50 p-3 text-[12px] leading-5 text-gray-800">
{`intake-2026-10-07/        ← drop this folder
├── pair-001/             ← one folder per pair
│   ├── lateral.jpg        ← all of the LEFT shoe
│   ├── medial.jpg
│   ├── front.jpg
│   ├── label.jpg
│   ├── top.jpg
│   └── sole.jpg
├── pair-002/
│   ├── lateral.heic
│   └── … (all six angles)
└── pair-003/
    └── …`}
    </pre>
  );
}

const NAME_EXAMPLES: Array<[string, string, string]> = [
  ["pair-2-top.jpg", "pair-2", "top"],
  ["Pair_003_LATERAL.HEIC", "pair-3", "lateral"],
  ["pair-4-left.jpg", "pair-4", "lateral (older name)"],
  ["KKX-PAIR-00000042-sole.jpg", "KKX-PAIR-00000042", "sole"],
  ["img-4823-front.JPG", "img-4823", "front"],
  ["IMG_4823.HEIC", "—", "—  (assign by hand)"],
];

function steps(maxFileSize: number | null): Array<{
  title: string;
  icon: string;
  body: ReactNode;
}> {
  const limit = maxFileSize
    ? `${formatFileSize(maxFileSize)} per photo`
    : "the server's size limit per photo";

  return [
    {
      title: "Shoot six angles for every pair",
      icon: "photo_camera",
      body: (
        <>
          <p>
            Each pair needs exactly one photo of each of these six angles.
            A pair can't be uploaded until all six are there.
          </p>
          <ul className="grid gap-2 sm:grid-cols-2">
            {REQUIRED_ANGLES.map((angle) => (
              <li
                key={angle}
                className="rounded-lg border border-gray-200 px-3 py-2"
              >
                <p className="text-sm font-medium text-gray-900">
                  {ANGLE_LABELS[angle]}{" "}
                  <span className="font-normal text-gray-400">({angle})</span>
                </p>
                <p className="text-xs text-gray-500">{ANGLE_HINTS[angle]}</p>
              </li>
            ))}
          </ul>
          <Tip>
            The words in brackets are what the uploader looks for in file
            names. Naming photos after their angle (e.g.{" "}
            <Code>sole.jpg</Code>) saves you sorting them by hand later.
          </Tip>
        </>
      ),
    },
    {
      title: "Easiest: one folder per pair",
      icon: "folder",
      body: (
        <>
          <p>
            Put each pair's six photos in their own folder, name each photo
            after its angle, then drop the parent folder (or use{" "}
            <strong>Choose folder</strong>).
          </p>
          <FolderTree />
          <ul className="space-y-1.5">
            <Rule ok>
              Folder names can be anything (<Code>pair-001</Code>,{" "}
              <Code>Nike AF1 white</Code>); they're shown in the review so you
              can tell pairs apart.
            </Rule>
            <Rule ok>
              Folders inside folders are fine; each pair folder is used on
              its own.
            </Rule>
            <Rule ok={false}>
              Don't put more than one pair's photos in the same folder unless
              the file names say which pair they belong to (see next step).
            </Rule>
            <Rule ok={false}>
              Two photos of the same angle in one folder: the first is used,
              the extra goes to <strong>Unassigned</strong>.
            </Rule>
          </ul>
        </>
      ),
    },
    {
      title: "Or: loose files with pair names",
      icon: "description",
      body: (
        <>
          <p>
            Photos can also sit together in one folder (or be picked with{" "}
            <strong>Choose files</strong>) as long as each name contains the
            pair and the angle.
          </p>
          <div className="overflow-x-auto rounded-lg border border-gray-200">
            <table className="w-full text-left text-xs">
              <thead className="bg-gray-50 text-gray-500">
                <tr>
                  <th className="px-3 py-2 font-medium">File name</th>
                  <th className="px-3 py-2 font-medium">Pair</th>
                  <th className="px-3 py-2 font-medium">Angle</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 text-gray-700">
                {NAME_EXAMPLES.map(([name, pair, angle]) => (
                  <tr key={name}>
                    <td className="px-3 py-1.5">
                      <Code>{name}</Code>
                    </td>
                    <td className="px-3 py-1.5">{pair}</td>
                    <td className="px-3 py-1.5">{angle}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <ul className="space-y-1.5">
            <Rule ok>
              Upper or lower case both work, and <Code>-</Code>,{" "}
              <Code>_</Code> or spaces can separate the parts.
            </Rule>
            <Rule ok={false}>
              The angle must be its own word: <Code>myfront.jpg</Code> is
              not recognised; <Code>my-front.jpg</Code> is.
            </Rule>
            <Rule ok={false}>
              A name with two angles (<Code>top-sole.jpg</Code>) is ambiguous;
              you'll pick the angle yourself.
            </Rule>
          </ul>
          <Tip>
            Straight-from-the-camera names like <Code>IMG_4823.HEIC</Code>{" "}
            carry no pair or angle. They still upload: they land in{" "}
            <strong>Unassigned</strong> and you place them by hand.
          </Tip>
        </>
      ),
    },
    {
      title: "File types and sizes",
      icon: "image",
      body: (
        <ul className="space-y-1.5">
          <Rule ok>
            JPEG, PNG, WebP and HEIC (iPhone) photos, up to {limit}.
          </Rule>
          <Rule ok>
            Other files (videos, PDFs) are skipped and you'll see how many.
            System files like <Code>.DS_Store</Code> and{" "}
            <Code>Thumbs.db</Code> are ignored.
          </Rule>
          <Rule ok>
            HEIC photos may show a file icon instead of a preview in Chrome
            or Firefox. That's only the preview; they upload normally.
          </Rule>
          <Rule ok={false}>
            Photos over the size limit are flagged in red during review.
            Export or resize them, then use the swap button on the tile to
            replace them.
          </Rule>
        </ul>
      ),
    },
    {
      title: "Review and fix before uploading",
      icon: "fact_check",
      body: (
        <>
          <p>
            After you add files you'll see one card per pair. Nothing is
            uploaded until you press <strong>Start upload</strong>.
          </p>
          <ul className="space-y-2 text-sm">
            <li className="flex gap-2">
              <Icon name="add_photo_alternate" className="text-[18px] text-gray-500" />
              <span>
                <strong>Dashed tile</strong>: that angle is missing. Click it
                to pick the photo.
              </span>
            </li>
            <li className="flex gap-2">
              <Icon name="swap_horiz" className="text-[18px] text-gray-500" />
              <span>
                <strong>Swap</strong> replaces a photo with another file.
              </span>
            </li>
            <li className="flex gap-2">
              <Icon name="close" className="text-[18px] text-gray-500" />
              <span>
                <strong>Remove</strong> takes a photo off the pair and moves
                it to Unassigned, so you can put it somewhere else.
              </span>
            </li>
            <li className="flex gap-2">
              <Icon name="error" className="text-[18px] text-red-500" />
              <span>
                A <strong>red card</strong> lists what's wrong (missing
                angles, oversized photos). Every issue must be fixed.
              </span>
            </li>
            <li className="flex gap-2">
              <Icon name="add" className="text-[18px] text-gray-500" />
              <span>
                <strong>Add pair</strong> creates an empty card, useful when
                your photos came in with camera names.
              </span>
            </li>
          </ul>
          <div className="rounded-lg border border-gray-200 p-3">
            <p className="text-sm font-medium text-gray-900">
              Placing Unassigned photos
            </p>
            <ol className="mt-1.5 list-decimal space-y-1 pl-5 text-sm">
              <li>Find the photo in the Unassigned list (check its preview).</li>
              <li>
                Choose the <strong>Pair</strong> and the <strong>Angle</strong>{" "}
                (pre-filled when the name had one).
              </li>
              <li>
                Press <strong>Assign</strong>. If that angle already had a
                photo, the old one moves back to Unassigned.
              </li>
              <li>
                Press <strong>Discard</strong> for photos you don't need
                (blurry shots, duplicates).
              </li>
            </ol>
          </div>
          <Tip>
            Brand, model, SKU, size and condition are optional. Brand and
            model are used to label the pair in the progress panel.
          </Tip>
          <p className="text-sm">
            <strong>Start upload</strong> unlocks when every pair has all six
            photos with no issues and the Unassigned list is empty.
          </p>
        </>
      ),
    },
    {
      title: "Uploading and tracking progress",
      icon: "cloud_upload",
      body: (
        <ul className="space-y-1.5">
          <Rule ok>
            The window closes and a progress panel appears at the bottom
            right. You can keep working in other pages of the app.
          </Rule>
          <Rule ok={false}>
            Keep this browser tab open until the upload finishes. Closing or
            reloading the tab stops it.
          </Rule>
          <Rule ok>
            If photos fail, the panel opens and shows why. Use{" "}
            <strong>Retry pair</strong> or <strong>Retry all failed</strong>;
            only the failed photos are sent again.
          </Rule>
          <Rule ok>
            <strong>Cancel</strong> stops photos that haven't uploaded yet;
            they can be retried from the panel.
          </Rule>
          <Rule ok>
            When the upload finishes, the batch's pair list refreshes with the
            new pairs.
          </Rule>
          <Rule ok={false}>
            Only one bulk upload runs at a time. Wait for the current one
            before starting another.
          </Rule>
        </ul>
      ),
    },
  ];
}

export default function BulkUploadGuide({
  maxFileSize,
  initialStep = 0,
  onClose,
}: {
  maxFileSize: number | null;
  initialStep?: number;
  onClose: () => void;
}) {
  const all = steps(maxFileSize);
  const [index, setIndex] = useState(
    Math.min(Math.max(initialStep, 0), all.length - 1),
  );
  const step = all[index];
  const last = index === all.length - 1;

  return (
    <section
      aria-labelledby="bulk-guide-title"
      className="flex min-h-0 flex-1 flex-col"
    >
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-6 text-sm text-gray-700">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gray-900 text-white">
            <Icon name={step.icon} className="text-[20px]" />
          </span>
          <div>
            <p className="text-xs font-medium text-gray-500">
              Step {index + 1} of {all.length}
            </p>
            <h3
              id="bulk-guide-title"
              className="text-base font-semibold text-gray-900"
            >
              {step.title}
            </h3>
          </div>
        </div>
        {step.body}
      </div>

      <div className="flex shrink-0 items-center justify-between gap-3 border-t border-gray-200 px-6 py-4">
        <div className="flex gap-1.5" aria-hidden="true">
          {all.map((s, i) => (
            <span
              key={s.title}
              className={`h-1.5 w-6 rounded-full ${
                i === index ? "bg-gray-900" : "bg-gray-200"
              }`}
            />
          ))}
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-3 py-2 text-sm font-medium text-gray-500 transition hover:bg-gray-100 hover:text-gray-800"
          >
            Skip guide
          </button>
          {index > 0 && (
            <button
              type="button"
              onClick={() => setIndex(index - 1)}
              className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50"
            >
              Back
            </button>
          )}
          <button
            type="button"
            onClick={() => (last ? onClose() : setIndex(index + 1))}
            className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-gray-800"
          >
            {last ? "Got it" : "Next"}
          </button>
        </div>
      </div>
    </section>
  );
}
