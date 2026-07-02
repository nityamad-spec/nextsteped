# Fix truncated analytics in Course Profile dialog

**Root cause:** `CourseProfileDialog` fetches `assessment_results` and `chat_messages` with a single `.select()` call. Both tables can exceed the PostgREST default 1,000-row cap for popular courses. For *Introduction to Generative AI*, `assessment_results` has **4,030 rows** but only 1,000 come back, so the completion tile shows **3** instead of the actual **102**. Every downstream stat derived from these rows (weekly-quiz breakdown, exam attempts, avg scores, chat message counts) is under-reported.

**Scope:** `src/components/admin/CourseProfileDialog.tsx` only. No schema, no RLS, no logic changes to completion criteria — just full pagination of the two unbounded fetches.

## Changes

### 1. Add a paginated fetch helper (local to the file)

```ts
async function fetchAll<T>(
  build: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>,
  pageSize = 1000,
): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await build(from, from + pageSize - 1);
    if (error) throw error;
    const chunk = data ?? [];
    out.push(...chunk);
    if (chunk.length < pageSize) break;
  }
  return out;
}
```

### 2. Paginate `assessment_results`

Replace the single `.select("student_id, mode, quiz_day, exam_id, score, total_questions").eq("course_id", courseId)` with a `fetchAll` loop that applies `.range(from, to)` and an `.order("id")` (or `.order("created_at")`) for stable pagination.

### 3. Paginate `chat_messages`

`chat_messages` is fetched via `.in("session_id", sessionIds)` — same cap applies. Wrap it in the same helper and paginate. If `sessionIds.length` is very large, chunk the `IN` list into batches of ≤500 to keep the URL under limits, then paginate within each batch.

### 4. Keep everything else identical

- No change to the completion rule (`quizzesOk && examsOk && masteryOk`).
- No change to realtime subscriptions or debounce.
- No new dependencies.

## Verification

After the change, re-open the dialog for *Introduction to Generative AI* with **All universities** selected. Expected:
- Completed tile: ~102 (matches DB check)
- Not completed tile: 366 − 102 = 264
- "Completed all 14" quiz row: ~192
- Weekly quiz Total attempts and Exam Total attempts should both jump to their true counts

Spot-check by opening the Completed list and confirming Vallabh Dasari and Somayajula Keerti Madhavi both appear.

## Non-goals

- No changes to `AdminStudents` or `StudentProfileDialog` — will inspect separately if any of their queries also risk the 1k cap once this fix ships.
- No change to completion definition (all weekly quizzes + all active exams + mastery ≥ proficient).
