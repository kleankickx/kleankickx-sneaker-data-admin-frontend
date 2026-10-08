/*
 * Sneaker pair condition grades: the 5-grade rubric from the Footwear
 * Data Capture pipeline. Values match SneakerPair.Condition on the
 * backend; labels match the rubric's grade names.
 *
 * Pairs graded on the retired A-D scale keep that grade in
 * legacy_condition and stay "unknown" until a reviewer picks one of
 * these.
 */

export const CONDITION_OPTIONS = [
  { value: "unknown", label: "Unknown" },
  { value: "new", label: "New/Deadstock" },
  { value: "like_new", label: "Like New" },
  { value: "good", label: "Good" },
  { value: "fair", label: "Fair" },
  { value: "poor", label: "Poor" },
] as const;

export type Condition = (typeof CONDITION_OPTIONS)[number]["value"];

export const DEFAULT_CONDITION: Condition = "unknown";

/* The grades a verified pair can have (everything but unknown). */
export const GRADE_OPTIONS = CONDITION_OPTIONS.filter(
  (option) => option.value !== DEFAULT_CONDITION,
);

/* The pipeline's grade name ("Like New") as a stored value. */
export function conditionFromGrade(grade: string | null | undefined) {
  return GRADE_OPTIONS.find((option) => option.label === grade)?.value ?? null;
}

export function conditionLabel(value: string | null | undefined): string {
  return (
    CONDITION_OPTIONS.find((option) => option.value === value)?.label ??
    (value ? value.toUpperCase() : "Unknown")
  );
}
