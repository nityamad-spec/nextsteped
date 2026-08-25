# Coding exercise as Step 3 on the Learning Path

## Goal

On `/student/learning-path`, each published coding exercise of a coding/lab unit gets its own step card in "This unit's path" (Study → Practice → one card per exercise, numbered 3, 4, 5…). Clicking a card opens the full-screen code terminal in `/student/chat` with **that specific exercise's** problem statement shown in the terminal's statement panel. The read-only "Coding exercises" section under the unit is removed. Each exercise card has its own completion tick, backed by a new per-exercise progress table.

Confirmed decisions: one step card per exercise; separate per-exercise completion signal; read-only exercise list removed.

## Current state (verified)

- `UnitPathwayCard.tsx` hides the quiz `StepCard` for coding weeks (`!isCodingWeek`), so coding units show only 2 steps; published exercises render in a separate read-only collapsible section (lines 544–655).
- Deep link `/student/chat?terminal=1&unit=N` (AIChat.tsx ~line 483) opens `CodingTerminalWidget`, picks the **first** published exercise of the unit (`all.find(e => e.week_number === unit)`), passes its title/statement/starter code, and inserts a `coding_terminal_sessions` row. The widget already renders the problem statement in a collapsible panel, expanded by default.
- No per-exercise completion tracking exists today; `coding_terminal_sessions.exercise_id` is logged but nothing reads it per exercise.

## Changes

### 1. Database (one migration): `coding_exercise_progress`

- Columns: `id uuid pk`, `student_id uuid → profiles(id)`, `exercise_id uuid → coding_exercises(id) on delete cascade`, `course_id uuid → courses(id)`, `source text not null default 'terminal_session'`, `created_at timestamptz default now()`, `unique (student_id, exercise_id)`.
- GRANT `SELECT, INSERT` to `authenticated`, `ALL` to `service_role`; RLS enabled: students read/insert only their own rows (`auth.uid() = student_id`); teachers can read rows for courses they teach (same pattern as `coding_terminal_sessions`).
- Completion for now = the student opened the terminal for that exercise (Judge0 run-based completion can upgrade `source` later). No `updated_at` — rows are insert-once.

### 2. Per-exercise deep link

- New deep-link shape: `/student/chat?terminal=1&unit=N&exercise=<exerciseId>`.
- `AIChat.tsx` terminal handler: when `exercise` param is present, select that exercise by id from `fetchPublishedExercises` (fall back to the unit's first exercise if missing); otherwise keep today's behavior. After opening the terminal, upsert a `coding_exercise_progress` row (student, exercise, course) in addition to the existing `coding_terminal_sessions` insert. Fallback for non-approved courses unchanged.
- The problem-statement panel in `CodingTerminalWidget` needs no change — it already shows the passed exercise's statement, expanded by default.

### 3. `UnitPathwayCard.tsx` — exercise step cards

- For coding weeks with published exercises, after the Practice step render one `StepCard` per exercise: index `3 + i`, `Code2` icon, title = exercise title, description like "Complete this coding exercise in the code terminal.", CTA "Open in terminal" (or "Reopen in terminal" when done), `done` from the per-exercise completion set, `onAction` → new `onOpenExercise(exercise)` prop.
- Remove the read-only "Coding exercises" section (lines 544–655) and the now-unused `openExercises`/`toggleExercise` state and `languageLabel` import.
- Non-coding weeks and coding weeks with no published exercises render exactly as today.

### 4. `StudentLearningPath.tsx` — wiring

- Fetch the student's `coding_exercise_progress` rows for the course alongside `exercisesByUnit`; build a `completedExerciseIds: Set<string>`.
- Pass each exercise's done state and `onOpenExercise`, which navigates to `/student/chat?terminal=1&unit=<day>&exercise=<id>`.
- The generic practice step (`goToPractice`, step 2) keeps its current unit-level behavior.

### 5. Tests

- `UnitPathwayCard.test.tsx`: coding week with 2 exercises renders two step cards numbered 3 and 4 with the right titles; done exercise shows the tick and "Reopen in terminal"; read-only section no longer renders; non-coding week unchanged.
- Deep-link handler: `exercise` param selects the correct exercise's starter/statement and upserts the progress row; unknown id falls back to the unit's first exercise; non-approved course still falls back to practice questions.
- Run the full frontend suite and report results; failures are reported, not auto-fixed.

## Risks & constraints

- **Weak completion signal**: "done" means the terminal was opened for that exercise, not that code ran — same accepted limitation as the practice step until Judge0 lands. The `source` column leaves room to tighten this later.
- **Unpublished/new exercises**: drafts never appear to students (published-only fetch stays); an exercise published after a student completed others simply appears as a new un-ticked card.
- **Renumbering**: deleting an exercise mid-course shifts card numbers (3, 4…) for that unit only — cosmetic; completion rows key off `exercise_id`, so ticks are unaffected. Exercise deletion cascades progress rows.
- **Step count varies per unit**: units with several exercises show 4–6 cards; the `StepCard` row already wraps (`flex-col` on mobile), so layout holds.
