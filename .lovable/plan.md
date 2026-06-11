# Eliminate remaining hardcoded / mock data dependencies

## Scan results

Everything user-facing in the app reads from Supabase except the surfaces below. Three buckets: **fake numbers shown to users**, **stale defaults leaking through `currentCourse`**, and **dead static data still imported**.

### A. Fake numbers shown to users

| Surface | Hardcoded data | Source |
|---|---|---|
| `/student/progress` (StudentProgress) | "Overall Mastery", "Topic Strengths", "Areas to Improve" computed from `mockTopics` (Python-only, fake percentages). Plus literals: `62%` Exam Readiness, `4 days` Learning Streak, `learningJourney` Aug–Nov 2025 timeline. | `src/data/mockData.ts` + inline |
| `src/pages/teacher/StudentInsights.tsx` | Entire page: `weeklyEngagement`, `masteryMovement`, `topicDetails`, `mockDashboard.activeStudents/atRiskCount`, `mockTopics` heatmap, literal `72%` Class Avg Mastery, `6.6` Avg Sessions/Student. **Imported in `App.tsx` but never routed — dead.** | `mockData.ts` + inline |

### B. Stale defaults leaking via `currentCourse`

`mockCourse` (Intro to Python, sections `["Section A","Section B"]`, `startDate "2025-08-25"`, `endDate "2025-12-15"`, `published: true`, `syllabusUploaded: true`, `materialsUploaded: true`, `enrollmentCode "NEXTPY101"`) is spread into `setCurrentCourse({...mockCourse, …})` in two places:

- `src/pages/teacher/TeacherOnboarding.tsx`
- `src/pages/teacher/NewCoursePage.tsx`

The bogus sections/dates then surface as defaults in `SettingsIntegrity`, `PublishEnrollment`, `EnrollmentSettings`, `CourseDashboard`, and (separately) a literal `["Section A","Section B"]` fallback in `SettingsIntegrity.tsx:92`.

`src/contexts/AppContext.tsx` also imports `mockCourse` but doesn't reference it — dead import.

### C. Dead static modules

- `src/data/mockData.ts` exports — unreferenced: `mockQuizQuestions`, `mockSyllabusRecommendations`, `mockContentItems`, `mockLearningChatMessages`, `mockExamChatMessages`, `availableCourses`.
- `src/data/workshopPlan.ts` — the `workshopPlan` array and `WorkshopResource/WorkshopDay/groupResourcesByConcept` exports are no longer imported anywhere; the legacy "Workshop" naming also violates the "Lesson Plan" memory rule.
- `availableDepartments` — still used by `TeacherOnboarding` and `TeacherApplicationForm`. Real list, low-churn, fine to keep as a static constant; **not** treated as a bug here.
- `defaultTASettings`, `defaultStudyPrompt`, `defaultExamPrompt` — these are legitimate seed defaults, **kept**.

## Fix plan

### 1. Stop spreading `mockCourse` into `currentCourse`

In `TeacherOnboarding.tsx` and `NewCoursePage.tsx`, replace `setCurrentCourse({ ...mockCourse, id, name, term, objectives, enrollmentCode })` with an explicit, honest object:

```ts
setCurrentCourse({
  id,
  name,
  term,
  objectives,
  enrollmentCode,
  sections: [],          // populated when professor adds rosters
  startDate: "",         // set in EnrollmentSettings
  endDate: "",
  syllabusUploaded: false,
  materialsUploaded: false,
  published: false,
});
```

Make any required-but-missing fields in the `Course` type optional if the type currently forbids `""`/`[]` — already mostly nullable per the existing `currentCourse?.…` access patterns.

In `src/pages/teacher/SettingsIntegrity.tsx` line 92, remove the literal `["Section A", "Section B"]` fallback; render an empty-state ("No sections added yet") when `currentCourse?.sections` is empty.

Drop the unused `mockCourse` import from `src/contexts/AppContext.tsx`.

### 2. Replace `/student/progress` content

Per memory, Student Progress is marked "Soon" in the nav. Two options:

- **Recommended:** Replace the routed component with a real "Coming Soon" placeholder card (matches the nav state). Removes every fake percentage and the `mockTopics` dependency in one shot. Tiny diff.
- Alternative: rebuild the stats from `student_concept_mastery` / `student_course_mastery` / `chat_sessions` / `assessment_results` — heavier, but the data is already there. Reuse the same loader pattern already implemented on `StudentHome` for concept mastery.

Pick **placeholder now**; revisit when the page is actually being built out.

### 3. Delete dead code

- Delete `src/pages/teacher/StudentInsights.tsx` and remove its `App.tsx` import (no route references it).
- Delete `src/data/workshopPlan.ts`.
- Remove these unused exports from `src/data/mockData.ts`: `mockCourse`, `mockTopics`, `mockQuizQuestions`, `mockSyllabusRecommendations`, `mockContentItems`, `mockDashboard`, `mockLearningChatMessages`, `mockExamChatMessages`, `availableCourses`. Keep only `defaultStudyPrompt`, `defaultExamPrompt`, `defaultTASettings`, `availableDepartments`. Consider renaming the file to `src/data/defaults.ts` for clarity, but that's optional.

### 4. Verification

- TypeScript build passes (the agent loop runs it automatically).
- Grep `rg -n "mock|getQuizQuestions|getExamQuestions|workshopPlan|StudentInsights" src` returns nothing actionable.
- Smoke check in preview: `/teacher/courses/new` and `/teacher/onboarding` create a course; `SettingsIntegrity` and `PublishEnrollment` no longer show ghost sections/dates; `/student/progress` shows the Coming Soon card.

## Out of scope

- Building out a real Student Progress page (heavier feature; placeholder now keeps it honest).
- Moving `availableDepartments` into the DB — present list is fine for now.
- Backfilling existing local-storage `ns_current_course` entries that already carry stale mock fields. Next professor save will overwrite them; we accept one stale render per user as the migration cost.
