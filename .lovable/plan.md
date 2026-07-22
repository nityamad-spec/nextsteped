## Phase 4 — Results & storage

Extend `AssessmentResults.answers` entries with reasoning follow-up fields. No DB schema change (`assessment_results.answers` is jsonb). Primary counts stay primary-only, so no analytics regression.

### 1. Extend `StandardisedAnswer` (`src/components/AssessmentView.tsx`)

Add optional fields to the interface (all optional so exam/practice callers and legacy rows are unaffected):

```ts
reasoning_question_id?: string | null;
reasoning_selected?: string | null;
reasoning_correct?: string | null;
reasoning_is_correct?: boolean | null;  // tri-state, see below
reasoning_bloom?: number | null;
```

### 2. Populate fields in `handleFinish` (quiz mode only)

Inside the `questions.map(q => ...)` that builds `standardised`:

- Look up `followupsByParentId?.get(q.id)`.
- Compute `primaryCorrect` the same way the render layer does (via `isPrimaryCorrect`).
- Cases:
  - Primary incorrect, or `followupsByParentId` undefined, or no entry for `q.id` → do NOT set any reasoning_* fields (undefined → serializes as absent in jsonb; consumers already treat as optional).
  - Follow-up exists AND primary correct AND `followupCorrectness[q.id] === null` (malformed / load failure branch already in Phase 3) → emit `reasoning_question_id`, `reasoning_correct`, `reasoning_bloom` from the follow-up row + `questionMeta`; `reasoning_selected = null`, `reasoning_is_correct = null`.
  - Follow-up exists AND primary correct AND `followupAnswers[q.id]` set → emit all five fields, `reasoning_is_correct` = `followupCorrectness[q.id]` (`true` | `false`).
- `reasoning_bloom` is read from the existing `questionMeta` map, which `WeeklyQuizDialog.mapRow` already populates for reasoning rows (line 99 of that file). No new fetch.

`totalQuestions`, `correctAnswers`, `flatScore`, and `weightedScore` continue to iterate over primaries only — no change to the counting or weighting math.

### 3. Pass-through in `WeeklyQuizDialog.handleSubmit`

- The existing `.insert({ ..., answers: (results.answers ?? []) as unknown as Json })` already forwards the full array; extended fields flow through unchanged.
- The `invokeUpdateMastery` mapper reads only `a.topic`, `a.question_id`, and `a.is_correct` today (lines 36–44). It keeps working untouched — Phase 5 will extend it to consume `reasoning_*` fields, but Phase 4 leaves it alone.

### 4. Consumer verification (grep-and-verify pass)

Confirm existing readers of `answers[]` treat reasoning fields as absent-safe. All are read-only over primary fields today:

- `src/components/AssessmentView.tsx` review phase — reads `a.is_correct`, `a.selected`, `a.correct`, `a.question_text`, `a.topic`. Unaffected.
- `src/components/WeeklyQuizReviewDialog.tsx` — no direct field reads of the array (verified: no matches).
- `src/pages/teacher/AssessmentAnalytics.tsx` (lines 213–214) — iterates `r.answers as any[]`, reads primary fields only. Unaffected.
- `supabase/functions/update-mastery/index.ts` — comment-only reference; the per-question payload is built client-side in `WeeklyQuizDialog`. Unaffected.
- Admin analytics components — no reads of the answers array shape (verified: no matches in `src/components/admin/*.tsx`).

No consumer changes required in Phase 4. The extension is purely additive.

### 5. Explicit `reasoning_is_correct` semantics

| Situation | `reasoning_is_correct` |
|---|---|
| Primary Bloom<3, no follow-up | field absent |
| Primary answered incorrectly | field absent |
| Follow-up shown, student answered correctly | `true` |
| Follow-up shown, student answered incorrectly | `false` |
| Follow-up row missing for a Bloom-3+ primary (Phase 2 drop/demote edge case) | field absent |
| Follow-up row present but malformed / failed to load | `null` |

Phase 5 keys directly off this tri-state (absent vs. null vs. boolean).

### 6. Out of scope

- No mastery math changes (Phase 5).
- No exam / practice / diagnostic path changes; `followupsByParentId` remains quiz-only.
- No new DB migrations.
- No changes to `total_questions` / `correct_answers` / `score`.

### Risks / constraints

- **`questionMeta` for reasoning rows**: already populated by `WeeklyQuizDialog.mapRow` for all rows before the primary/reasoning split, so `reasoning_bloom` lookup is guaranteed for shipped follow-ups. No extra plumbing needed.
- **jsonb `undefined` handling**: `undefined` in `JSON.stringify` drops the key, so "field absent" is representable natively. `null` remains distinct for the "shown-but-unusable" case Phase 5 needs.
- **Exam / practice callers**: `followupsByParentId` is undefined for them (`WeeklyQuizDialog` is the only populator). The new logic short-circuits when the map is absent, so their `answers[]` payloads are byte-identical.
- **`WeeklyQuizDialog.test.tsx`**: doesn't exercise reasoning fields; continues to pass.

### Files touched

- `src/components/AssessmentView.tsx` — extend `StandardisedAnswer`, populate reasoning fields in `handleFinish`.

No other files require edits in Phase 4.