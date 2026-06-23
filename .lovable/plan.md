## Relabel "Week" → "Unit" and mark Coding Exercises optional (UI only)

**File:** `src/pages/student/StudentHome.tsx` (Lesson Plan card only). No data/logic/state-name changes — variables like `currentWeek`, `expandedWeeks`, `totalWeeks` stay; only user-visible strings change.

**Label changes** (Lesson Plan card region, roughly lines ~488–706):
- Header progress text: `Week {currentWeek} of {totalWeeks}` → `Unit {currentWeek} of {totalWeeks}` (line 488).
- Card description "Weekly course plan with learning outcomes and activities" → "Unit-by-unit course plan with learning outcomes and activities" (line 542).
- Empty state "No weeks are visible yet — check back soon" → "No units are visible yet — check back soon" (line 563).
- Not-yet-published message "You're currently on Week {currentWeek} of {totalWeeks}." → "You're currently on Unit {currentWeek} of {totalWeeks}." (line 558).
- Week badge label `Week {dp.day}` → `Unit {dp.day}` (line 579). Keep the existing 72px badge width.
- Weekly quiz row title `Week {dp.day} Quiz` → `Unit {dp.day} Quiz` (line 674).
- Quiz-not-available text "Quiz not yet available for this week." → "Quiz not yet available for this unit." (line 664).

**Coding exercise = optional** (inside the activities map, lines ~621–650):
- When `r.type === "coding-exercise"`, render an additional small `Badge variant="secondary"` with text `Optional` next to the existing type badge (line 632 area). Applies to every coding-exercise activity across all units.

**Out of scope:** Other surfaces ("What to Do Next", suggestion text strings, Concept Mastery Map, navigation, etc.) keep their current wording. Backend fields, DB columns, and any "week"-named code identifiers are not touched.
