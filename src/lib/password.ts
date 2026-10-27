/** Password rules shared by changing and resetting a password. */

export const MIN_PASSWORD_LENGTH = 10;

/** 0 (too short) to 5 (very strong). */
export function passwordStrength(password: string) {
  if (password.length < MIN_PASSWORD_LENGTH) return 0;
  let score = 1;
  if (password.length >= 14) score += 1;
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score += 1;
  if (/\d/.test(password)) score += 1;
  if (/[^A-Za-z0-9]/.test(password)) score += 1;
  return score;
}

export const STRENGTH_LEVELS = [
  { label: "Too short", bar: "bg-red-500" },
  { label: "Weak", bar: "bg-red-500" },
  { label: "Fair", bar: "bg-amber-500" },
  { label: "Good", bar: "bg-amber-400" },
  { label: "Strong", bar: "bg-emerald-500" },
  { label: "Very strong", bar: "bg-emerald-600" },
];
