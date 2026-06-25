## Root Cause
"Edit Breakdown" sets `editingCardIds[id] = true` then calls `updateExam(id, { approved: false })`. `updateExam` → `persistExam` → `upsertExam` (in `useCourseExams`) which now awaits `reload()` and refreshes `activeCourseExams`.

The hydration effect in `src/pages/teacher/ExamMode.tsx` (lines 178–187) lists `activeCourseExams` in its deps and unconditionally runs:

```ts
setExamSchedule(buildInitialSchedule());
setEditingCardIds({});   // ← wipes the edit flag we just set
```

So the edit-mode toggle is reset on the very next render and the number `<Input>`s never appear. The same race nukes every keystroke through `handleBreakdownNumberChange`.

This regressed when `upsertExam` was changed to `await reload()` as part of the "+ Add new mock test" fix.

## Fix

### `src/pages/teacher/ExamMode.tsx`
1. **Stop clobbering `editingCardIds` on every hydration.** In the effect at lines 178–187, replace `setEditingCardIds({})` with a prune that only drops keys whose exam ids are no longer present:
   ```ts
   setEditingCardIds(prev => {
     const liveIds = new Set(activeCourseExams.map(e => e.id));
     const next: Record<string, boolean> = {};
     for (const [id, v] of Object.entries(prev)) if (liveIds.has(id)) next[id] = v;
     return next;
   });
   ```
2. **Same prune (not reset) in the question-types effect** at lines 304–327 — `setEditingCardIds({})` there is fine to keep (intentional: type change invalidates breakdowns), but make sure it only runs when `examQuestionTypes` actually changes value (it already does via the deps array, no change needed).
3. **Avoid persisting on every keystroke for breakdown edits.** Each `handleBreakdownNumberChange` triggers `upsertExam` → reload → re-hydrate. Even with (1) fixing the edit flag, this causes input flicker and lost focus. Debounce the persist: keep `setExamSchedule` synchronous (so the UI updates immediately) and schedule `persistExam` with a 400ms debounce per `(id)`. Implement with a `useRef<Map<string, number>>` of timeouts; clear on unmount.

### `src/hooks/useCourseExams.ts`
No change required — keeping `reload()` after upsert preserves the add-mock-test fix.

## Verification
- Open `/teacher/setup/exam-mode`, click **Edit Breakdown** on a Final card → confirm number inputs render and remain editable across keystrokes (Playwright: type into input, confirm value persists and no input remount/focus loss).
- After typing, wait ~600ms, reload page → DB has latest values (debounced write committed).
- Confirm "+ Add new mock test" still works (no regression).

## Out of scope
- Refactoring `examSchedule` to derive entirely from `activeCourseExams` (would be cleaner but larger change).