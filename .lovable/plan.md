# Mastery Tracking Schema

Two new tables to track each student's mastery at both the **course level** (single overall score per course) and the **concept level** (one score per concept in that course). Both are upserted whenever a new signal arrives (diagnostic submission, weekly quiz, exam, practice).

## Tables

### 1. `student_course_mastery`
One row per `(student_id, course_id)`. Holds the latest overall course mastery.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `student_id` | uuid NOT NULL | references `auth.users` |
| `course_id` | uuid NOT NULL | references `courses(id)` ON DELETE CASCADE |
| `mastery_score` | numeric(5,4) NOT NULL | 0.0000–1.0000 |
| `learner_level` | text NOT NULL | `beginner` \| `developing` \| `proficient` \| `expert` |
| `accuracy_component` | numeric(5,4) | latest breakdown for transparency |
| `pace_component` | numeric(5,4) | |
| `confidence_component` | numeric(5,4) | |
| `last_source` | text | `diagnostic` \| `weekly_quiz` \| `exam` \| `practice` |
| `last_source_id` | uuid | id of the row that triggered the update |
| `sample_count` | int NOT NULL default 0 | number of contributing assessments |
| `created_at` / `updated_at` | timestamptz | |

UNIQUE `(student_id, course_id)`.

### 2. `student_concept_mastery`
One row per `(student_id, course_id, concept_id)`.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `student_id` | uuid NOT NULL | |
| `course_id` | uuid NOT NULL | FK courses, CASCADE |
| `concept_id` | uuid NOT NULL | FK `concepts(id)`, CASCADE |
| `concept_code` | text NOT NULL | denormalized for fast reads |
| `mastery_score` | numeric(5,4) NOT NULL | 0–1 |
| `mastery_level` | text NOT NULL | same 4-tier scale (hidden in UI per memory) |
| `questions_attempted` | int NOT NULL default 0 | |
| `questions_correct` | int NOT NULL default 0 | |
| `last_source` | text | |
| `last_source_id` | uuid | |
| `last_assessed_at` | timestamptz | |
| `created_at` / `updated_at` | timestamptz | |

UNIQUE `(student_id, course_id, concept_id)`.

## Indexes
- `student_course_mastery (course_id)` — teacher dashboards.
- `student_concept_mastery (course_id, concept_id)` — class-wide heatmap.
- `student_concept_mastery (student_id, course_id)` — student dashboard.

## RLS & Grants
- `GRANT SELECT, INSERT, UPDATE ON ... TO authenticated; GRANT ALL ... TO service_role;`
- Policies:
  - Student can `SELECT` rows where `student_id = auth.uid()`.
  - Teachers (course owner or in `course_teachers`) can `SELECT` any row where `course_id` is theirs (via `is_course_member`).
  - Admin via `is_admin(auth.uid())` full access.
  - Writes restricted to `service_role` — all updates flow through edge functions, never the client.

## Update flow (no code in this plan, only contract)
Edge functions perform an **upsert** on these tables:

- `score-diagnostic` → seeds both: course row from overall mastery; concept rows aggregated from diagnostic answers grouped by `concept_id`.
- `assessment_results` writes (weekly quiz / exam) → a follow-up step (either inline in the submission edge function or a new `update-mastery` function) recomputes per-concept scores from that result and blends them into existing rows using a **decayed running average**:
  ```text
  new = (old * old_n + signal * signal_n) / (old_n + signal_n)
  ```
  with optional recency weighting (newer assessments weighted higher). Course mastery = weighted average of concept masteries using `concepts.weight`.

The decay/blend formula and exact recompute trigger points are out of scope for this schema plan and will be designed in a follow-up.

## Migration scope
Single migration: create both tables + grants + RLS + policies + `updated_at` triggers + indexes. No backfill — first diagnostic / assessment after deploy populates rows.

## Open questions
1. **Backfill existing students?** Replay current `diagnostic_results` + `assessment_results` to seed the new tables, or start fresh from next assessment only?
2. **Concept mastery from diagnostic** — diagnostic questions are linked via `diagnostic_questions.concept_id`; confirm we want per-concept rows seeded from the diagnostic, or course-level only at diagnostic time and concept rows only after quizzes/exams begin.
3. **Blend formula** — simple running average vs. exponential decay (e.g. weight = 0.7·new + 0.3·old)? Affects how fast mastery moves.
