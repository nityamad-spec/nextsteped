

## Plan: Randomize Diagnostic Question Sequence

### Problem
Currently, all students see diagnostic questions in the same fixed order (sorted by `item_code`). This makes it easier to share answers.

### Approach
Shuffle the questions on the client side after fetching them from the database, using a Fisher-Yates shuffle. The shuffled order is set once when the quiz initializes and preserved throughout the session (so navigating back/forward keeps the same order).

### Changes

**`src/pages/student/DiagnosticQuiz.tsx`**
- After fetching and filtering questions (the `in_test` query), shuffle the array using Fisher-Yates before storing in state
- Shuffle only runs once during initialization (not on re-renders or auth refreshes), respecting the existing initialization guard

### No database or migration changes needed
Question order is purely a presentation concern.

