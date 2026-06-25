# Re-enable Roll Number and Branch on `/student/onboarding`

## Changes (`src/pages/student/StudentOnboarding.tsx`)

1. **Roll Number input (line 222)** — remove `disabled`.
2. **Branch select (line 251)** — replace `disabled` with `disabled={!degreeId || branches.length === 0}` so it auto-enables once a degree (with branches) is picked.
3. **`isValid` (lines 133–139)** — add `rollNumber.trim()` and `branchId` so the submit button stays disabled until both are filled. This also resolves the existing 400 ("String must contain at least 1 character(s)") error from `student-pending-signup`, which already requires both fields.

No backend/schema changes. No other call sites are affected.

## Verification

- Reload `/student/onboarding`: Roll Number is typeable; Branch enables after picking a Degree.
- Submit button stays disabled until Roll Number, Branch, and the other required fields are filled.
- Submitting with all fields filled succeeds (no 400) and navigates to `/student/verify-email`.
