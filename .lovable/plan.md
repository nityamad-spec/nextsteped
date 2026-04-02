

## Fix: Replace Raw localStorage Course ID Reads with AppContext

### Problem

9 teacher-side files read `localStorage.getItem("currentCourseId")` directly instead of using `currentCourse?.id` from `AppContext`. When localStorage is stale, cleared, or out of sync with the DB, these pages silently operate with a `null` course ID — causing empty data, failed queries, and "no data" states despite data existing in the database.

This is the same root cause already fixed in `Assessments.tsx` and `AssessmentAnalytics.tsx`.

### Affected Files

| File | Current pattern |
|---|---|
| `CourseDashboard.tsx` | `localStorage.getItem("currentCourseId")` on line 64 |
| `TeachingPlan.tsx` | `localStorage.getItem("currentCourseId")` on line 95 |
| `AITASettings.tsx` | `localStorage.getItem("currentCourseId")` on line 14 |
| `ExamMode.tsx` | `localStorage.getItem("currentCourseId")` on line 40 |
| `ConceptManagement.tsx` | `localStorage.getItem("currentCourseId")` on line 25 |
| `DiagnosticQuestionsSetup.tsx` | `localStorage.getItem("currentCourseId")` on line 200 |
| `CourseCollaborators.tsx` | `localStorage.getItem("currentCourseId")` on line 32 |
| `SettingsIntegrity.tsx` | Already has fallback but missing auto-recovery |
| `PublishEnrollment.tsx` | Already has fallback but missing auto-recovery |

`MaterialQualityCheck.tsx` and `CourseCreation.tsx` use `location.state?.courseId` as primary (setup flow), so localStorage fallback is acceptable there.

### Solution

**1. Create a shared hook: `src/hooks/useTeacherCourseId.ts`**

Extract the auto-recovery pattern (currently duplicated in Assessments and AssessmentAnalytics) into a single reusable hook:

```typescript
export function useTeacherCourseId(): string | null {
  const { currentCourse, setCurrentCourse } = useApp();
  const { user } = useAuth();

  useEffect(() => {
    if (currentCourse || !user) return;
    // Fetch from courses table (owner) then course_teachers (collaborator)
    // Call setCurrentCourse + sync localStorage on success
  }, [currentCourse, user]);

  return currentCourse?.id || localStorage.getItem("currentCourseId");
}
```

**2. Replace raw localStorage reads in all 9 files**

Each file changes from:
```typescript
const courseId = localStorage.getItem("currentCourseId");
```
To:
```typescript
const courseId = useTeacherCourseId();
```

**3. Sync localStorage when course is recovered**

The hook also writes `localStorage.setItem("currentCourseId", ...)` on recovery, keeping backward compatibility for any remaining direct reads.

### Files Modified
- `src/hooks/useTeacherCourseId.ts` — new shared hook
- `src/pages/teacher/CourseDashboard.tsx` — use hook
- `src/pages/teacher/TeachingPlan.tsx` — use hook
- `src/pages/teacher/AITASettings.tsx` — use hook
- `src/pages/teacher/ExamMode.tsx` — use hook
- `src/pages/teacher/ConceptManagement.tsx` — use hook
- `src/pages/teacher/DiagnosticQuestionsSetup.tsx` — use hook
- `src/components/CourseCollaborators.tsx` — use hook
- `src/pages/teacher/SettingsIntegrity.tsx` — use hook
- `src/pages/teacher/PublishEnrollment.tsx` — use hook
- `src/pages/teacher/AssessmentAnalytics.tsx` — replace inline recovery with hook
- `src/pages/teacher/Assessments.tsx` — replace inline recovery with hook

