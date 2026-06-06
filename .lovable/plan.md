# Mastery Update Formula

## Decision
- **Concept mastery** → updated with **Exponential Moving Average (EMA)** per new signal.
- **Course mastery** → **derived**, never blended directly. Recomputed as the weighted average of that student's concept mastery rows using `concepts.weight`.

## Concept EMA

For each `(student, course, concept)` row, when a new signal arrives:

```text
signal     = correct_in_concept / attempted_in_concept   // 0..1 from this assessment
α (alpha)  = 0.4                                          // weight of the new signal
new_score  = α * signal + (1 - α) * old_score             // EMA
```

Special cases:
- **First ever signal** for a concept (`sample_count = 0`): `new_score = signal` (no prior to blend).
- **Diagnostic** seeds the row with `signal` directly and sets `sample_count = 1`.
- Every update also increments `sample_count`, sets `last_source`, `last_source_id`, `last_assessed_at`, and adds to `questions_attempted` / `questions_correct` (lifetime counters, independent of EMA).
- `mastery_level` recomputed from `new_score` using the same 4 bands already defined in `score-diagnostic` (`beginner` <0.25, `developing` <0.50, `proficient` <0.75, `expert` ≤1.0). Stored but hidden in UI.

**Why α = 0.4:** responsive enough that 2–3 recent assessments dominate, but a single bad quiz won't crater a previously strong concept. Tunable in one constant.

## Course mastery (derived)

After any concept row(s) change for a student in a course:

```text
course_score = Σ (concept.mastery_score * concept.weight)
             / Σ (concept.weight)
```

over all rows in `student_concept_mastery` for that `(student, course)`. Concepts the student hasn't been assessed on yet are simply excluded from the sum (no zero-fill — that would unfairly drag the score down early).

Then:
- `student_course_mastery.mastery_score = course_score`
- `learner_level` = band from `course_score`
- `accuracy_component` = `course_score` (same value; pace/confidence kept only for diagnostic, set to NULL on derived updates)
- `last_source` / `last_source_id` = whatever triggered the recompute
- `sample_count` = count of concept rows contributing to the sum

## Where this lives

A new edge function **`update-mastery`** owns both steps:

1. Input: `{ student_id, course_id, source, source_id, per_concept: [{ concept_id, attempted, correct }] }`
2. For each concept in `per_concept`: upsert `student_concept_mastery` using EMA above.
3. Recompute course row from all concept rows for that student/course.
4. All writes via `service_role` (RLS keeps clients out).

Called from:
- `score-diagnostic` → after inserting `diagnostic_results`, group answers by `concept_id` (via `diagnostic_questions.concept_id`) and call `update-mastery`. Diagnostic case uses `signal` directly (no prior).
- Assessment submission path (weekly quiz / exam) → after writing `assessment_results`, group questions by `concept_id` from `assessment_questions` and call `update-mastery`.

## Tuning constants (single source of truth in `update-mastery`)

```ts
const MASTERY_CONFIG = {
  EMA_ALPHA: 0.4,
  LEVEL_BANDS: [
    { max: 0.25,   level: "beginner" },
    { max: 0.50,   level: "developing" },
    { max: 0.75,   level: "proficient" },
    { max: 1.0001, level: "expert" },
  ],
} as const;
```

## Out of scope for this step
- Backfill of existing diagnostic/assessment rows (still open question — default: start fresh).
- Recency decay on concept rows older than X weeks (can layer on later by shrinking `old_score` toward 0.5 before EMA; not needed for v1).
- Time/confidence components in concept EMA — kept accuracy-only for clarity; diagnostic still records its richer breakdown on the course row at seed time.

## Migration impact
None. Schema from the previous migration already supports this. Only new code: the `update-mastery` edge function plus two call sites.
