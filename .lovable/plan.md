## Goal

Decouple the diagnostic from the EMA-based mastery tables. After this change:
- `diagnostic_results` remains the source of truth for the diagnostic submission (score, `mastery_score`, `learner_level`, components).
- `student_concept_mastery` and `student_course_mastery` are populated only by weekly quiz, exam, and practice submissions — so the per-concept EMA is never mixed with raw `correct/attempted` from the diagnostic.

This resolves the inconsistency where `diagnostic_results.mastery_score` was difficulty × Bloom weighted while the mastery tables it wrote into were not.

## Changes

### 1. `supabase/functions/score-diagnostic/index.ts`
- Remove the `perConceptTally` map and the trailing `fetch(...)` call to `update-mastery`.
- Keep everything else (weighted scoring, pace, confidence, `diagnostic_results` insert) exactly as-is.
- Update the top-of-file comment to state the function no longer writes to `student_concept_mastery` / `student_course_mastery` and that those tables are populated by weekly quiz / exam / practice only.

### 2. `supabase/functions/update-mastery/index.ts`
- No code change.
- Update the header comment to note that `diagnostic` is no longer a live caller (the `"diagnostic"` enum value stays in the Zod schema for backward compatibility; nothing in the app sends it after this change).

### 3. Frontend fallbacks
Audited every reader of the two mastery tables:

| Consumer | Reads | Behavior after change | Action |
|---|---|---|---|
| `src/pages/student/StudentHome.tsx` — concept heatmap (line 550) | `student_concept_mastery` | Heatmap shows "no data" for all concepts until the student takes a weekly quiz/exam/practice — same as the pre-diagnostic state today | None needed. Acceptable. |
| `src/pages/student/StudentHome.tsx` — `courseMastery` state (line 66, 124) | `student_course_mastery.mastery_score` | State stays `null` until first weekly quiz | None needed. Value is loaded but never rendered (confirmed via grep — only referenced in the test file). |
| `AssessmentAnalytics.tsx`, `StudentCourseSwitcher.tsx`, `admin/DiagnosticsAnalytics.tsx` | `diagnostic_results` only | Unchanged | None needed. |
| Teacher Course Dashboard / Student Insights | Do not query `student_concept_mastery` or `student_course_mastery` (grep confirmed) | Unchanged | None needed. |

No additional UI fallback is required. The `learner_level` badge and diagnostic summary on the student side already source from `diagnostic_results`, not from `student_course_mastery`.

### 4. Tests
- `src/pages/student/StudentHome.test.tsx` seeds `courseMasteryStore` directly — keep as-is; it doesn't go through the diagnostic flow.
- No existing test asserts that the diagnostic writes to the mastery tables, so nothing to remove.

## Out of scope

- Schema changes to `student_concept_mastery` / `student_course_mastery` (none needed).
- Backfilling or wiping any historical mastery rows that were previously seeded by the diagnostic — existing rows stay; they'll be naturally overwritten by future weekly quiz / exam / practice EMA updates.
- Changes to weekly quiz / exam / practice mastery formulas (separate decision).
