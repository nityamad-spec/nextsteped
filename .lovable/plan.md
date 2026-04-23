

## Add week settings + distribute approved concepts across weeks

### Goal

On `/teacher/setup/lesson-plan`, let the professor set **Total Weeks**, **Midterm Week**, and **Final Week** before generation. Then have **Gemini 2.5 Pro** distribute the **already-confirmed concepts from Concept Review** across those weeks in proper learning order, estimating how many weeks each concept needs.

This replaces today's behavior where the AI invents concepts and overwrites the `concepts` table.

---

### Part 1 — Course settings panel (UI)

Add a new **"Course Schedule"** card at the top of `CourseCreation.tsx`, shown above the generation/plan content.

Fields:
| Field | Control | Default | Validation |
|---|---|---|---|
| Total Weeks | number input (4–24) | `courses.total_weeks` or 16 | required, integer |
| Midterm Week | select (Week 1..N, or "None") | `courses.midterm_week` | must be ≤ total_weeks |
| Final Week | select (Week 1..N, or "None") | `courses.final_week` | must be ≤ total_weeks, ≠ midterm |

Behavior:
- Values persist to `courses` row immediately on change (`update`).
- Card is collapsible; auto-expanded if any field is unset.
- A **"Regenerate plan"** button next to the card runs `runGeneration` again (with confirm dialog warning that current weeks/edits will be replaced).
- Generation is blocked with an inline message until `total_weeks` is set.

### Part 2 — Edge function: concept-driven distribution

Rewrite `supabase/functions/generate-lesson-plan/index.ts` to:

1. **Load confirmed concepts** from the `concepts` table for the course (these are the source of truth from Concept Review). If none exist → return error: "No confirmed concepts. Complete Concept Review first."
2. **Stop wiping/reseeding the concepts table** — that section is removed.
3. Pass the concepts list (name + course context + syllabus/lesson plan excerpts) to Gemini 2.5 Pro.
4. Use a new tool schema where the AI returns **per-week assignments referencing existing concepts by name**, plus an estimated `weeks_needed` per concept used for distribution.

**New tool: `distribute_concepts_into_weeks`**
```json
{
  "weeks": [
    {
      "week": 1,
      "week_name": "string (3-6 words)",
      "overview": "string",
      "is_exam_week": false,
      "concept_names": ["Variables", "Data Types"],
      "resources": [ /* same shape: 1 coding-exercise + 1-2 articles */ ]
    }
  ],
  "overall_course_learning_outcomes": "string"
}
```

System-prompt rules added:
- "You will be given a finalized ordered list of concepts. You MUST distribute ALL of them across exactly `${totalWeeks}` teaching weeks (excluding exam weeks)."
- "Maintain the **same learning order** as the input list — concepts in earlier list positions go in earlier weeks."
- "Estimate how many weeks each concept needs based on depth/complexity; spread accordingly. A simple concept may share a week with 1–2 others; a complex concept may span 2 weeks (repeat the name in consecutive weeks)."
- "Exam weeks (midterm/final) get NO new concepts — overview = 'Exam week — review prior content.', concepts empty, no resources."
- "Every concept from the input list must appear in at least one week. Do not invent new concepts."

Server post-processing:
- For each week, map `concept_names[]` → look up each name in the loaded concepts table and emit a `Concept` object `{ name, brief_description, ai_suggested: false }` (descriptions left blank — frontend can edit).
- Validate every input concept name appears at least once; if any are missing, append them to the last non-exam week (defensive fallback) and log a warning in `meta.unassignedConcepts`.
- Force exam weeks to have `is_exam_week=true`, empty concepts, exam-appropriate overview.
- Keep existing resource cap (1 exercise + max 2 articles) and `overall_course_learning_outcomes`.

Model: keep `google/gemini-2.5-pro`.

### Part 3 — Frontend wiring

In `CourseCreation.tsx`:
- Read `courses.total_weeks`, `midterm_week`, `final_week` when resolving courseId; show in settings card.
- On any settings change, `supabase.from("courses").update(...)`. Reflect the new totalWeeks in the regenerated plan.
- Show a notice banner above the plan: "Concepts shown below come from your approved concept list and have been arranged in teaching order."
- Update generation step labels to: "Loading approved concepts → Estimating teaching duration → Distributing across weeks".
- If edge function returns "No confirmed concepts" error, render a CTA button "Go to Concept Review" → navigates to `/teacher/setup/concept-review`.

### Files to change

| Path | Change |
|---|---|
| `src/pages/teacher/CourseCreation.tsx` | Add Course Schedule card, persist settings to `courses`, regenerate button, update gen step labels, error CTA |
| `supabase/functions/generate-lesson-plan/index.ts` | Load concepts, new tool schema (`distribute_concepts_into_weeks`), new prompt, remove concept wipe/reseed, server-side validation/fallback |

### Out of scope

- No DB migration — `courses.total_weeks`, `midterm_week`, `final_week` columns already exist.
- Not changing how concepts get into the `concepts` table (still done via Concept Review).
- Not changing the resource cap or `overall_course_learning_outcomes` shape.
- No memory update yet — will add one after implementation if behavior locks in.

