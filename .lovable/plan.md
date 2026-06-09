## Goal
On `/teacher/setup/exam-mode`, replace the single exam-length slider and single estimate panel with an **Exam Schedule** block that supports 1–10 exams per semester, each with its own type (Midterm / Final), length, and approved question-count breakdown.

## UI

```text
┌─ Exam Schedule ─────────────────────────────────────────────┐
│  Number of Exams This Semester   [ −  2  + ]   (1–10)       │
│                                                             │
│  ┌─ Midterm 1 ──────────────────────────── [Midterm ▾] ─┐   │
│  │  Length     [────●─────────]  60 min                │   │
│  │  Estimated: 20 questions (MCQ 10 · T/F 10)          │   │
│  │   ├ MCQ        [10]                                 │   │
│  │   └ True/False [10]                                 │   │
│  │  [ ✎ Edit Breakdown ]   [ ✓ Approved ]              │   │
│  └─────────────────────────────────────────────────────┘   │
│  ┌─ Final 1 ─────────────────────────────── [Final  ▾] ─┐   │
│  │  Length     [─────────●────]  120 min               │   │
│  │  Estimated: 40 questions (MCQ 20 · T/F 20)          │   │
│  │  [ ✎ Edit Breakdown ]   [ Approve Estimate ]        │   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

- **Counter** (`− N +`, range 1–10) controls how many cards render. Adding appends a card with defaults (`kind: "midterm"`, `lengthMin: 60`). Removing pops from the end; if the popped card was approved, show an AlertDialog confirm.
- **Per-card header**: auto-label `"<Kind> <n>"` (numbered within its kind, e.g. Midterm 1, Midterm 2, Final 1). Right-side `<Select>` toggles Midterm/Final — both kinds allow multiples; labels renumber automatically.
- **Per-card length slider**: 15–180 min, step 15 (same min/max as today).
- **Per-card estimate**: reuses `questionEstimate(lengthMin, examQuestionTypes)` so it always reflects the type whitelist from the selector above. Shows total + per-type breakdown. **No Manual/Estimated toggle** — estimate is always auto-derived; professor adjusts via Edit Breakdown.
- **Edit Breakdown**: same inline-numeric UX as today, scoped to the card.
- **Per-card Approve**: replaces the single global approve. Card border highlights when approved.
- **Global "Approve Exam Rules" footer** stays, but is enabled only when **every** card is approved AND at least one question type is selected. Wording updates to "All exams approved" once satisfied.
- Editing a card's length, type, or question types resets that card's `approved` flag (mirrors today's behavior).

## Data model

### Migration (`course_ta_settings`)
Add one nullable JSONB column:

```sql
ALTER TABLE public.course_ta_settings
  ADD COLUMN exam_schedule jsonb;
```

Shape:
```json
[
  { "id": "uuid", "kind": "midterm", "lengthMin": 60,
    "breakdown": { "MCQ": 10, "True/False": 10 }, "approved": true },
  { "id": "uuid", "kind": "final",   "lengthMin": 120,
    "breakdown": { "MCQ": 20, "True/False": 20 }, "approved": false }
]
```

No new RLS — existing `course_ta_settings` policies cover it.

### App code
- Extend `TASettings` type with `examSchedule?: ExamScheduleItem[]`.
- `useTASettings` reads/writes the new column.
- **Migration-on-load**: if `examSchedule` is empty/null, synthesize a single item from the legacy `examTimeLimit` + `examManualCount` + previous estimate breakdown so existing courses don't lose data. Persist on next save.
- Keep `examTimeLimit` and `examManualCount` written for backward compatibility (mirror values from the first card) until other consumers migrate; flag them as deprecated in a code comment.

## Files to change

- `supabase/migrations/...` — add `exam_schedule jsonb` column.
- `src/types/index.ts` — add `ExamScheduleItem` and `examSchedule` on `TASettings`.
- `src/hooks/useTASettings.ts` — load/save the new field; legacy fallback.
- `src/pages/teacher/ExamMode.tsx`:
  - Remove the single `Exam Length` slider row and the single `Number of Questions` panel.
  - Add the `ExamSchedule` block described above as a new section right below the `Question Types` block.
  - Replace `examApproved` global gate logic with `examSchedule.every(s => s.approved)`.
  - `canContinue` and `handleSave` updated to persist `examSchedule`.

## Out of scope
- Exam dates / lesson-plan gating.
- Backend question generation (it can still read `examTimeLimit` from the first card during transition).
- Assessments page UI.
