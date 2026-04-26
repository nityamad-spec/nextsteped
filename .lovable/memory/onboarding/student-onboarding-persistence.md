---
name: Student onboarding & multi-course flow
description: New vs. returning split, sequential gated onboarding, per-course diagnostic isolation, and in-dashboard course switcher
type: feature
---
**Landing**
- Two clearly differentiated CTAs per role: "I'm New Here" → intro page; "Welcome Back — Log In" → /auth.

**New student flow (strictly sequential)**
1. `/intro/student` — informational only.
2. `/student/onboarding` — profile + enrollment code. Code is validated live via `validate-enrollment-code` edge function before submit is enabled. Submit calls `student-pending-signup` which stages the row in `pending_signups` and triggers a Supabase invite email.
3. `/student/verify-email?email=...` — confirmation screen with resend.
4. `/reset-password` — invite link lands here. On submit, if `pending_signups` row exists for the email, calls `complete-student-signup` to materialize profile + enrollment, then redirects to `/student/diagnostic?course=<id>`.
5. `/student/diagnostic?course=<id>` — course-specific. Resolves course from URL param > localStorage > newest enrollment. Persists `profiles.active_course_id`.
6. `/student/home` — default thereafter.

**Returning student flow**
- Login → `StudentRedirect` → `/student/home` (skips intro/onboarding/diagnostic).

**Multi-course enrollment**
- `StudentCourseSwitcher` lives at top of `StudentLayout` sidebar (and mobile header). Lists all enrollments; switching writes `localStorage.enrolledCourseId` + `profiles.active_course_id`.
- "Add a Course" opens `AddCourseDialog`. Live code validation, then `enroll-additional-course` edge function creates the enrollment and routes to `/student/diagnostic?course=<id>`.

**Per-course isolation**
- `diagnostic_results.course_id` is required (NOT NULL). One diagnostic per (student, course).
- `useStudentStatus` returns `activeCourseId` (prefers `profiles.active_course_id`, else newest enrollment) and `hasDiagnostic` scoped to that course. `StudentRedirect` uses it to gate.

**Edge functions**
- `validate-enrollment-code` — anonymous code lookup.
- `student-pending-signup` — stages profile in `pending_signups`, triggers invite email.
- `complete-student-signup` — consumes `pending_signups` row, creates profile + enrollment.
- `enroll-additional-course` — adds new enrollment for an existing student.

**Schema additions**
- `pending_signups` table (email-keyed staging).
- `profiles.active_course_id`.
- `diagnostic_results.course_id` NOT NULL.
