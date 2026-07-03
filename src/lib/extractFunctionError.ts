// Robust error-message extractor for supabase-js `functions.invoke` failures.
// Handles the various shapes `FunctionsHttpError` can take across versions:
//   - err.context is a `Response` (has clone/text/json/status)
//   - err.context.response is the `Response`
//   - err.context.body is a string
// Never returns the raw "Edge function returned a non-2xx status code" message —
// falls back to "<fallback> (HTTP <status>). Please try again or contact your instructor."
export async function extractFunctionError(
  err: any,
  fallback = "Request failed",
): Promise<string> {
  const ctx = err?.context;
  const response: Response | undefined =
    ctx && typeof (ctx as any).clone === "function"
      ? (ctx as Response)
      : ctx?.response && typeof ctx.response.clone === "function"
        ? (ctx.response as Response)
        : undefined;

  const status: number | undefined =
    response?.status ?? ctx?.status ?? ctx?.response?.status;

  // 1) Try to parse the response body as JSON, then plain text.
  if (response) {
    try {
      const text = await response.clone().text();
      if (text) {
        try {
          const json = JSON.parse(text);
          const msg = json?.error || json?.message;
          if (typeof msg === "string" && msg.trim()) return msg;
        } catch {
          if (text.length < 500 && !text.trim().startsWith("<")) return text;
        }
      }
    } catch {
      /* ignore body read errors */
    }
  }

  // 2) Fallback: err.context.body as a string.
  if (typeof ctx?.body === "string" && ctx.body.trim()) {
    try {
      const json = JSON.parse(ctx.body);
      const msg = json?.error || json?.message;
      if (typeof msg === "string" && msg.trim()) return msg;
    } catch {
      if (ctx.body.length < 500) return ctx.body;
    }
  }

  // 3) Last resort: err.message, but never the generic supabase-js strings.
  const raw: string | undefined = err?.message;
  const isGeneric =
    !raw ||
    /edge function returned a non[-\s]?2xx status code/i.test(raw) ||
    /failed to send a request to the edge function/i.test(raw);

  if (!isGeneric && typeof raw === "string") return raw;

  return status
    ? `${fallback} (HTTP ${status}). Please try again or contact your instructor.`
    : `${fallback}. Please try again or contact your instructor.`;
}
