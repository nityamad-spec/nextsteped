

## Plan: Dynamic Quiz Days (Beyond Day 1 & Day 2)

### Problem
Quiz days are currently hardcoded to Day 1 and Day 2 — in the database columns (`quiz_day1_enabled`, `quiz_day2_enabled`), the types, the teacher UI toggles, and the student quiz buttons. Adding more days requires schema changes each time.

### Approach
Replace the two boolean columns with a single JSONB column `quiz_days_enabled` (e.g. `[1, 2, 5]`) that stores which day numbers are enabled. The teacher UI dynamically discovers which days exist from the questions tagged with `quiz_day`, and renders a toggle for each. The student UI renders a button per enabled day.

### Changes

**1. Database migration**
```sql
ALTER TABLE course_ta_settings
  ADD COLUMN quiz_days_enabled jsonb NOT NULL DEFAULT '[]'::jsonb;
```
Keep the old `quiz_day1_enabled` / `quiz_day2_enabled` columns for now (no data loss), but stop using them in code.

**2. `src/types/index.ts`**
- Remove `quizDay1Enabled` and `quizDay2Enabled`
- Add `quizDaysEnabled: number[]`
- Change `quizDay?: 1 | 2` references to `quizDay?: number`

**3. `src/hooks/useTASettings.ts`**
- Map `quiz_days_enabled` JSONB to/from `quizDaysEnabled: number[]`
- Keep backward compat: on load, if `quiz_days_enabled` is empty but old boolean columns are true, seed the array accordingly
- On save, write the array to `quiz_days_enabled` and set `quiz_enabled = array.length > 0`

**4. `src/pages/teacher/Assessments.tsx`**

*Question form dialog:*
- Replace the Day 1 / Day 2 button pair with a number input (or incrementing selector) so teachers can assign any day number
- Change `formQuizDay` type from `1 | 2` to `number`

*Daily Quiz Settings card — enable/disable toggles:*
- Derive the list of existing days from questions: `const uniqueDays = [...new Set(quizQuestions.map(q => q.quizDay).filter(Boolean))].sort()`
- Render a toggle row for each day dynamically (same UI pattern as current Day 1/Day 2, but in a loop)
- On toggle change, add/remove the day number from `taSettings.quizDaysEnabled` array

*Filter bar:*
- Replace hardcoded `[1, 2]` day filter buttons with the dynamic `uniqueDays` list

**5. `src/pages/student/AIChat.tsx`**
- Replace the two hardcoded Day 1 / Day 2 buttons with a dynamic loop over `taSettings.quizDaysEnabled`
- Each button: `Day {n} Quiz`, disabled if `n` is not in `quizDaysEnabled`
- Update the auto-start `useEffect` to check `taSettings.quizDaysEnabled.includes(urlDay)`

**6. `src/data/questionBank.ts`** (static fallback)
- No structural changes needed — the `day` field already supports any number

### Files Modified
- Database migration (new `quiz_days_enabled` JSONB column)
- `src/types/index.ts` — dynamic day types
- `src/hooks/useTASettings.ts` — JSONB array mapping
- `src/pages/teacher/Assessments.tsx` — dynamic day selector, toggles, filters
- `src/pages/student/AIChat.tsx` — dynamic quiz day buttons
- `src/data/mockData.ts` — update default settings

