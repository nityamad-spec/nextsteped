

## Plan: Standardize Mastery Levels to Expert / Proficient / Progressing / Beginner

### Problem
Two different naming schemes exist:
- Diagnostic quiz uses: Expert, Advanced, Intermediate, Beginner
- Dashboard/insights use: Expert, Proficient, Developing, Beginner
- Target: **Expert, Proficient, Progressing, Beginner** everywhere

### Changes

**1. `src/types/index.ts`**
- Change `learnerLevel` type from `"Beginner" | "Intermediate" | "Advanced" | "Expert"` → `"Beginner" | "Progressing" | "Proficient" | "Expert"`

**2. `src/pages/student/DiagnosticQuiz.tsx`**
- Update level assignment: `"Advanced"` → `"Proficient"`, `"Intermediate"` → `"Progressing"`

**3. `src/pages/student/Progress.tsx`**
- Update learning journey labels: `"Intermediate"` → `"Progressing"`, `"Advanced"` → `"Proficient"`

**4. `src/pages/teacher/CourseDashboard.tsx`**
- Rename all `Developing` → `Progressing` in `masteryColors`, `masteryBarColors`, `topicInsights` keys, and `weeklyData` keys

**5. `src/pages/teacher/StudentInsights.tsx`**
- Rename `Developing` → `Progressing` in `levelColors` and all references

**6. CSS + Tailwind rename**
- `src/index.css`: Rename `--mastery-developing` → `--mastery-progressing` (both light/dark themes)
- `tailwind.config.ts`: Rename `mastery-developing` → `mastery-progressing`
- Update all class references from `mastery-developing` → `mastery-progressing` in CourseDashboard, StudentInsights

**7. Database migration**
- Update existing `diagnostic_results.learner_level` values: `'Advanced'` → `'Proficient'`, `'Intermediate'` → `'Progressing'`
- Update existing `profiles.learner_level` values similarly

### Files Modified
- `src/types/index.ts`
- `src/pages/student/DiagnosticQuiz.tsx`
- `src/pages/student/Progress.tsx`
- `src/pages/teacher/CourseDashboard.tsx`
- `src/pages/teacher/StudentInsights.tsx`
- `src/index.css`
- `tailwind.config.ts`
- 1 database migration (update existing level strings)

