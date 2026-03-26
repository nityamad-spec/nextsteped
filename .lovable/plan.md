

## Plan: Add Loading Skeleton to Teacher Onboarding

### Summary
Replace the current spinner loading state with a skeleton layout that mirrors the form structure, giving users a better visual preview while data loads.

### Changes

**File: `src/pages/teacher/TeacherOnboarding.tsx`**

1. **Import `Skeleton`** from `@/components/ui/skeleton`
2. **Replace the spinner block (lines 189–197)** with a skeleton version that preserves the page layout:
   - `SetupProgressBar` and heading render normally (static content)
   - Inside the Card, render skeleton rectangles matching the form fields: Full Name, Department, Course Code + Course Name (2-col grid), Sections, Term + Branch (2-col grid), Graduation Year, Learning Objectives, and button row
   - Each skeleton uses appropriate height (`h-10` for inputs, `h-[80px]` for textarea, `h-4 w-24` for labels)

### Files Modified
1. `src/pages/teacher/TeacherOnboarding.tsx` — replace spinner with skeleton form layout

