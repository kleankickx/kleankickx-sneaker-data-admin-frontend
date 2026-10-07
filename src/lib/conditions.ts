/*
 * Sneaker pair condition grades. Values match SneakerPair.Condition on
 * the backend; labels are UI copy.
 */

export const CONDITION_OPTIONS = [
  { value: "unknown", label: "Unknown" },
  { value: "a", label: "A — Like new" },
  { value: "b", label: "B — Good" },
  { value: "c", label: "C — Fair" },
  { value: "d", label: "D — Poor" },
] as const;

export type Condition = (typeof CONDITION_OPTIONS)[number]["value"];

export const DEFAULT_CONDITION: Condition = "unknown";
