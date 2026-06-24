## Problem
"+" button under **Number of Mock Tests Generated** silently fails after the first click. Console shows repeated `course_exams_active_label_uq` (23505) duplicate-key errors.

## Root cause
1. `useCourseExams.upsertExam` doesn't `reload()` after insert, so `activeCourseExams` stays stale.
2. The hydration `useEffect` in `ExamMode.tsx` (deps: `taSettings`, `activeCourseExams`) re-runs whenever `taSettings` re-emits and rebuilds `examSchedule` from the stale `activeCourseExams`, wiping the optimistic local append.
3. The next click recomputes the same `Final N` label against stale data → collides with the row just inserted → DB unique index throws 23505. The error is only `console.error`'d, so the UI looks frozen.

## Fix

### A. `src/hooks/useCourseExams.ts` — make `upsertExam` consistent with archive/restore
- After a successful `upsert`, `await reload()` so `active`/`archived`/`exams` reflect DB truth.
- Return the inserted/updated row id so callers can correlate.

### B. `src/pages/teacher/ExamMode.tsx` — `handleAddExam`
- Convert to `async`.
- Compute `label` and `position` from the freshly reloaded `activeCourseExams` (call `reload` once before computing if needed, OR rely on A's post-upsert reload).
- Drop the manual `setExamSchedule(prev => [...prev, newItem])` optimistic append — the hydration effect will pick up the new row from `activeCourseExams` after A reloads. This removes the optimistic/hydration tug-of-war.
- Wrap in try/catch. On any error (including 23505), show `toast.error("Couldn't add mock test. Please try again.")` instead of swallowing.
- Add a one-shot retry path specifically for 23505: re-`reload()` → recompute `nextAvailableLabel` from fresh labels → retry once. If still fails, toast.
- Disable the `+` button while an add is in flight (new `addingExam` state) to prevent rapid double-clicks racing the reload.

### C. Defensive: tighten `handleRemoveExam` similarly
Same async + toast pattern so removal failures surface, and so the local state doesn't drift from DB. Low-risk parallel cleanup; keep diff small.

### D. No DB migration
The partial unique index is correct and desirable — it's the safety net that surfaced this bug. Keep it.

## Verification
1. On course `a8d0f129` (Advanced Generative AI, currently 1 active exam): click `+` five times rapidly.
   - DB should end up with `Final 1…Final 6` actives, all unique labels, monotonically increasing positions.
   - UI count should match DB count after each click (after the awaited reload).
2. Archive `Final 3` then click `+`: new exam should reuse `Final 3` (next free) or pick `Final 7` — whichever `nextAvailableLabel` returns from active labels only. Confirm no 23505.
3. Simulate failure: temporarily revoke insert via RLS or break network; click `+` → toast appears, no silent failure.
4. Re-run the existing restore Playwright flow to confirm no regression in `archive`/`restore`.

## Out of scope
- The pre-existing duplicate `position` values from earlier restores (cosmetic; tracked separately).
- Reordering UI.
