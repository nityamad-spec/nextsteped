
## Part 1 — Fix: Steps 5 & 7 incorrectly show "Complete" on a new/switched course

### Root cause
The `teacher_setup_progress` table is keyed only by `(teacher_id, step_id)` — there is no `course_id`. Steps that derive their status from course-scoped DB rows (Upload, Concept Review, Lesson Plan, Diagnostic, Exam Mode) already reset correctly per course, but two steps don't:

- **Step 5 — AI Assistant Settings**: marks `Complete` from `completed["ai-settings"]` in `teacher_setup_progress` (a teacher-wide flag), with a fallback to `course_ta_settings.custom_study_prompt`.
- **Step 7 — Enrollment & Course Settings**: marks `Complete` purely from `completed.enrollment` in `teacher_setup_progress` (teacher-wide). No course-scoped signal.

So when a professor adds a new course or switches courses, those two stay "Complete" because the row from the previous course's session is still there.

### Fix — make setup progress course-scoped

1. **Migration** — add `course_id uuid` to `teacher_setup_progress`, drop the old `(teacher_id, step_id)` unique constraint, add a new unique on `(teacher_id, course_id, step_id)`. Delete existing rows (stale by definition) so the gate recomputes cleanly. RLS stays teacher-scoped.

2. **`src/lib/setupProgress.ts`** — add `courseId` parameter to `fetchStepProgress`, `markStepOpened`, `markStepCompleted`. Filter/upsert on `(teacher_id, course_id, step_id)`.

3. **`src/pages/teacher/CourseSetup.tsx`** — pass `courseId` into the helpers. If no `courseId` yet, treat all steps as "Not Started".

4. **Other call sites** — update to pass current `courseId`:
   - `src/pages/teacher/AIAssistantAndSettings.tsx`
   - `src/pages/teacher/EnrollmentSettings.tsx`
   - `src/layouts/StudentLayout.tsx` (only if it actually calls these helpers in a teacher context — verify)

5. Step 5 keeps the OR with `course_ta_settings.custom_study_prompt` (already course-scoped). Step 7 keeps the explicit `markStepCompleted` write inside `EnrollmentSettings` save handler — now course-scoped via the migration.

### Result
Each course has independent progress badges. Adding/switching courses shows all 7 steps as "Not Started" until that course's own data/flags say otherwise.

---

## Part 2 — Concept Review: add "Additional Concept Recommendations" section

### Goal
Below "Extracted Concepts", add a new **"Additional Concept Recommendations"** section. It surfaces concepts that weren't extracted from the syllabus but are relevant to the course — both **industry-alignment** recommendations and **generally missing** concepts the syllabus didn't cover. Professor can approve / edit / dismiss each. Approved ones flow into `concepts` (same flow as Extracted), so they automatically feed lesson-plan generation.

### UI changes — `src/pages/teacher/ConceptReview.tsx`

1. New state: `recommendations: Recommendation[]`, `loadingRecs`, `recsRequested`, `editingRecName: string | null`, `editingRecValue: string`.
2. New type: `Recommendation = { name: string; rationale: string; category: "industry" | "foundational" | "gap" }`.
3. New section card placed **between** "Extracted Concepts" and "Confirmed Concepts":
   - Header: "Additional Concept Recommendations" with a `Sparkles` icon.
   - Description: "Concepts that weren't in your syllabus but may be worth covering — including industry-alignment topics employers commonly look for and any general gaps. Approve, edit, or dismiss each."
   - Primary button: **"Generate Recommendations"** → "Re-generate Recommendations" once requested.
   - Each recommendation card: name + small category chip (Industry / Foundational / Gap) + rationale. Actions: **Approve** (insert to `concepts`), **Edit** (inline rename input + Save/Cancel), **Dismiss**.
4. Existing "Continue" CTA logic unchanged — requires ≥1 confirmed concept. Approved recommendations land in `concepts` and feed lesson-plan generation automatically.

### Edge function — new `supabase/functions/recommend-additional-concepts/index.ts`

- Inputs: `{ courseId, existingConcepts: string[] }`.
- Loads course (`name`, `course_code`, `objectives`) + parsed syllabus JSON (same loader as `suggest-concepts`).
- Calls Lovable AI Gateway with `google/gemini-2.5-pro` using a tool call schema returning `{ recommendations: [{ name, rationale, category }] }` where `category ∈ {"industry","foundational","gap"}`.
- System prompt focuses on **what's missing** vs. syllabus + existing concepts: "Suggest 5–10 concepts NOT already present that would strengthen this course. Mix three flavors: (a) industry-alignment topics employers expect graduates to know, (b) foundational prerequisites the syllabus assumes but doesn't teach, (c) general gaps in coverage. Each rationale is 1 sentence. Skip anything already in the existing list (case-insensitive)."
- Server-side dedup against `existingConcepts`.
- Standard 429/402 handling, mirrors `suggest-concepts/index.ts` shape.

No `supabase/config.toml` changes needed.

### Why this is safe
- Approved recommendations write to the existing `concepts` table — no schema change, and `generate-lesson-plan` already consumes that table, so all approved/final concepts flow into the lesson plan automatically.
- Dismissed/edited-but-not-approved recommendations are never persisted — they live only in component state.

---

## Files to change

**Migrations**
- `supabase/migrations/<new>_scope_teacher_setup_progress_per_course.sql`

**Edited**
- `src/lib/setupProgress.ts`
- `src/pages/teacher/CourseSetup.tsx`
- `src/pages/teacher/AIAssistantAndSettings.tsx`
- `src/pages/teacher/EnrollmentSettings.tsx`
- `src/layouts/StudentLayout.tsx` (only if it uses these helpers)
- `src/pages/teacher/ConceptReview.tsx`

**Created**
- `supabase/functions/recommend-additional-concepts/index.ts`

**Memory updates**
- Update `mem://ux/teacher-setup-flow.md`: (a) `teacher_setup_progress` is now per-course, (b) Concept Review now has an "Additional Concept Recommendations" section after Extracted Concepts.
