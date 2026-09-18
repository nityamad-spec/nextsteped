# Make the employment track real

Today the whole employment/career-readiness experience is sample content. This plan replaces it with real, saved data in four stages. Each stage is usable on its own.

## Stage 1 — STAR stories that save (smallest, highest value)

- Students' STAR stories are stored on their account instead of disappearing on refresh.
- Add, edit, delete, and the existing "Improve my story" AI helper all persist.
- Progress ("7 of 12 stories") becomes real and feeds the Prepare step's completion.
- Demo stories become clearly-labelled examples that can be copied into a student's own list.

## Stage 2 — Daily DSA from your own exercise bank

- Each day the app picks one unattempted coding exercise from the course's published exercise bank and shows it as today's problem.
- "Start today's problem" opens the real code terminal, runs against the exercise's test cases, and records the attempt.
- Real streak counter and completion history; solved days feed the student's progress.
- If a course has no coding exercises yet, the card explains that instead of showing a fake problem.

## Stage 3 — Real AI mock interviews

- Picking a mock type starts a genuine AI-run interview: the AI asks questions, the student answers by text, the AI probes follow-ups, then scores the session and writes feedback against the coaching checklist.
- Coding mocks reuse the existing code terminal so the student writes and runs actual code during the session.
- Every session is saved: type, date, duration, score, checklist hits, and the AI's notes.
- "Recent mocks" and the review screen read that saved history instead of the sample list. Session recording stays out of scope.
- Professors/admins see nothing new in this stage; it's student-private.

## Stage 4 — Real job openings from a feed

- New openings store, filled by a scheduled importer that pulls from an external jobs feed, deduplicates, and refreshes on a timer.
- Match percentage is computed from the student's concept mastery and completed stages against the opening's required skills, replacing the hardcoded numbers. Ready / Stretch / Early thresholds stay as they are (75%+, 50–74%, below 50%).
- Openings shown on Home and in the Understand step's company notes both read from the same store.
- Admin screen to review imported openings and hide bad ones.

**Needed from you before Stage 4 can run:** an account and API key for a jobs feed. Common options are a paid aggregator API or a public board's API. Tell me which provider you want and I'll request the key securely. Until then Stage 4 can ship with an admin/professor entry form as the data source and the same feed plumbing behind it.

## Technical notes

- New tables (all with row-level security scoped to the student, plus professor/admin read where appropriate): `student_star_stories`, `daily_dsa_assignments` + `daily_dsa_attempts`, `mock_interview_sessions` + `mock_interview_turns`, `job_openings` + `job_opening_imports`.
- New edge functions: `mock-interview` (streaming AI interviewer + scoring, via `_shared/ai-log.ts` and the gateway), `assign-daily-dsa`, `import-job-openings`. Existing `run-code` and `improve-star-story` are reused as-is.
- The importer and daily-assignment jobs follow the background-job rules: bounded batch per run, single-flight lease row, idempotent progress marking, and a circuit breaker that pauses the job on credit/permission errors.
- Match scoring is a shared pure module with unit tests, mirroring how `attemptScoring` is structured.
- Demo modules `demoOpenings.ts`, `mockInterviews.ts`, `starStories.ts`, and `careerReadinessBriefing.ts` shrink to seed/example data only as each stage lands.

## Also worth cleaning up (not part of the four stages)

- Two unreachable pages, "Employers" and "Interview Prep", can be deleted.
- The "Your Progress" page is a Coming Soon screen reachable only by URL — hide it or build it.
- The teacher Support form shows "Sent!" but sends nothing.

Tell me which stage to start with, or approve and I'll begin with Stage 1.
