## Scope

Only step 2 from the previous plan: fix frontend error extraction. No backend or edge-function changes.

## Changes

### 1. New helper — `src/lib/extractFunctionError.ts`
Single async helper `extractFunctionError(err, fallback)` that returns a user-facing string. Handles every shape supabase-js `FunctionsHttpError` can take:

1. `err.context` is a `Response` (has `.clone()`) → `await res.clone().text()`, then `JSON.parse` guarded. Use `json.error || json.message` when available; otherwise use the raw text if it's short and non-HTML.
2. `err.context.response` is a `Response` → same treatment.
3. `err.context.body` is a string → try JSON-parse, then raw string.
4. `err.message` as last resort, but reject the generic supabase-js strings ("Edge function returned a non-2xx status code", "Failed to send a request to the Edge Function").
5. Final fallback: `"<fallback> (HTTP <status>). Please try again or contact your instructor."` using `err.context.status ?? response.status`, dropping the `(HTTP …)` segment when no status is available.

### 2. `src/pages/student/StudentOnboarding.tsx`
- Import the helper.
- In `handleSubmit`'s catch: replace the current `resp.clone().json()` block with `const msg = await extractFunctionError(err, "Signup failed");` then `setSubmitError(msg); toast.error(msg);`.
- Apply the same helper in the debounced `validate-enrollment-code` catch (`useEffect` at line 98) so validation errors also surface real messages: `setCodeError(await extractFunctionError(err, "Couldn't validate code"));`.

### 3. `src/components/AddCourseDialog.tsx`
Mirror the same two catches:
- Live-validation `catch` (line 46): `setError(await extractFunctionError(err, "Couldn't validate code"));`
- `submit` `catch` (line 78): `toast.error(await extractFunctionError(err, "Couldn't enroll"));`

Remove the existing ad-hoc `err?.context?.json?.()` / `resp.clone().json()` blocks in both files.

## Guarantee
The literal string "Edge function returned a non 2xx status code" (and the "Failed to send a request…" variant) will never reach the UI — the helper detects and replaces it with the fallback + HTTP status.

## Out of scope
- No edge-function edits (`student-pending-signup`, `validate-enrollment-code`, `enroll-additional-course` unchanged).
- No verification / test-run step.
