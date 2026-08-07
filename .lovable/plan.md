# Roster invite emails

Short answer: no. Adding students to the roster today only stores their email on the approved list — nothing is emailed to them. The sender domain is verified and the email queue is healthy, but the app-email sending function, the invite template, and the "Send invites" action were never built.

## What this adds

On `/teacher/setup/enrollment`, in the roster card:

- A **Send invites** button labelled with how many students haven't been invited yet ("Send invites (42 pending)"). Uploading a CSV or pasting emails stays silent — nothing sends until the button is clicked.
- A confirmation dialog showing the recipient count.
- Per-row status in the roster table: "Invited 7 Aug" or "Not invited", plus a **Resend** action per row.
- Progress while sending, then a summary toast ("Sent 42, 1 failed").

## The email

From the verified sender domain, subject "You're invited to join <Course name> on NextStep".

Contents:
1. Greeting with the student's name when the roster has one.
2. Course name and course code.
3. The enrollment code, shown large.
4. Numbered steps: go to the site, choose **I'm New Here** as a student, enter your details, enter the enrollment code, verify your email, set a password, take the short diagnostic.
5. A button linking to `https://app.nextsteped.com/intro/student`.

## Technical notes

- Migration: add `invited_at timestamptz` and `invite_count int not null default 0` to `course_roster_allowlist`. No new table.
- Scaffold the app-email function set (send function, unsubscribe handler, suppression webhook, sample templates). The queue worker already exists.
- New template `course-invite.tsx` in `supabase/functions/_shared/transactional-email-templates/`, registered in `registry.ts`. Props: `studentName?`, `courseName`, `courseCode?`, `enrollmentCode`, `signupUrl`, `professorName?`. Styled from `src/index.css` tokens, white body background, no self-added unsubscribe footer.
- Send path in `EnrollmentSettings.tsx`: iterate pending roster rows and invoke `send-transactional-email` once per recipient (concurrency ~5) with `idempotencyKey: course-invite-<rosterRowId>`, so retries and suppression work per student.
- After each success, stamp `invited_at = now()` and increment `invite_count` on that row.
- Add the unsubscribe confirmation page at the path the scaffold reserves.
- Deploy the affected edge functions after the template work.

## Risks and constraints

- Large rosters drip out: throughput is roughly 120 emails/min, so 500 students takes several minutes. Re-clicking only targets rows still lacking `invited_at`, so it's resumable.
- Bounced addresses land in the suppression list; those rows show as invited but never deliver. Row status reflects the last attempt, not delivery.
- This stays enrollment-only — reusing the button as a general "message my class" broadcast would be a marketing send and isn't supported.
- Test/dev sends work immediately; the published Live app picks up its queue worker on the next publish.
