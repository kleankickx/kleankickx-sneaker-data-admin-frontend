/*
 * Material vocabulary (SneakerMaterial.MaterialType on the backend) and
 * the shoe regions the Footwear Data Capture pipeline uses (fdc/vlm.py
 * REGIONS).
 */

export const MATERIAL_OPTIONS = [
  { value: "leather", label: "Leather (smooth)" },
  { value: "suede", label: "Suede" },
  { value: "nubuck", label: "Nubuck" },
  { value: "patent_leather", label: "Patent leather" },
  { value: "mesh", label: "Mesh" },
  { value: "knit", label: "Knit" },
  { value: "canvas", label: "Canvas" },
  { value: "textile", label: "Textile (other)" },
  { value: "synthetic", label: "Synthetic leather" },
  { value: "pu", label: "PU" },
  { value: "rubber", label: "Rubber" },
  { value: "eva", label: "EVA" },
  { value: "foam", label: "Foam" },
  { value: "plastic", label: "Plastic" },
  { value: "metal", label: "Metal" },
  { value: "other", label: "Other" },
] as const;

export const REGION_OPTIONS = [
  { value: "upper", label: "Upper" },
  { value: "toe_box", label: "Toe box" },
  { value: "overlays", label: "Overlays" },
  { value: "heel", label: "Heel" },
  { value: "collar", label: "Collar" },
  { value: "tongue", label: "Tongue" },
  { value: "lining", label: "Lining" },
  { value: "insole", label: "Insole" },
  { value: "midsole", label: "Midsole" },
  { value: "outsole", label: "Outsole" },
  { value: "laces", label: "Laces" },
  { value: "other", label: "Other" },
] as const;

export function materialLabel(value: string): string {
  return MATERIAL_OPTIONS.find((o) => o.value === value)?.label ?? value;
}

export function regionLabel(value: string): string {
  return REGION_OPTIONS.find((o) => o.value === value)?.label ?? (value || "Region not set");
}
