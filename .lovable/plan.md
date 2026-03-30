

## Plan: Per-Day Quiz Enable/Disable Toggles

### Problem
Currently there is a single `quizEnabled` toggle that enables or disables all daily quizzes at once. Teachers want to independently control Day 1 and Day 2 quizzes (e.g., enable Day 1 but keep Day 2 disabled until ready).

### Approach
Add two new boolean columns (`quiz_day1_enabled`, `quiz_day2_enabled`) to `course_ta_settings`. The existing `quizEnabled` toggle becomes a master toggle, while individual day toggles provide granular control. On the student side, check the per-day flag before allowing a quiz start.

### Changes

**1. Database migration — add per-day columns**
```sql
ALTER TABLE course_ta_settings
  ADD COLUMN quiz_day1_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN quiz_day2_enabled boolean NOT NULL DEFAULT false;
```

**2. `src/hooks/useTASettings.ts`**
- Add `quizDay1Enabled` and `quizDay2Enabled` to the settings type and default values
- Map to/from the new DB columns in load/save

**3. `src/pages/teacher/Assessments.tsx`** — Daily Quiz Settings card
- Replace the single "Available to Students" toggle with two separate toggles:
  - **Day 1 Quiz** — controls `quiz_day1_enabled`
  - **Day 2 Quiz** — controls `quiz_day2_enabled`
- Each toggle shows the question count for that day and is independently switchable
- Both are disabled if `quizApproved` is false (same guard as before)
- The master `quizEnabled` field is auto-set to `true` if either day is enabled, `false` if both are off

**4. `src/pages/student/AIChat.tsx`**
- When starting a daily quiz, check the per-day flag (`taSettings.quizDay1Enabled` / `quizDay2Enabled`) instead of just `quizEnabled`
- Update the disabled state on the quiz start button and messaging to reflect which days are available
- If a student tries to start a disabled day, show a toast explaining it's not available yet

### Files Modified
- Database migration (new columns)
- `src/hooks/useTASettings.ts` — new fields
- `src/pages/teacher/Assessments.tsx` — per-day toggles
- `src/pages/student/AIChat.tsx` — per-day access checks

