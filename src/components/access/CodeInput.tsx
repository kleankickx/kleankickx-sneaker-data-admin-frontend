/** A one-time code field: digits only for authenticator codes. */
export function CodeInput({
  value,
  onChange,
  label,
  allowRecovery = false,
  autoFocus,
}: {
  value: string;
  onChange: (value: string) => void;
  label: string;
  /* Recovery codes look like "abcde-fghjk". */
  allowRecovery?: boolean;
  autoFocus?: boolean;
}) {
  return (
    <div>
      <label htmlFor="one-time-code" className="mb-1.5 block text-sm font-medium text-gray-700">{label}</label>
      <input
        id="one-time-code"
        value={value}
        onChange={(event) =>
          onChange(
            allowRecovery
              ? event.target.value.slice(0, 11)
              : event.target.value.replace(/\D/g, "").slice(0, 6),
          )
        }
        inputMode={allowRecovery ? "text" : "numeric"}
        autoComplete="one-time-code"
        autoCapitalize="none"
        spellCheck={false}
        autoFocus={autoFocus}
        placeholder={allowRecovery ? "abcde-fghjk" : "123456"}
        className="h-12 w-full rounded-lg border border-gray-300 px-3 text-center font-mono text-xl tracking-[0.4em] outline-none placeholder:tracking-normal placeholder:text-gray-300 focus:border-gray-500 focus:ring-2 focus:ring-gray-200"
      />
    </div>
  );
}
