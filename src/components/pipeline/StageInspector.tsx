import { useState, type ReactNode } from "react";

import type { PipelineStage } from "../../lib/api";
import { formatFileSize } from "../../lib/image-types";
import { FIELD_LABELS, duration } from "../../lib/monitor";
import {
  ANGLE_FOR_VIEW,
  ANGLE_TITLES,
  STAGE_META,
  STAGE_STATUS,
} from "../../lib/pipeline";

type Json = Record<string, unknown>;
type Field = { value: string | null; confidence: number; evidence?: string };

/* ------------------------------------------------------------------ */
/* Visual vocabulary: crop marks, mono tags, confidence bars           */
/* ------------------------------------------------------------------ */

/* Corner brackets, as on annotated training images. */
function CropMarks({ tone = "border-white/80" }: { tone?: string }) {
  const base = `pointer-events-none absolute h-4 w-4 ${tone}`;
  return (
    <>
      <span className={`${base} left-2 top-2 border-l-2 border-t-2`} />
      <span className={`${base} right-2 top-2 border-r-2 border-t-2`} />
      <span className={`${base} bottom-2 left-2 border-b-2 border-l-2`} />
      <span className={`${base} bottom-2 right-2 border-b-2 border-r-2`} />
    </>
  );
}

function Tag({ children, tone = "gray" }: { children: ReactNode; tone?: "gray" | "green" | "red" | "amber" | "sky" | "violet" }) {
  const tones = {
    gray: "bg-gray-900/80 text-white",
    green: "bg-emerald-600 text-white",
    red: "bg-red-600 text-white",
    amber: "bg-amber-500 text-white",
    sky: "bg-sky-600 text-white",
    violet: "bg-violet-600 text-white",
  };
  return (
    <span className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wide ${tones[tone]}`}>
      {children}
    </span>
  );
}

function ConfidenceBar({ value }: { value: number }) {
  const pct = Math.round(Math.max(0, Math.min(1, value)) * 100);
  const low = value < 0.8;
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-gray-100">
        <div
          className={`h-full origin-left rounded-full motion-safe:animate-grow-x ${low ? "bg-amber-500" : "bg-gray-800"}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className={`w-9 text-right font-mono text-xs tabular-nums ${low ? "text-amber-700" : "text-gray-600"}`}>
        {(value ?? 0).toFixed(2)}
      </span>
    </div>
  );
}

function Empty({ children }: { children: ReactNode }) {
  return <p className="rounded-xl border border-dashed border-gray-200 bg-gray-50 px-4 py-6 text-center text-sm text-gray-500">{children}</p>;
}

function PhotoTile({
  angle,
  url,
  children,
  scanning,
}: {
  angle: string;
  url?: string;
  children?: ReactNode;
  scanning?: boolean;
}) {
  return (
    <figure className="relative aspect-square overflow-hidden rounded-xl bg-gray-900">
      {url ? (
        <img src={url} alt={`${ANGLE_TITLES[angle] ?? angle} photo`} className="h-full w-full object-cover opacity-90" loading="lazy" />
      ) : (
        <div className="flex h-full items-center justify-center text-xs text-gray-500">No photo</div>
      )}
      <CropMarks />
      {scanning && (
        <span className="pointer-events-none absolute inset-x-0 h-0.5 bg-sky-400 shadow-[0_0_12px_2px_rgba(56,189,248,0.8)] motion-safe:animate-scan" />
      )}
      <figcaption className="absolute left-2 top-2 ml-4 mt-0.5">
        <Tag>{ANGLE_TITLES[angle] ?? angle}</Tag>
      </figcaption>
      {children}
    </figure>
  );
}

/* ------------------------------------------------------------------ */
/* Stage views                                                         */
/* ------------------------------------------------------------------ */

