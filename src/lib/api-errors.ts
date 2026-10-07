/*
 * Reads the backend's error envelope ({ success: false, error: {
 * message, fields } }) into something a form can show.
 */

export interface ApiFormError<Field extends string = string> {
  message: string;
  fields: Partial<Record<Field, string>>;
}

export function readApiError<Field extends string = string>(
  error: unknown,
  fallback = "Could not save changes.",
): ApiFormError<Field> {
  const e = error as {
    response?: {
      data?: {
        error?: { message?: string; fields?: Record<string, unknown> };
      };
    };
  };
  const body = e?.response?.data?.error;

  const fields: Record<string, string> = {};
  for (const [field, value] of Object.entries(body?.fields ?? {})) {
    fields[field] = Array.isArray(value) ? String(value[0]) : String(value);
  }

  // A non-field error (e.g. "These fields can't be edited") reads best
  // as the main message.
  const nonField = fields.non_field_errors;
  delete fields.non_field_errors;

  // Only server-written messages are shown; a network failure has no
  // body, so it gets the friendly fallback instead of Axios's text.
  return {
    message: nonField || body?.message || fallback,
    fields: fields as ApiFormError<Field>["fields"],
  };
}
