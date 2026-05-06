## Root cause

When the teacher opens `/teacher/setup/lesson-plan` after a wipe, `TeachingPlan.tsx` tries to download the published plan JSON from storage. That file no longer exists, so the catch/empty branch runs:

```ts
setDays(defaultPlan.map(d => ({ ...d, description: "" })));
```

`defaultPlan` is `workshopPlan` from `src/data/workshopPlan.ts` — a hardcoded 3-day Python workshop plan ("Python Fundamentals: Variables…", "Functions, Lists & Dictionaries", "File Handling, OOP Basics…"). That's the "previous lesson plan" the user is seeing. The DB is actually empty; the UI is rendering a deprecated hardcoded fallback.

This is also reachable for any brand-new course that hasn't generated a plan yet — it would always show those 3 Python workshop days regardless of the course subject.

## Fix

Replace the workshop-plan fallback with an empty-state, since we now operate as a 16-week semester course (per project memory: "Workshop Plan DEPRECATED").

### `src/pages/teacher/TeachingPlan.tsx`

1. Remove the import of `workshopPlan as defaultPlan` from `@/data/workshopPlan`.
2. In the load effect, replace both `setDays(defaultPlan.map(...))` calls with `setDays([])`.
3. In the render, when `days.length === 0 && !loading`, show an empty-state card explaining the plan hasn't been generated yet, with a primary CTA pointing back to syllabus upload / "Generate lesson plan" (whichever button already exists in this view — reuse it; do not introduce a new flow).

### Out of scope

- No DB changes.
- Don't touch `workshopPlan.ts` itself yet — it's still imported by `StudentHome` and possibly others. A separate cleanup pass can remove it once all callers migrate to DB-driven weeks.
- No edge function changes (wipe already works correctly per the previous fix).

### Verification

- After wipe on the test course, reload `/teacher/setup/lesson-plan` → empty state visible, no "Python Fundamentals…" cards.
- New course without a published plan → same empty state instead of the bogus 3-day plan.