function LoadPhotos({ output, photos, running }: { output: Json | null; photos: Record<string, string>; running: boolean }) {
  const files = (output?.files as Array<{ view: string; angle: string; bytes: number }>) ?? [];
  const failed = (output?.failed as Array<{ angle: string }>) ?? [];
  const angles = files.length ? files.map((f) => f.angle) : Object.keys(photos);
  return (
    <div className="grid grid-cols-3 gap-3 sm:grid-cols-6">
      {angles.map((angle, i) => {
        const file = files.find((f) => f.angle === angle);
        return (
          <div key={angle} className="motion-safe:animate-fade-up" style={{ animationDelay: `${i * 60}ms` }}>
            <PhotoTile angle={angle} url={photos[angle]} scanning={running}>
              {file && (
                <span className="absolute bottom-2 right-2">
                  <Tag tone="green">
                    <span aria-hidden="true" className="material-symbols-outlined text-[11px]">download_done</span>
                    {formatFileSize(file.bytes)}
                  </Tag>
                </span>
              )}
            </PhotoTile>
          </div>
        );
      })}
      {failed.map((f) => (
        <PhotoTile key={`failed-${f.angle}`} angle={f.angle}>
          <span className="absolute bottom-2 right-2"><Tag tone="red">Download failed</Tag></span>
        </PhotoTile>
      ))}
    </div>
  );
}

const METRIC_LIMITS: Record<string, { label: string; max: number; min?: number }> = {
  sharpness: { label: "sharp", max: 600, min: 100 },
  brightness: { label: "bright", max: 255, min: 70 },
  bg_brightness: { label: "bg", max: 255, min: 150 },
};

function QualityCheck({ output, photos, running }: { output: Json | null; photos: Record<string, string>; running: boolean }) {
  const views = (output?.views as Record<string, { ok: boolean; issues: string[]; metrics?: Record<string, number> }>) ?? {};
  const missing = ((output?.missing_views as string[]) ?? []).filter((v) => v in ANGLE_FOR_VIEW);
  const entries = Object.keys(views).length
    ? Object.entries(views)
    : Object.keys(photos).map((angle) => [Object.keys(ANGLE_FOR_VIEW).find((v) => ANGLE_FOR_VIEW[v] === angle) ?? angle, null] as const);

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      {entries.map(([view, result], i) => {
        const angle = ANGLE_FOR_VIEW[view] ?? view;
        return (
          <div key={view} className="motion-safe:animate-fade-up" style={{ animationDelay: `${i * 60}ms` }}>
            <PhotoTile angle={angle} url={photos[angle]} scanning={running && !result}>
              {result && (
                <div className={`absolute inset-x-0 bottom-0 space-y-1 p-2 pt-8 ${result.ok ? "bg-gradient-to-t from-black/70" : "bg-gradient-to-t from-red-950/85"}`}>
                  <Tag tone={result.ok ? "green" : "red"}>{result.ok ? "Pass" : "Fail"}</Tag>
                  {result.issues.map((issue) => (
                    <p key={issue} className="font-mono text-[10px] leading-tight text-red-100">{issue}</p>
                  ))}
                  {result.metrics && (
                    <dl className="grid grid-cols-3 gap-1">
                      {Object.entries(METRIC_LIMITS).map(([key, m]) =>
                        result.metrics?.[key] !== undefined ? (
                          <div key={key}>
                            <dt className="font-mono text-[9px] uppercase text-white/60">{m.label}</dt>
                            <dd className="font-mono text-[10px] text-white">{Math.round(result.metrics[key])}</dd>
                            <div className="mt-0.5 h-0.5 bg-white/20">
                              <div
                                className={`h-full ${m.min !== undefined && result.metrics[key] < m.min ? "bg-red-400" : "bg-emerald-400"}`}
                                style={{ width: `${Math.min(100, (result.metrics[key] / m.max) * 100)}%` }}
                              />
                            </div>
                          </div>
                        ) : null,
                      )}
                    </dl>
                  )}
                </div>
              )}
            </PhotoTile>
          </div>
        );
      })}
      {missing.map((view) => (
        <PhotoTile key={`missing-${view}`} angle={ANGLE_FOR_VIEW[view]}>
          <span className="absolute bottom-2 left-2"><Tag tone="amber">Missing</Tag></span>
        </PhotoTile>
      ))}
    </div>
  );
}

type Box = [number, number, number, number];
type Region = { kind: "barcode" | "sku" | "size"; label: string; box: Box; confidence: number | null };
type Word = { text: string; confidence: number; box: Box | null };

const REGION_STYLE: Record<Region["kind"], { box: string; tag: string; name: string }> = {
  barcode: { box: "border-emerald-400 bg-emerald-400/10", tag: "bg-emerald-500", name: "Barcode" },
  sku: { box: "border-sky-400 bg-sky-400/10", tag: "bg-sky-500", name: "SKU" },
  size: { box: "border-amber-400 bg-amber-400/10", tag: "bg-amber-500", name: "Size" },
};

