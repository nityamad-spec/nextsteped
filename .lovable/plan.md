# Roster invite emails

Add a "Send invites" action on the enrollment step so professors can email every approved roster student step-by-step instructions for signing up.

## What the professor sees

On `/teacher/setup/enrollment`, in the roster card:

- A **Send invites** button showing how many students haven't been invited yet ("Send invites (42 pending)"). Uploading a CSV, pasting emails, or syncing a sheet stays silent — nothing sends until the button is clicked.
- A confirmation dialog listing the recipient count before sending.
- Per-row status in the roster table: "Invited 5 Aug" or "Not invited", plus a **Resend** action on each row.
- A progress indicator while sending, then a summary toast ("Sent 42, 1 failed").

## The email

Sent from `info@nextsteped.com`, subject like "You're invited to join <Course name> on NextStep".

Body contains:
1. Greeting with the student's name when the roster has one.
2. Course name and course code.
3. The enrollment code, shown large and copyable.
4. Numbered instructions: go to the site, choose **I'm New Here** as a student, enter your details, enter the enrollment code, verify your email, take the short diagnostic.
5. A primary button linking straight to the student signup page (`https://app.nextsteped.com/intro/student`).

## Prerequisite: sender domain

The project has no sender domain yet, so no email can go out until that's set up. Emails will be sent from a delegated subdomain of `nextsteped.com` (e.g. `notify.nextsteped.com`), with `info@nextsteped.com` as the visible From address. Setup is a one-time DNS step; I'll surface the setup dialog when we start building, and the rest of the work can proceed while DNS verifies.

## Technical notes

- **Migration**: add `invited_at timestamptz` and `invite_count int not null default 0` to `course_roster_allowlist`. No new table.
- **Email infrastructure**: run the standard email infra setup (queue, send log, suppression list, unsubscribe tokens, queue worker), then scaffold the app-email function set.
- **Template**: new React Email template `course-invite.tsx` in `supabase/functions/_shared/transactional-email-templates/`, registered in `registry.ts`. Props: `studentName?`, `courseName`, `courseCode?`, `enrollmentCode`, `signupUrl`, `professorName?`. Styled off `src/index.css` tokens, white body background.
- **Send path**: the button in `EnrollmentSettings.tsx` iterates the pending roster rows and invokes `send-transactional-email` **once per recipient** (small concurrency, e.g. 5 at a time) with `idempotencyKey: \`course-invite-${rosterRowId}\`` — one send per recipient, not a bulk job, so retries and suppression work per student.
- After each successful send, stamp `invited_at = now()` and increment `invite_count` on that roster row.
- Unsubscribe footer is appended automatically; the template must not add its own.
- Add the unsubscribe confirmation page at the path the scaffold reserves.

## Risks and constraints

- **DNS is the gating item.** Nothing sends until `nextsteped.com` delegation verifies (can take up to 72 hours). Everything else can be built and deployed in the meantime.
- **Large rosters take time.** A 500-student roster means 500 sequential invocations; the UI must stay responsive and resumable (re-clicking only targets rows still lacking `invited_at`). Queue throughput is roughly 120 emails/min, so a large roster drips out over several minutes.
- **Deliverability**: these are transactional invites tied to a specific student being added to a specific course — that's compliant. Reusing this button as a general "message my class" broadcast would not be, so the copy stays enrollment-only.
- **Bounces** on wrong roster addresses land in the suppression list; those students will show as invited but won't receive anything. The roster row status shows the last attempt, not delivery confirmation.
- Test-instance sends work as soon as DNS verifies; the published Live app gets its queue worker on the next publish.
