

## Plan: Seed-Based Deterministic Shuffle for Diagnostic Quiz

### Problem
The current Fisher-Yates shuffle uses `Math.random()`, so refreshing mid-quiz gives a different question order, which could confuse students or break the back-navigation state.

### Approach
Use a seeded pseudo-random number generator (PRNG) where the seed is derived from `user.id + courseId`. This ensures the same student always gets the same question order for the same course, even across refreshes or sessions.

### Changes

**`src/pages/student/DiagnosticQuiz.tsx`**
- Add a simple seeded PRNG function (e.g., mulberry32 or similar — pure math, no dependencies)
- Generate the seed by hashing `user.id + courseId` into a 32-bit integer (simple string hash)
- Replace `Math.random()` in the Fisher-Yates shuffle with the seeded PRNG
- No other logic changes needed — the shuffle still runs once during initialization

### Technical Detail
```text
seed = hashString(userId + courseId) → 32-bit integer
prng = seededRandom(seed) → returns 0-1 float each call
shuffle uses prng instead of Math.random()
```

### No database or migration changes needed

### Files Modified
- `src/pages/student/DiagnosticQuiz.tsx`

