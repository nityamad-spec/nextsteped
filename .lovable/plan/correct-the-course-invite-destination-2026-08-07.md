# Correct the course-invite destination

## Confirmed cause

The invitation currently supplies `https://app.nextsteped.com/intro/student` from `EnrollmentSettings.tsx`, and the email template uses the same URL as its default. This does not match the requested exact destination, `https://app.nextsteped.com`.

## Implementation

1. Replace the course-invite destination in both the enrollment sender and the template fallback/preview data with `https://app.nextsteped.com`.
2. Keep the destination absolute and independent of the preview or published Lovable origin.
3. Deploy the updated app-email function so newly generated emails use the corrected template.
4. Render or send a fresh test invitation and inspect the generated button link to confirm its `href` is exactly `https://app.nextsteped.com`.

## Important constraint

Emails already delivered contain fixed HTML and cannot be updated. A new invitation or resend must be generated after deployment to receive the corrected link. Cached or previously opened emails may continue showing the old destination.