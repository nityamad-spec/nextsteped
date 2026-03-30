

## Plan: Migrate Legacy Diagnostic Results to Standardised Format

### Current State
- **164 legacy records** in `diagnostic_results` — all use parallel arrays (`answers: [1, 0, -1]`, `confidences`, `question_times`, `question_ids`)
- **0 records** in `assessment_results` — no migration needed there
- **2 records** have empty `question_ids` (no way to join back to questions) — these will get partial migration with available data only
- **162 records** have valid `question_ids` — these can be fully enriched by joining to `diagnostic_questions`

### Approach

Write a **database migration** (PL/pgSQL) that:

1. For each `diagnostic_results` row where `answers->0` is a number (legacy format):
   - Join each `question_ids[i]` to `diagnostic_questions` to retrieve `content_text`, `topic`, `format`, `answer`, and `options`
   - Build a standardised object per question:
     - `question_id`, `question_text`, `type`, `topic`
     - `selected`: convert index to letter (A/B/C/D) for MCQ, or "unknown" for short answer (text was not captured in legacy)
     - `correct`: the `answer` column from `diagnostic_questions`
     - `is_correct`: compare selected vs correct
     - `time_ms`: from `question_times[i]`
     - `confidence`: from `confidences[i]`
   - Replace the `answers` column with the new JSONB array of objects
2. For the 2 records with empty `question_ids`: build partial objects using only the index data and timing — mark `question_text` and `topic` as `"unknown"`

### Limitation
Legacy short-answer text was stored as `-1` index — the actual typed text is **permanently lost**. The migrated record will have `"selected": "unknown"` for those entries.

### Technical Detail

Single SQL migration using a PL/pgSQL `DO` block that:
- Iterates over legacy rows with a cursor
- Uses `jsonb_array_elements_text` to unzip parallel arrays
- Joins to `diagnostic_questions` for metadata
- Updates `answers` in place

### Files Modified
- 1 new database migration

