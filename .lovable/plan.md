

## Plan: Add Course Code Input to Teacher Onboarding

### Summary
Replace the hardcoded `courseCode = "PY101"` and `courseName = "Intro to Python"` constants with editable state fields, adding a `course_code` input and making the course name editable. The `course_code` value will be persisted to the `courses.course_code` column.

### Changes

**File: `src/pages/teacher/TeacherOnboarding.tsx`**

1. **Convert constants to state** — change `courseCode` and `courseName` from constants to `useState` variables
2. **Load existing values** — add `course_code, name` to the course select query; populate state on fetch
3. **Add course_code input field** — place it next to (or above) the existing Course field; text input with placeholder like "PY101"
4. **Make course name editable** — replace the disabled `<Select>` with an `<Input>` for the course name
5. **Include in validation** — add `courseCode.trim()` and `courseName.trim()` to the `isValid` check
6. **Persist on save** — add `course_code: courseCode` to the `coursePayload` object that gets inserted/updated in the `courses` table

### Files Modified
1. `src/pages/teacher/TeacherOnboarding.tsx`

