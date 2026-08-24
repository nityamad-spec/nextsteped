# Plan: Route Learning-Path Practice to the Code Terminal (coding-approved courses)

## Goal

On `/student/learning-path`, the **Practice** step opens the full-screen **Coding Terminal Widget** in `/student/chat` for coding-approved courses, pre-filled with a starter template for the unit's coding exercise. Courses without coding approval keep the existing AI practice-questions flow unchanged.

## Decisions confirmed

- Terminal surface: the full-screen **Coding Terminal Widget** (not the inline chat terminal).
- Non-coding courses: keep existing practice questions (fallback, no change).
- Practice-questions feature stays as the fallback for non-coding courses only.
- Terminal usage is tracked as a **new activity type** and counted as `practised` in `useUnitProgress`.
- The editor is **pre-filled with a starter template** for the unit's coding exercise.

## Current state (verified)

- Practice CTA: `StudentLearningPath.tsx` `goToPractice()` navigates to `/student/chat?practice=1&topic=...`; `AIChat.tsx` opens the practice-questions panel from that param.
- Terminal: `CodingTerminalWidget.tsx` is opened via `showTerminal` state in `AIChat.tsx` (line 1351), gated by `codingApproved`. It accepts only `onClose`; language starters are hardcoded; **Run is a Judge0 placeholder** (no real execution).
- Practice tracking: `useUnitProgress.ts` derives `practisedByUnit` from `assessment_results` rows with `mode = "practice"`, time-aware (only activity after the latest quiz attempt counts).
- Coding exercises: published exercises are already fetched per unit in `StudentLearningPath.tsx` via `fetchPublishedExercises`; reference solutions live in the private `coding_exercise_private` table (teacher-only).

## Phases

### Phase 1 — Database changes (one migration)

1. **`coding_exercises` (public table)**: add `starter_code text` and `primary_language text` (nullable). Starter code is student-visible skeleton code — distinct from the reference solution, which stays in `coding_exercise_private`. Backfill not required; NULL falls back to the widget's default language starter.
2. **New table `coding_terminal_sessions`** to track terminal practice activity:
   - `id uuid pk`, `student_id uuid references auth.users`, `course_id uuid references courses`, `week_number int`, `exercise_id uuid references coding_exercises (nullable)`, `language text`, `created_at timestamptz default now()`.
   - GRANTs: `SELECT, INSERT` to `authenticated`; `ALL` to `service_role`.
   - RLS enabled; policies: students insert/select only their own rows (`auth.uid() = student_id`); teachers can `SELECT` rows for courses they teach (reuses existing course-teacher check pattern).

### Phase 2 — Exercise generation: produce starter templates

- Update `generate-coding-exercises` edge function to also generate `starter_code` (a compilable skeleton: function signatures, TODO comments, no solution logic) and `primary_language` per exercise.
- Surface both fields in `CodingExerciseDialog.tsx` so professors can review/edit the starter template before publishing — same review workflow as the rest of the exercise.

### Phase 3 — CodingTerminalWidget: accept exercise context

- Add optional props: `initialCode`, `initialLanguage`, `exerciseTitle`, `exerciseStatement`.
- When `initialCode`/`initialLanguage` are provided, they override the default starter; language switch still works (existing starter-swap logic only fires when the editor still holds a starter).
- When exercise context is provided, show a collapsible problem-statement panel above the editor so the student sees what they're implementing.

### Phase 4 — Deep link + AIChat wiring

- New deep link: `/student/chat?terminal=1&unit=<weekNumber>`.
- In `AIChat.tsx`, handle the param:
  - If `codingApproved`: set `showTerminal(true)`, look up the unit's published coding exercise (via `fetchPublishedExercises`), pass its `starter_code`/`primary_language`/title/statement to the widget, and **insert one `coding_terminal_sessions` row** (student, course, week, exercise, language).
  - If not approved (deep link pasted manually): fall back to the existing `?practice=1` behavior.
- Strip the params with `navigate("/student/chat", { replace: true })` after handling, matching the existing pattern.

### Phase 5 — Learning-path UI routing

- `StudentLearningPath.tsx`: when `codingApproved`, `goToPractice` navigates to `/student/chat?terminal=1&unit=N` instead of `?practice=1`.
- `UnitPathwayCard.tsx`: when coding-approved, practice CTA label becomes **"Open code terminal"** (with `Terminal` icon) instead of "Start practice"; the step description mentions the coding exercise. Non-coding courses render exactly as today.

### Phase 6 — Count terminal usage as practice

- `useUnitProgress.ts`: also fetch the student's `coding_terminal_sessions` for the course and merge into `practisedByUnit` — a unit counts as practised if it has a practice result **or** a terminal session, applying the same time-aware rule (only sessions after the latest quiz attempt count, so a low quiz score still resets practice).

### Phase 7 — Tests

- Unit tests: `useUnitProgress` with terminal sessions (counted, and reset after a later quiz attempt); deep-link handler (approved → terminal opens + session logged; not approved → practice fallback).
- Component tests: `UnitPathwayCard` CTA label/routing for coding vs non-coding courses; widget renders pre-filled starter + problem statement.
- Run the full frontend suite and report results; failures are reported, not auto-fixed.

## Risks & constraints

- **Weak completion signal until Judge0 lands**: Run is a placeholder, so the session row is written on terminal open (via the deep link), not on successful execution. A student can "complete" practice without running code. When Judge0 is integrated, we can tighten this to require at least one run. Flagging as accepted tech debt.
- **No solution leakage**: starter code must be generated as a skeleton only; the reference solution remains in `coding_exercise_private` and is never sent to the student client.
- **Existing exercises have no starter_code**: they fall back to the widget's default language starter until regenerated or edited by the professor.
- **Teaching weeks in coding courses**: coding exercises exist only on coding/lab weeks. For teaching units in a coding-approved course, the terminal opens with the default language starter (no exercise context). If you'd rather keep practice questions for teaching units, that's a one-line routing change — noted as an option.
- **RLS/grants**: the new table follows the standard grant + policy pattern; without it the insert would silently fail and practice would never register.
