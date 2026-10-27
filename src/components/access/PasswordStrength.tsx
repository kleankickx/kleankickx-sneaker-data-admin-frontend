import { MIN_PASSWORD_LENGTH, STRENGTH_LEVELS, passwordStrength } from "../../lib/password";

/** The meter and hint under a new-password field. */
export default function PasswordStrength({ password, hintId }: { password: string; hintId: string }) {
  const score = password ? passwordStrength(password) : -1;
  return (
    <>
      {score >= 0 && (
        <div className="mt-2 flex items-center gap-2" aria-live="polite">
          <div className="flex flex-1 gap-1">
            {[0, 1, 2, 3, 4].map((i) => (
              <span key={i} className={`h-1 flex-1 rounded-full ${i < Math.max(score, 1) ? STRENGTH_LEVELS[score].bar : "bg-gray-200"}`} />
            ))}
          </div>
          <span className="w-20 text-right text-xs text-gray-500">{STRENGTH_LEVELS[score].label}</span>
        </div>
      )}
      <p id={hintId} className="mt-1 text-xs text-gray-500">
        At least {MIN_PASSWORD_LENGTH} characters. A few unrelated words make a strong, memorable password.
      </p>
    </>
  );
}
