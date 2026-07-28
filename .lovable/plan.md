## Goal
Pull student data for the two courses and deliver a single Excel workbook to `/mnt/documents/`.

- **Introduction to Generative AI** — `2ccc8090-8e90-4eee-9e0a-4e94871d4f14`
- **Generative AI Leader** — `42e995c8-2202-4355-9a8a-524ad804e3a3`

## Data included (per user's answers)
1. Diagnostic results (score, mastery, learner level, pace) — using updated 80/20 accuracy/pace scoring from `src/lib/masteryScoring.ts`.
2. Weekly quiz results (per week, score, mastery) — using the same unified 80/20 scoring.
3. Concept mastery breakdown (per student × concept).

## Data sources
- `enrollments` → roster of students per course.
- `profiles` → student name, email, roll number (for identification only).
- `diagnostic_results` → raw quiz data + `question_times` for pace.
- `assessment_results` (mode = `daily_quiz`) → weekly quiz raw data.
- `assessment_questions` / `diagnostic_questions` → per-question difficulty/bloom needed to recompute weighted mastery consistent with `update-mastery`.
- `student_concept_mastery` → current per-concept mastery + level.
- `concepts` → concept code + weight for context.

## Recompute logic (matches app)
- **Accuracy component**: weighted correct/total using `difficulty × BLOOM_WEIGHT[bloom]` when per-question metadata is present; fallback to simple correct/attempted.
- **Pace component**: from `question_times` vs a per-question expected time — mirroring `masteryScoring.ts` (80% accuracy + 20% pace).
- **Displayed score**: `round(100 × combined)`.
- Weekly quiz reasoning follow-ups are **not** counted as primaries (Phase 3/4 rules) but reasoning correctness is shown as a side column.

## Deliverable
Single workbook: `/mnt/documents/generative-ai-student-data.xlsx`

Tabs:
1. `Overview` — course summary (student count, quiz counts, avg mastery).
2. `Students` — one row per enrolled student × course (name, email, roll, enrolled_at, active).
3. `Diagnostic Results` — one row per attempt: student, course, taken_at, raw score, recomputed accuracy %, pace %, combined %, learner level, mastery score.
4. `Weekly Quiz Results` — one row per attempt: student, course, quiz_day/week, taken_at, primaries correct/total, accuracy %, pace %, combined %, reasoning correct/attempted, mastery delta if available.
5. `Concept Mastery` — one row per student × concept: mastery score, level, questions attempted/correct, last source, last assessed.

## Steps
1. Run SQL joins per course to build the five datasets (use `psql`/`code--exec` with read access).
2. Load raw JSON columns (`answers`, `question_times`, `question_ids`) into a Python script; recompute accuracy/pace using the same formulas as `src/lib/masteryScoring.ts`.
3. Write the workbook with `openpyxl` (headers bolded, freeze first row, number formats for %).
4. Open the file with pandas to spot-check row counts and a couple of sample rows; QA-render each sheet header row.
5. Return the artifact via `<presentation-artifact>`.

## Risks / constraints
- Reasoning follow-up data lives inside `answers` JSONB; parsing must tolerate legacy rows without those fields.
- Pace recomputation depends on `question_times` being populated; older attempts may lack it — those get accuracy-only score with a note.
- If a student attempted a quiz before Phase 8 scoring rollout, the displayed score in-app may differ from the recomputed one; the export uses the new formula everywhere for consistency, and both raw score and recomputed score are included side by side so differences are visible.
- Names/emails included as requested via "student data" — no external sharing implied.