/* One id per finding, shared by its box and its row in the side panel. */
function regionId(r: Pick<Region, "kind" | "label">) {
  return r.kind === "size" ? `size:${r.label.split(" ")[0]}` : `${r.kind}:${r.label}`;
}

function at(box: Box) {
  const pct = (v: number) => `${Math.round(v * 10000) / 100}%`;
  return { left: pct(box[0]), top: pct(box[1]), width: pct(box[2]), height: pct(box[3]) };
}

/* A finding drawn where it was read: a box with its class label, as on an annotated training image. */
function RegionBox({ region, index, active, onHover }: { region: Region; index: number; active: boolean; onHover: (id: string | null) => void }) {
  const style = REGION_STYLE[region.kind];
  const below = region.box[1] < 0.06;
  return (
    <div
      data-testid="label-region"
      data-kind={region.kind}
      onMouseEnter={() => onHover(regionId(region))}
      onMouseLeave={() => onHover(null)}
      className={`absolute rounded-[3px] border-2 transition-shadow duration-200 motion-safe:animate-box-in ${style.box} ${
        active ? "z-10 shadow-[0_0_0_3px_rgba(255,255,255,0.85),0_0_18px_4px_rgba(255,255,255,0.35)]" : ""
      }`}
      style={{ ...at(region.box), animationDelay: `${150 + index * 120}ms` }}
    >
      <span
        className={`absolute -left-0.5 whitespace-nowrap rounded-sm px-1 py-px font-mono text-[10px] font-semibold leading-tight text-white ${style.tag} ${
          below ? "top-full mt-0.5" : "bottom-full mb-0.5"
        }`}
      >
        {style.name} {region.label}
        {region.confidence !== null && <span className="opacity-75"> {region.confidence.toFixed(2)}</span>}
      </span>
    </div>
  );
}

