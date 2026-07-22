## Phase 3 — Quiz delivery (WeeklyQuizDialog + AssessmentView)

Wire reasoning follow-ups into the weekly-quiz UI. Exam and Exam-Practice paths are untouched.

### 1. Fetch follow-ups (`WeeklyQuizDialog.tsx`)

- Change the existing `assessment_questions` select to include `id, question_role, parent_question_id` (already implicit via `select("*")` — no query change needed) but explicitly split rows client-side:
  - `primaries` = rows with `question_role === 'primary'` (or null, for legacy rows written before Phase 1).
  - `reasonings` = rows with `question_role === 'reasoning'`.
- Feed only `primaries` into the existing tier-shuffle / adaptive selection (so counters, seeded shuffle, and standard/adaptive slot logic are unchanged).
- Build `followupsByParentId: Map<string, Question>` from `reasonings`, mapping the shared `Question` shape from the same `mapRow` helper (reasoning rows always have `question_type === "MCQ"`).
- Pass the map to `AssessmentView` via a new optional prop `followupsByParentId?: Map<string, Question>`. Only populated for `type === "quiz"`; exam callers omit it.
- No fetch retry — if a reasoning row fails to appear, the AssessmentView gap-handling below covers it.

### 2. Type + prop plumbing (`AssessmentView.tsx`)

- Extend the component's props type with `followupsByParentId?: Map<string, Question>`.
- Extend the two answer-state stores keyed by primary question id:
  - `followupAnswers: Record<string, string>` — the selected follow-up option.
  - `followupCorrectness: Record<string, boolean | null>` — `true` / `false` / `null` (null = follow-up unavailable, treated as no-effect downstream).
- These are read-only for the render layer in this phase; Phase 4 will forward them into result submission.

### 3. Render + gating (quiz mode only, in the per-question card path around lines 239–316 and the Next/Previous block around 580–625)

When `isQuiz` and the current primary has both an answer AND an available follow-up:

- Compute `primaryCorrect` locally by comparing `answers[q.id]` to `q.correctAnswer` (already available in the mapped `Question`).
- If `primaryCorrect === false`: follow-up never renders; existing lock/Next behavior applies (unchanged from Phase 2's plan-file behavior).
- If `primaryCorrect === true` and `followupsByParentId.get(q.id)` exists:
  - Render the follow-up as an inline card below the primary card (same MCQ radio layout).
  - Selecting a follow-up option writes to `followupAnswers[q.id]` and computes `followupCorrectness[q.id]`.
  - After selection, reveal the follow-up's `correctAnswer` and `explanation` inline (correct/incorrect marker + rationale). No mastery / penalty / points wording — pure teaching moment.
- Gating for the Next button:
  - Follow-up needed AND rendered AND unanswered → Next disabled.
  - Follow-up answered → Next enabled; on click, add `safeIndex` to `lockedIndices` (already in `.lovable/plan.md`) which also locks the follow-up card because the follow-up is scoped to that primary index.
  - No follow-up exists for the primary (gap): Next unlocks as today, `followupCorrectness[q.id]` stays absent so Phase 5 sees "no follow-up shipped".
  - Follow-up map has an entry but the row is malformed (missing options, etc.) → treat as unavailable, unlock Next, set `followupCorrectness[q.id] = null`.
- Question counter (`Question X of N`) is already computed from the primaries array — no change.

### 4. Locking the follow-up UI

- Once `followupAnswers[q.id]` is set, disable the follow-up's `RadioGroup` (`disabled` prop) so it visually matches the "answered and moving on" state; the existing `lockedIndices` gate already prevents returning to the primary via Previous.
- No change to Previous button rules — Phase 2's `lockedIndices` behavior in `.lovable/plan.md` already covers "cannot revisit answered primaries".

### 5. Defensive gap handling (explicit)

| Situation | UI behavior | State recorded |
|---|---|---|
| Primary Bloom<3 (no follow-up expected) | As today | `followupCorrectness[q.id]` absent |
| Primary Bloom≥3, follow-up row present, primary answered correctly | Render follow-up, require answer, reveal explanation | `true` / `false` |
| Primary Bloom≥3, follow-up row present, primary answered incorrectly | Follow-up not shown | `followupCorrectness[q.id]` absent |
| Primary Bloom≥3, follow-up row missing (Phase 2 drop-and-backfill edge case) | Next unlocks normally | absent |
| Follow-up row present but malformed / render errors | Next unlocks, no block | `null` |

### 6. Out of scope for Phase 3

- No changes to `assessment_results` payload shape (Phase 4).
- No mastery bonus / penalty math (Phase 5).
- No exam mode changes; `AssessmentView` behavior when `type !== "quiz"` is byte-identical.
- No new DB queries beyond the existing `assessment_questions` select.
- No tests added or updated in this phase; existing `WeeklyQuizDialog.test.tsx` continues to pass (it doesn't exercise Bloom≥3 rows).

### Risks / constraints

- **Legacy quiz rows** (pre-Phase-1) have `question_role = 'primary'` by default from the migration, so no back-compat issue for existing quizzes — reasoning rows simply don't exist for them and the Map is empty.
- **Correctness comparison client-side** relies on `q.correctAnswer` being present in the mapped `Question`. It already is (line 111 of WeeklyQuizDialog). No API round-trip for correctness in this phase; Phase 4 can revisit if we decide to hide correctAnswer from client payloads.
- **Adaptive tier filter drops some primaries** but their reasoning rows are still fetched. Filtering the Map after tier selection avoids carrying dead entries, but it's harmless either way — we look up by primary id which won't appear in the delivered set. I'll filter for tidiness.
- **`lockedIndices`** must integrate cleanly with the plan-file behavior from Phase 2 of the earlier plan (`.lovable/plan.md`). No conflict — that plan locks on Next click after primary answered; Phase 3 additionally requires follow-up answered before Next is clickable.

### Files touched

- `src/components/WeeklyQuizDialog.tsx` — split rows, build map, pass prop.
- `src/components/AssessmentView.tsx` — accept prop, add follow-up state, inline render + gating in quiz mode.
