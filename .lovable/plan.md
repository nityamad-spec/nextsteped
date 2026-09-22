# Voice-enabled behavioural mock interviews (OneCompiler)

Turn the Behavioural card in the Mock Interview Lab into a real voice interview: the student talks to an AI interviewer, and gets a scored report afterwards that is saved to their account.

## What the student sees

On `/student/career-readiness` → Practice, the Behavioural card opens the existing Ready screen with the prep tips. "Start interview" then opens the live interview room in the page: the interviewer speaks the questions, the student answers out loud, and the browser asks for microphone permission once.

When the interview ends, the report appears in the current review layout, filled with real results:
- Overall score and a one-line verdict
- Strengths and things to improve
- Per-question breakdown with the student's answer and its score
- Per-skill scores (communication, structure, and so on)

Finished interviews are listed under "Recent mocks" with their real score and date, and clicking one reopens its report. The demo entries for Behavioural are removed; the other four mock types keep their current behaviour for now.

The completed counter for Behavioural counts real finished interviews against the professor's target.

## What the professor controls

No new screens. The behavioural mock type the professor already configures in Soft Skills (title, minutes, prompt) becomes the interviewer's private brief, together with the course's target role. Editing it in Soft Skills changes the next interview a student starts.

## What you need to provide

A OneCompiler API account with the AI Interviewer enabled, and its API key. Their AI interview embedding runs on the enterprise user model, which is a paid plan (their published enterprise tiers start at $100/month, and each interview consumes credits). I will ask for the key through the secure secret form once you approve this plan.

If the key is missing or their service rejects a request, the card shows a plain message saying voice interviews are unavailable, and nothing else in Career Readiness breaks.

## Technical details

Database migration:
- `onecompiler_users` — one row per student: `user_id`, OneCompiler `external_user_id`, `user_token`, timestamps. RLS: students read their own row; writes are service-role only (edge functions).
- `mock_interview_sessions` — `id`, `student_id`, `course_id`, `mock_type_id`, `oc_session_id`, `status` (`active` | `completed`), `score`, `feedback` jsonb, `started_at`, `completed_at`. RLS: students select/insert their own rows; teachers of the course may read (aggregate view later). GRANTs for `authenticated` and `service_role` on both tables.

Secret: `ONECOMPILER_API_KEY` (server-side only).

Edge functions (all call `https://onecompiler.com/v1/...` with `X-API-Key`, never from the browser):
- `start-mock-interview` — verifies the caller's enrollment, provisions/reuses their OneCompiler user (`POST /v1/users`, storing `api.token`), upserts a custom interview from the professor's behavioural mock type (`POST/PUT /v1/ai-interviewer/interviews` with `kind: "talk"`, `mins`, `skills`, private `brief`), creates a session (`POST /v1/ai-interviewer/sessions` with `custom: true`, `mode: "voice"`), records the row, and returns `embedUrl` plus the user token.
- `finish-mock-interview` — called on the `interviewFinished` event; fetches `GET /v1/ai-interviewer/sessions/:id` server-side and stores `score` and `feedback`. Non-OK responses are surfaced with their status and body.

Frontend:
- `src/components/student/employment/VoiceMockSession.tsx` — renders the returned `embedUrl` in an iframe with `allow="microphone; autoplay"` and `interviewEvents=true`, listens for `oc-interview` `postMessage` events (origin-checked against `onecompiler.com`), and on `interviewFinished` invokes the finish function and switches to the report.
- `src/hooks/useMockInterviewSessions.ts` — student's sessions for the course, used for the recent list and per-type completed counts.
- `MockInterviewLab.tsx` — the behavioural type routes to `MockReadyScreen` → `VoiceMockSession`; recent list and counts read real sessions for behavioural and keep demo data for the rest.
- `MockReviewScreen.tsx` — accepts a real feedback object (verdict, strengths, improvements, skills, per-question rows) alongside its current demo props.

Verification: `bunx tsgo --noEmit`, unit tests for the session/feedback mapping, and an authenticated browser check of the Practice step.
