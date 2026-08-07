# Fix course invite "Get started" link

## Problem
The "Get started" button in the course invitation email currently links to the Lovable preview/publish origin (`window.location.origin`) instead of the production custom domain. The email template itself defaults to `https://app.nextsteped.com/intro/student`, but the roster invite flow in `EnrollmentSettings.tsx` overrides `signupUrl` with `${window.location.origin}/intro/student`.

## Change
1. In `src/pages/teacher/EnrollmentSettings.tsx`, replace the dynamic `signupUrl` override with the fixed production URL: `https://app.nextsteped.com/intro/student`.
2. Do not change the email template default; it already points to the correct domain.
3. Verify no other user-facing email or share link in the invite flow relies on `window.location.origin`.

## Risks
- Local/preview testing of invite emails will no longer open the local preview app. This is the intended behavior for production invites.
- If the custom domain ever changes, this URL becomes a second hardcoded place to update (the template is the first).

## Verification
- Send a test invite from the enrollment settings page.
- Inspect the received email and confirm the "Get started" button href is `https://app.nextsteped.com/intro/student`.
