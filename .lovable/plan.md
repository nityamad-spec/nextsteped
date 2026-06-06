## Plan

Make the manual question forms in `/teacher/assessments` and Exam Mode actually saveable against the new `assessment_questions` schema by replacing the free-text Topic input with a Concept picker (using `concept_code` + name), driven by the course's concepts list. This eliminates the "topic must match a concept code" failure path.

Skipping `seed-questions` — it writes to `diagnostic_questions`, not `assessment_questions`. There is currently no edge function that inserts into `assessment_questions`, so no backend code needs updating.

### Changes

**1. `src/pages/teacher/Assessments.tsx`**
- Add `const [concepts, setConcepts] = useState<{ id: string; concept_code: string; concept_name: string }[]>([])`.
- In the existing course-load effect (alongside questions fetch), also fetch `id, concept_code, concept_name` from `concepts` where `course_id = courseId`, ordered by `concept_code`.
- Replace the `<Input>` at line 425 with a shadcn `<Select value={formTopic} onValueChange={setFormTopic}>` listing concepts as `{concept_code} — {concept_name}` with `value={concept_code}`.
- In `handleSave`, keep the concept_code → concept_id lookup already added (acts as a safety net), but it will now always succeed because the value comes from the Select.
- Empty state: if `concepts.length === 0`, render a small inline message in the dialog ("Add concepts in Concept Management first") and disable the Save button.

**2. `src/pages/teacher/ExamMode.tsx`**
- Same treatment: load concepts list, swap the `<Input>` at line 514 for a concept `<Select>`, mirror the empty-state guard.

### Out of scope
- Editing existing assessment questions whose `topic` no longer matches a concept (tables were wiped, so none exist).
- Backfilling other diagnostic-only columns (`tier`, `format`, `bloom_level`, etc.) from these manual forms — defaults stay in effect; can be exposed later if professors need control.
- Any change to `seed-questions` or other edge functions.
