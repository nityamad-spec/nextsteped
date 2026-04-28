## Problem

On `/teacher/setup`, each card computes its own status independently:
- **Upload Course Materials** → Complete only if a syllabus file exists in `course_material_files`.
- **Concept Review** → Complete if any row exists in `concepts` for the course.
- **Generate Lesson Plan** → Complete if a published plan JSON exists in storage.

Because these checks are independent, Concept Review (and Lesson Plan) can show **Complete** even when Upload is **In Progress** — for example, when the syllabus file was later removed but the generated concepts/plan remain in the database. The UI already locks the *cards* from being clicked when prerequisites aren't met, but the *status badges* don't honor that same dependency, which is what produced the screenshot's inconsistency.

## Fix

In `src/pages/teacher/CourseSetup.tsx`, after computing all raw statuses, enforce the same prerequisite chain that `isCardLocked` already uses, but applied to the badges:

1. If `upload` is not `Complete`:
   - Force `concept-review` → `Not Started`
   - Force `lesson-plan` → `Not Started`
2. If `concept-review` is not `Complete` (after step 1):
   - Force `lesson-plan` → `Not Started`

This guarantees the badges reflect the locked/unlocked state shown by the card UI: a downstream step can never appear In Progress or Complete while its prerequisite is incomplete.

## Technical details

Single edit in `src/pages/teacher/CourseSetup.tsx`, inside the `fetchStatuses` effect, right before `setStatuses(next)`:

```ts
// Enforce prerequisite chain so downstream badges never outpace upstream steps.
if (next.upload !== "Complete") {
  next["concept-review"] = "Not Started";
  next["lesson-plan"] = "Not Started";
}
if (next["concept-review"] !== "Complete") {
  next["lesson-plan"] = "Not Started";
}
```

No schema changes, no new state, no changes to other files. Existing `isCardLocked` logic continues to gate clicks; this change only aligns the visible badges with that gating.
