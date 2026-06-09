## Changes to `/teacher/setup/exam-mode`

Scope: UI/label-only edits to `src/pages/teacher/ExamMode.tsx`. No schema, hook, or backend changes — `exam_schedule.kind` stays `"midterm" | "final"` in the type system for backward compatibility, but the UI will only ever produce/show `"final"`.

### 1. Remove Midterm as a selectable type
- Per-exam type `<Select>` (line ~462): remove the `Midterm` `<SelectItem>`, leaving only `Final`. Since there's only one option, replace the Select with a static read-only "Final" badge/label to avoid a pointless dropdown.
- Default `kind` for new exams (lines 111 and 205, inside `createExam` / initial state) changes from `"midterm"` to `"final"`.
- Auto-label counter (lines 260–265): simplify to just `Final N` numbering.
- Helper text (line 434): change `"Add 1 – {MAX_EXAMS} exams (midterm or final)"` → `"Add 1 – {MAX_EXAMS} mock tests"`.
- Migration-on-load in `useTASettings.ts` is untouched; any legacy `"midterm"` already saved will still load fine but will be re-saved as-is until the user edits. (If you'd like me to also coerce loaded `midterm` → `final` on load, say so — I left it out to avoid silent data mutation.)

### 2. Rename header
- Line 433: `"Number of Exams This Semester"` → `"Number of Mock Tests Generated"`.

### Out of scope
- DB column names, `ExamScheduleItem.kind` type, and legacy `examTimeLimit` / `examApproved` mirrors remain unchanged.
- No other pages (dashboards, analytics) are touched.