function LabelScan({ output, url, running, skipped }: { output: Json | null; url?: string; running: boolean; skipped: boolean }) {
  const [processed, setProcessed] = useState(false);
  const [showBoxes, setShowBoxes] = useState(true);
  const [showWords, setShowWords] = useState(false);
  const [active, setActive] = useState<string | null>(null);
  const barcodes = (output?.barcodes as Array<{ code: string; format?: string; checksum_valid: boolean; backend?: string }>) ?? [];
  const candidates = (output?.sku_candidates as Array<{ sku: string; brand_hint?: string; how?: string }>) ?? [];
  const sizes = (output?.sizes as Record<string, number | string>) ?? {};
  const text = ((output?.visible_text as string[]) ?? []).slice(0, 12);
  const regions = ((output?.regions as Region[]) ?? []).filter((r) => r.box);
  const words = ((output?.words as Word[]) ?? []).filter((w): w is Word & { box: Box } => Boolean(w.box));
  const imageSize = output?.image_size as [number, number] | undefined;
  const done = Boolean(output) && !skipped;
  // Boxes are fractions of the label image, so they line up only when the
  // frame has the image's own proportions.
  const canDraw = done && Boolean(url) && Boolean(imageSize?.[0] && imageSize?.[1]);
  const placed = new Set(regions.map(regionId));
  const findings = [
    ...barcodes.map((b) => `barcode:${b.code}`),
    ...candidates.slice(0, 3).map((c) => `sku:${c.sku}`),
    ...["US", "UK", "EUR", "CM", "JP"].filter((k) => sizes[k] !== undefined).map((k) => `size:${k}`),
  ];
  const unplaced = findings.filter((id) => !placed.has(id)).length;
  const hover = (id: string) => ({
    onMouseEnter: () => setActive(id),
    onMouseLeave: () => setActive(null),
  });
  const ring = (id: string) => (active === id ? "ring-2 ring-offset-1 ring-gray-900" : "");

  if (skipped) return <Empty>No label photo, so the label reader was skipped.</Empty>;

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <div>
        <div
          className={`relative overflow-hidden rounded-xl bg-gray-950 ${canDraw ? "" : "aspect-[4/5]"}`}
          style={canDraw && imageSize ? { aspectRatio: `${imageSize[0]} / ${imageSize[1]}` } : undefined}
        >
          {url ? (
            <img
              src={url}
              alt="Label photo"
              className={`h-full w-full transition-[filter] duration-500 ${canDraw ? "object-fill" : "object-contain"}`}
              style={processed ? { filter: "grayscale(1) contrast(2.6) brightness(1.15)" } : undefined}
            />
          ) : (
            <div className="flex h-full items-center justify-center text-sm text-gray-500">No label photo</div>
          )}
          {canDraw && showWords && (
            <div className="pointer-events-none absolute inset-0" aria-hidden="true">
              {words.map((w, i) => (
                <span
                  key={i}
                  data-testid="label-word"
                  className={`absolute border motion-safe:animate-fade-up ${w.confidence < 0.6 ? "border-dashed border-rose-300/80" : "border-white/70"}`}
                  style={{ ...at(w.box), animationDelay: `${Math.min(i, 40) * 12}ms` }}
                />
              ))}
            </div>
          )}
          {canDraw && showBoxes && (
            <div className="absolute inset-0">
              {regions.map((r, i) => (
                <RegionBox key={regionId(r)} region={r} index={i} active={active === regionId(r)} onHover={setActive} />
              ))}
            </div>
          )}
          {/* Measurement grid */}
          <div
            className="pointer-events-none absolute inset-0 opacity-30"
            style={{
              backgroundImage:
                "linear-gradient(rgba(56,189,248,.35) 1px, transparent 1px), linear-gradient(90deg, rgba(56,189,248,.35) 1px, transparent 1px)",
              backgroundSize: "32px 32px",
            }}
          />
          <CropMarks tone="border-sky-300" />
          {running && url && (
            <span className="pointer-events-none absolute inset-x-0 h-0.5 bg-sky-400 shadow-[0_0_16px_3px_rgba(56,189,248,0.9)] motion-safe:animate-scan" />
          )}
          <div className="absolute left-3 top-3 ml-4 flex gap-1.5">
            <Tag tone={running ? "sky" : done ? "green" : "gray"}>
              {running ? "Scanning…" : done ? "Scanned" : "Waiting"}
            </Tag>
            {done && <Tag>{String(output?.ocr_backend ?? "tesseract")}{output?.ocr_available === false ? " · off" : ""}</Tag>}
          </div>
        </div>
        <div className="mt-2 flex items-center justify-between gap-2">
          <div className="inline-flex rounded-lg bg-gray-100 p-0.5 text-xs" role="group" aria-label="Label view">
            {[
              { on: false, label: "Original" },
              { on: true, label: "Preprocessed" },
            ].map((option) => (
              <button
                key={option.label}
                type="button"
                aria-pressed={processed === option.on}
                onClick={() => setProcessed(option.on)}
                className={`rounded-md px-2.5 py-1 font-medium transition ${processed === option.on ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-800"}`}
              >
                {option.label}
              </button>
            ))}
          </div>
          {canDraw && (
            <div className="flex gap-1.5 text-xs">
              {[
                { label: "Boxes", on: showBoxes, set: setShowBoxes, count: regions.length },
                { label: "OCR words", on: showWords, set: setShowWords, count: words.length },
              ].map((layer) => (
                <button
                  key={layer.label}
                  type="button"
                  aria-pressed={layer.on}
                  disabled={!layer.count}
                  onClick={() => layer.set(!layer.on)}
                  className={`rounded-md border px-2 py-1 font-medium transition disabled:opacity-40 ${
                    layer.on ? "border-gray-900 bg-gray-900 text-white" : "border-gray-200 text-gray-600 hover:border-gray-400"
                  }`}
                >
                  {layer.label} <span className="font-mono opacity-60">{layer.count}</span>
                </button>
              ))}
            </div>
          )}
        </div>
        {processed && <p className="mt-1 text-[11px] text-gray-400">Approximates the OCR input: grayscale + threshold</p>}
        {canDraw && (
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-gray-500">
            {(Object.keys(REGION_STYLE) as Region["kind"][]).map((kind) => (
              <span key={kind} className="inline-flex items-center gap-1">
                <span className={`h-2.5 w-2.5 rounded-sm border-2 ${REGION_STYLE[kind].box}`} />
                {REGION_STYLE[kind].name}
              </span>
            ))}
            {unplaced > 0 && (
              <span className="text-gray-400">
                · {unplaced} finding{unplaced === 1 ? "" : "s"} read but not located on the photo
              </span>
            )}
          </div>
        )}
        {done && url && !imageSize && (
          <p className="mt-2 text-[11px] text-gray-400">This run predates label boxes. Re-run the label reader to see where each finding was read.</p>
        )}
      </div>

      <div className="space-y-4">
        <section className="motion-safe:animate-fade-up">
          <h4 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-gray-500">
            <span aria-hidden="true" className="material-symbols-outlined text-[16px]">barcode</span> Barcode
          </h4>
          {barcodes.length ? (
            <ul className="mt-2 space-y-1.5">
              {barcodes.map((b) => (
                <li key={b.code} {...hover(`barcode:${b.code}`)} className={`flex flex-wrap items-center gap-2 rounded-lg border border-gray-200 px-3 py-2 transition ${ring(`barcode:${b.code}`)}`}>
                  {placed.has(`barcode:${b.code}`) && <span aria-hidden="true" className="h-2.5 w-2.5 rounded-sm border-2 border-emerald-400 bg-emerald-400/10" />}
                  <span className="font-mono text-sm font-semibold tracking-wider text-gray-900">{b.code}</span>
                  <Tag tone={b.checksum_valid ? "green" : "red"}>{b.checksum_valid ? "Checksum ok" : "Bad checksum"}</Tag>
                  {b.format && <span className="font-mono text-[10px] text-gray-400">{b.format}{b.backend ? ` · ${b.backend}` : ""}</span>}
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-1 text-sm text-gray-500">{done ? "No barcode decoded." : "—"}</p>
          )}
        </section>

        <section className="motion-safe:animate-fade-up" style={{ animationDelay: "80ms" }}>
          <h4 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-gray-500">
            <span aria-hidden="true" className="material-symbols-outlined text-[16px]">sell</span> Style code candidates
          </h4>
          {candidates.length ? (
            <ul className="mt-2 flex flex-wrap gap-1.5">
              {candidates.map((c, i) => (
                <li key={c.sku} {...hover(`sku:${c.sku}`)} className={`rounded-lg border px-2.5 py-1.5 transition ${ring(`sku:${c.sku}`)} ${i === 0 ? "border-gray-900 bg-gray-900 text-white" : "border-gray-200 text-gray-800"}`}>
                  {placed.has(`sku:${c.sku}`) && <span aria-hidden="true" className="mr-1.5 inline-block h-2.5 w-2.5 rounded-sm border-2 border-sky-400 bg-sky-400/10 align-middle" />}
                  <span className="font-mono text-sm font-semibold">{c.sku}</span>
                  {c.brand_hint && <span className={`ml-1.5 text-[11px] ${i === 0 ? "text-white/70" : "text-gray-500"}`}>{c.brand_hint}</span>}
                  {c.how && c.how !== "pattern" && <span className={`ml-1 text-[10px] ${i === 0 ? "text-white/60" : "text-gray-400"}`}>({c.how})</span>}
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-1 text-sm text-gray-500">{done ? "No style code read." : "—"}</p>
          )}
        </section>

        <section className="motion-safe:animate-fade-up" style={{ animationDelay: "160ms" }}>
          <h4 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-gray-500">
            <span aria-hidden="true" className="material-symbols-outlined text-[16px]">straighten</span> Sizes
            {output?.size_consistency ? (
              <Tag tone={output.size_consistency === "consistent" ? "green" : output.size_consistency === "inconsistent" ? "red" : "amber"}>
                {String(output.size_consistency)}
              </Tag>
            ) : null}
          </h4>
          {Object.keys(sizes).filter((k) => k !== "US_gender").length ? (
            <dl className="mt-2 grid grid-cols-4 gap-2">
              {["US", "UK", "EUR", "CM"].filter((k) => sizes[k] !== undefined).map((k) => (
                <div key={k} {...hover(`size:${k}`)} className={`rounded-lg border px-2 py-1.5 text-center transition ${ring(`size:${k}`)} ${placed.has(`size:${k}`) ? "border-amber-300" : "border-gray-200"}`}>
                  <dt className="font-mono text-[10px] text-gray-400">{k}</dt>
                  <dd className="text-sm font-semibold text-gray-900">{String(sizes[k])}</dd>
                </div>
              ))}
            </dl>
          ) : (
            <p className="mt-1 text-sm text-gray-500">{done ? "No sizes read." : "—"}</p>
          )}
        </section>

        {text.length > 0 && (
          <section className="motion-safe:animate-fade-up" style={{ animationDelay: "240ms" }}>
            <h4 className="text-xs font-semibold uppercase tracking-wide text-gray-500">OCR tokens</h4>
            <ul className="mt-2 flex flex-wrap gap-1">
              {text.map((t) => (
                <li key={t} className="rounded bg-gray-100 px-1.5 py-0.5 font-mono text-[11px] text-gray-700">{t}</li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </div>
  );
}

function CatalogLookup({ output, label }: { output: Json | null; label: Json | null }) {
  const row = output?.row as Record<string, string> | null | undefined;
  const barcodeHits = (output?.barcode_hits as Array<{ code: string }>) ?? [];
  const keys = [
    ...((label?.barcodes as Array<{ code: string; checksum_valid: boolean }>) ?? [])
      .filter((b) => b.checksum_valid).map((b) => ({ kind: "Barcode", value: b.code })),
    ...((label?.sku_candidates as Array<{ sku: string }>) ?? []).map((c) => ({ kind: "SKU", value: c.sku })),
  ];
  if (!output) return <Empty>Not looked up yet.</Empty>;
  return (
    <div className="grid items-center gap-4 sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1.3fr)]">
      <div className="space-y-1.5">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-gray-500">Lookup keys</h4>
        {keys.length ? keys.map((k) => (
          <div key={`${k.kind}-${k.value}`} className="flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-2">
            <Tag>{k.kind}</Tag>
            <span className="font-mono text-sm text-gray-900">{k.value}</span>
          </div>
        )) : <p className="text-sm text-gray-500">No barcode or SKU from the label.</p>}
      </div>
      <span aria-hidden="true" className={`material-symbols-outlined hidden text-[28px] sm:block ${row ? "text-emerald-600" : "text-gray-300"}`}>
        {row ? "east" : "block"}
      </span>
      {row ? (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-4 motion-safe:animate-fade-up">
          <div className="flex items-center gap-2">
            <Tag tone="green">Catalog hit</Tag>
            <span className="text-xs text-emerald-800">via {barcodeHits.length ? "barcode" : "SKU"}</span>
          </div>
          <p className="mt-2 text-lg font-semibold text-gray-900">{row.brand} {row.model}</p>
          <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
            <dt className="text-gray-500">SKU</dt><dd className="font-mono text-gray-900">{row.sku}</dd>
            {row.colorway && (<><dt className="text-gray-500">Colorway</dt><dd className="text-gray-900">{row.colorway}</dd></>)}
            {row.materials && (<><dt className="text-gray-500">Materials</dt><dd className="text-gray-900">{row.materials.split(";").join(", ")}</dd></>)}
            {row.upc && (<><dt className="text-gray-500">UPC</dt><dd className="font-mono text-gray-900">{row.upc}</dd></>)}
          </dl>
        </div>
      ) : (
        <div className="rounded-xl border border-dashed border-gray-300 p-4 text-sm text-gray-600 motion-safe:animate-fade-up">
          No match among {String(output.catalog_size ?? 0)} catalog entries. Brand, model and colorway will come from the vision model.
        </div>
      )}
    </div>
  );
}

function VisionModel({ stage, photos }: { stage: PipelineStage; photos: Record<string, string> }) {
  const output = stage.output;
  if (stage.status === "skipped") return <Empty>The vision model is turned off for this run.</Empty>;
  if (stage.status === "failed") {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
        <p className="font-semibold">The vision model call failed; the run continued label-only.</p>
        <p className="mt-1 font-mono text-xs">{String(output?.error ?? stage.error)}</p>
      </div>
    );
  }
  const out = (output?.output as Json) ?? null;
  const fields = ["brand", "model", "colorway", "condition"] as const;
  const materials = (out?.materials as Array<{ material: string; region?: string; confidence: number }>) ?? [];
  const defects = (out?.defects as Array<{ type: string; severity: string; view: string }>) ?? [];
  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
      <div>
        <div className="grid grid-cols-3 gap-2">
          {Object.entries(photos).map(([angle, url]) => (
            <PhotoTile key={angle} angle={angle} url={url} scanning={stage.status === "running"} />
          ))}
        </div>
        {output && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            <Tag tone="sky">{String(output.provider ?? "provider")}</Tag>
            <Tag>{String(output.model ?? "model")}</Tag>
            <Tag tone="violet">{String(output.prompt_version ?? "")}</Tag>
          </div>
        )}
      </div>
      <div className="space-y-3">
        {out ? (
          <>
            {fields.map((name, i) => {
              const f = out[name] as Field | undefined;
              return f ? (
                <div key={name} className="motion-safe:animate-fade-up" style={{ animationDelay: `${i * 70}ms` }}>
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-xs text-gray-500">{FIELD_LABELS[name]}</span>
                    <span className="truncate text-sm font-semibold text-gray-900">{f.value ?? "—"}</span>
                  </div>
                  <ConfidenceBar value={f.confidence} />
                </div>
              ) : null;
            })}
            {materials.length > 0 && (
              <div>
                <p className="text-xs text-gray-500">Materials</p>
                <ul className="mt-1 flex flex-wrap gap-1">
                  {materials.map((m, i) => (
                    <li key={i} className="rounded-md bg-gray-100 px-2 py-0.5 text-xs text-gray-700">
                      {m.material}{m.region ? ` · ${m.region.replace("_", " ")}` : ""}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {defects.length > 0 && (
              <div>
                <p className="text-xs text-gray-500">Defects</p>
                <ul className="mt-1 flex flex-wrap gap-1">
                  {defects.map((d, i) => (
                    <li key={i}><Tag tone={d.severity === "severe" ? "red" : d.severity === "moderate" ? "amber" : "gray"}>{d.type.replaceAll("_", " ")} · {ANGLE_FOR_VIEW[d.view] ?? d.view}</Tag></li>
                  ))}
                </ul>
              </div>
            )}
          </>
        ) : (
          <Empty>{stage.status === "running" ? "Waiting for the model's answer…" : "Not run yet."}</Empty>
        )}
      </div>
    </div>
  );
}

const SOURCE_HINTS: Array<[RegExp, string, "green" | "sky" | "violet" | "amber" | "gray"]> = [
  [/catalog/i, "Catalog", "green"],
  [/barcode/i, "Barcode", "green"],
  [/ocr/i, "OCR", "sky"],
  [/vision model|view/i, "Vision", "violet"],
];

function Fusion({ output }: { output: Json | null }) {
  if (!output) return <Empty>Not fused yet.</Empty>;
  const result = output.result as Record<string, Field> & { limitations: string[] };
  const trace = ((output.debug as Json)?.sku_trace as string[]) ?? [];
  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
      <ul className="space-y-2.5">
        {(["brand", "model", "sku", "size", "colorway", "condition"] as const).map((name, i) => {
          const f = result[name];
          const source = SOURCE_HINTS.find(([re]) => re.test(f.evidence ?? ""));
          return (
            <li key={name} className="motion-safe:animate-fade-up" style={{ animationDelay: `${i * 60}ms` }}>
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs text-gray-500">{FIELD_LABELS[name]}</span>
                <span className="flex min-w-0 items-center gap-1.5">
                  {source && <Tag tone={source[2]}>{source[1]}</Tag>}
                  <span className="truncate text-sm font-semibold text-gray-900">{f.value ?? "—"}</span>
                </span>
              </div>
              <ConfidenceBar value={f.confidence} />
            </li>
          );
        })}
      </ul>
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <Tag tone={output.schema_valid ? "green" : "red"}>{output.schema_valid ? "Schema valid" : "Schema invalid"}</Tag>
        </div>
        <div>
          <h4 className="text-xs font-semibold uppercase tracking-wide text-gray-500">SKU decision trace</h4>
          {trace.length ? (
            <ol className="mt-2 space-y-1.5 border-l-2 border-gray-200 pl-3">
              {trace.map((t, i) => <li key={i} className="text-sm text-gray-700">{t}</li>)}
            </ol>
          ) : (
            <p className="mt-1 text-sm text-gray-500">The first source tried was used.</p>
          )}
        </div>
        {result.limitations?.length > 0 && (
          <div>
            <h4 className="text-xs font-semibold uppercase tracking-wide text-gray-500">Limitations</h4>
            <ul className="mt-1 list-disc space-y-0.5 pl-4 text-sm text-gray-700">
              {result.limitations.map((l) => <li key={l}>{l}</li>)}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}

function SaveRoute({ output }: { output: Json | null }) {
  if (!output) return <Empty>Not saved yet.</Empty>;
  const low = (output.low_fields as string[]) ?? [];
  const tone = output.test_run
    ? { box: "border-violet-200 bg-violet-50", icon: "science", text: "text-violet-800", title: "Test run saved", body: "Kept apart: the pair's current result, the review queue and the catalog are unchanged." }
    : output.needs_review
      ? { box: "border-amber-200 bg-amber-50", icon: "rule", text: "text-amber-800", title: "Sent to the review queue", body: "A person needs to check the low-confidence fields." }
      : { box: "border-emerald-200 bg-emerald-50", icon: "task_alt", text: "text-emerald-800", title: "Saved as the current result", body: "Every key field is at or above 0.8." };
  return (
    <div className={`flex items-start gap-4 rounded-xl border p-5 motion-safe:animate-fade-up ${tone.box}`}>
      <span aria-hidden="true" className={`material-symbols-outlined text-[36px] ${tone.text}`}>{tone.icon}</span>
      <div>
        <p className={`text-base font-semibold ${tone.text}`}>{tone.title}</p>
        <p className="mt-0.5 text-sm text-gray-700">{tone.body}</p>
        {low.length > 0 && (
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <span className="text-xs text-gray-500">{output.test_run ? "Would need review:" : "Below 0.8:"}</span>
            {low.map((f) => <Tag key={f} tone="amber">{FIELD_LABELS[f] ?? f}</Tag>)}
          </div>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */

/**
 * Everything about one stage: what it does, its status and a view of
 * its output built for that stage, plus the raw saved output.
 */
export default function StageInspector({
  stage,
  stages,
  photos,
}: {
  stage: PipelineStage;
  stages: PipelineStage[];
  /* Our angle -> photo URL. */
  photos: Record<string, string>;
}) {
  const meta = STAGE_META[stage.stage];
  const status = STAGE_STATUS[stage.status];
  const running = stage.status === "running";
  const output = stage.output;
  const label = stages.find((s) => s.stage === 3)?.output ?? null;

  let view: ReactNode;
  switch (stage.stage) {
    case 1: view = <LoadPhotos output={output} photos={photos} running={running} />; break;
    case 2: view = <QualityCheck output={output} photos={photos} running={running} />; break;
    case 3: view = <LabelScan output={output} url={photos.label} running={running} skipped={stage.status === "skipped" && Boolean(output)} />; break;
    case 4: view = <CatalogLookup output={output} label={label} />; break;
    case 5: view = <VisionModel stage={stage} photos={photos} />; break;
    case 6: view = <Fusion output={output} />; break;
    default: view = <SaveRoute output={output} />;
  }

  const notRun = stage.status === "skipped" && !output;
  const raw = stage.stage === 5 && output && "raw" in output ? output.raw : undefined;
  const rest = stage.stage === 5 && output ? Object.fromEntries(Object.entries(output).filter(([k]) => k !== "raw")) : output;

  return (
    <section key={`${stage.stage}-${stage.status}`} className="motion-safe:animate-fade-up" aria-live="polite">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-gray-900 text-white">
            <span aria-hidden="true" className="material-symbols-outlined text-[22px]">{meta.icon}</span>
          </span>
          <div>
            <h3 className="text-base font-semibold text-gray-900">
              {stage.stage}. {stage.name}
            </h3>
            <p className="text-sm text-gray-500">{meta.about}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <span className={`font-medium ${status.text}`}>{status.label}</span>
          {stage.duration_ms !== null && stage.status !== "reused" && <span className="text-gray-400">{duration(stage.duration_ms)}</span>}
          {stage.reused_from_run && <span className="text-xs text-violet-700">from run {stage.reused_from_run.slice(0, 8)}</span>}
        </div>
      </header>

      {stage.summary && (
        <p className="mt-3 rounded-lg bg-gray-50 px-3 py-2 font-mono text-xs text-gray-700">{stage.summary}</p>
      )}
      {stage.error && stage.stage !== 5 && (
        <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{stage.error}</p>
      )}

      <div className="mt-4">{notRun ? <Empty>{stage.summary || "Not run."}</Empty> : view}</div>

      {output && (
        <details className="mt-4">
          <summary className="cursor-pointer text-xs font-medium text-gray-500 hover:text-gray-800">Full stage output</summary>
          <pre className="mt-2 max-h-80 overflow-auto rounded-lg bg-gray-950 p-3 font-mono text-[11px] leading-relaxed text-emerald-200">
            {JSON.stringify(rest, null, 2)}
          </pre>
          {raw !== undefined && (
            <details className="mt-2">
              <summary className="cursor-pointer text-xs font-medium text-gray-500 hover:text-gray-800">Vision model raw JSON</summary>
              <pre className="mt-2 max-h-80 overflow-auto rounded-lg bg-gray-950 p-3 font-mono text-[11px] leading-relaxed text-sky-200">
                {JSON.stringify(raw, null, 2)}
              </pre>
            </details>
          )}
        </details>
      )}
    </section>
  );
}
