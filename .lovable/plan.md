

## Plan: Replace Hardcoded Course with Enrollment Code Input

### Problem
The student onboarding page has a hardcoded "PY101 — Intro to Python" course. Students cannot enter an enrollment code to join a specific course. The `handleComplete` function blindly picks the first published course instead of matching by code.

### Changes to `src/pages/student/StudentOnboarding.tsx`

#### 1. Replace the disabled course Select with an enrollment code Input field
- Remove the hardcoded `courseCode = "PY101"` and `courseName = "Intro to Python"` constants
- Add state: `enrollmentCode` (string), `resolvedCourse` (object with id, name, course_code, or null), `verifyingCode` (boolean)
- Render an Input field labeled "Enrollment Code" where students type the code given by their teacher

#### 2. Add enrollment code verification
- When the student types a code and clicks a "Verify" button (or on blur/debounce), query:
  ```sql
  SELECT id, name, course_code FROM courses
  WHERE enrollment_code = :code AND published = true
  LIMIT 1
  ```
- If found: store the course in `resolvedCourse` and show the course confirmation card (name + course_code)
- If not found: show an inline error "Invalid enrollment code"

#### 3. Update the course confirmation card
- Instead of the static PY101 card, show it only when `resolvedCourse` is set, displaying the actual course name and code from the DB

#### 4. Update validation
- Add `resolvedCourse` to the `isValid` check (enrollment code must resolve to a real course)

#### 5. Update `handleComplete`
- Remove the "find first published course" query
- Use `resolvedCourse.id` directly for the enrollment insert
- Pass actual `resolvedCourse.name` and `resolvedCourse.course_code` to `setStudentProfile` and `setCurrentCourse`
- Remove the `mockCourse` import (no longer needed)

### Files Modified
1. `src/pages/student/StudentOnboarding.tsx` — all changes above (single file edit)

