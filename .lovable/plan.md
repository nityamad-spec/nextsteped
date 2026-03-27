

## Plan: Streamlined Student Signup with Enrollment Code

### Current Flow
1. Landing → Select Student → Auth page (name + email + password)
2. Email verification → Login
3. StudentOnboarding page (university, degree, branch, year, roll number, enrollment code)
4. Diagnostic quiz

### Problem
The enrollment code is only entered during onboarding (step 3), after the student has already created an account. There is no upfront validation that the student has a valid course to join. The "student roster" concept is bypassed — any student can sign up freely.

### Proposed Flow
1. Landing → Select Student → Auth page (name + email + password + **enrollment code**)
2. Enrollment code is verified against published courses **before** account creation
3. Email verification → Login
4. StudentOnboarding page (university, degree, branch, year, roll number — **no enrollment code here**)
5. Enrollment record is created during onboarding using the code stored in user metadata
6. Diagnostic quiz

### Changes

#### 1. `src/pages/Auth.tsx`
- Add an enrollment code input field (visible only for student signup, not login)
- Add a "Verify" button that checks the code against the `courses` table (same logic as current `StudentOnboarding`)
- Show the resolved course name on successful verification
- Block signup submission until the enrollment code is verified
- Pass the verified enrollment code in `signUp()` user metadata: `data: { name, role, enrollment_code }`

#### 2. `src/pages/student/StudentOnboarding.tsx`
- Remove the enrollment code input section entirely
- On mount, read the enrollment code from `user.user_metadata.enrollment_code`
- Auto-resolve the course from the code and display it as a read-only confirmation card
- Create the enrollment record during `handleComplete` using the metadata code (same as today)
- Remove `enrollmentCode`, `resolvedCourse`, `verifyingCode`, `codeError` state and the verify function

#### 3. `src/contexts/AuthContext.tsx`
- Update `signUp` to accept an optional `enrollment_code` parameter
- Include it in `options.data` metadata when provided

### No Database Changes Required
The enrollment code is already stored in the `courses` table with auto-generation. User metadata in Supabase auth naturally supports extra fields. No new tables or columns needed.

### Files Modified
1. `src/pages/Auth.tsx` — add enrollment code field for student signup
2. `src/pages/student/StudentOnboarding.tsx` — remove enrollment code input, read from metadata
3. `src/contexts/AuthContext.tsx` — pass enrollment_code in signup metadata

