## Add "Delete permanently" for archived mock tests

Add a destructive action next to each archived exam's "Restore" button in `src/pages/teacher/ExamMode.tsx`.

### UI
- New `Trash2` icon button on each archived row (right side, before/after Restore).
- Opens an `AlertDialog` confirmation showing:
  - Exam label + archived date
  - Question count that will be deleted
  - Count of past student submissions attached to this `exam_id` (fetched on open)
  - Explicit warning: **"This cannot be undone."**
- Requires typing the exam label (or a checkbox) to confirm — cheap guard against accidental clicks.

### Behavior on confirm
1. Delete rows from `assessment_questions` where `exam_id = ex.id`.
2. Delete the `course_exams` row itself.
3. Leave `assessment_results` rows untouched (see "What happens to submissions" below).
4. Refresh the archived list; toast success.

### What happens to student submissions
Student attempts live in `assessment_results` and reference the exam via a plain `exam_id` column. There is **no foreign-key constraint** on `assessment_results.exam_id → course_exams.id`, so a delete does not cascade and does not block.

Two options — recommend Option A:

- **Option A (recommended): Preserve submissions, orphan the `exam_id`.**
  - Student scores, mastery contributions, analytics history, and admin dashboards stay intact.
  - The label reference is lost: rows will show as "Unknown exam" wherever we look up label by `exam_id`.
  - We mitigate by writing the archived `label` into a small `deleted_exam_labels` lookup, OR by simply displaying "Deleted exam" in analytics (simpler; recommended for MVP).

- **Option B: Hard-delete submissions too.**
  - Cleaner data model, but destroys history: student mastery already computed from that exam stays, but the underlying evidence disappears; admin `/admin/courses` "avg score" and completion counts shift retroactively. Not recommended.

### Risks
1. **Irreversible** — unlike archive, there is no undo. Confirmation dialog is the only guard.
2. **Orphaned references in analytics** — `assessment_results.exam_id`, teaching insights, and any cached label lookups will point to a missing row. Impact is cosmetic ("Unknown exam") unless we handle it in the label resolver.
3. **Concurrent regeneration/restore** — if another teacher session tries to restore or regenerate the same exam mid-delete, they'll see a "not found" error. Acceptable; toast handles it.
4. **Question re-use** — questions are exam-scoped in `assessment_questions`, so no shared-question fallout.
5. **Naming collisions later** — freeing "Final 3" lets a future add reuse the label, which may confuse anyone reading old submission exports. Low risk.
6. **RLS** — teacher already has delete rights on `course_exams` and `assessment_questions` for their course; no policy changes needed.

### Out of scope
- No schema migrations, no FK addition, no changes to `assessment_results`.
- No bulk "delete all archived" action (can add later if needed).
