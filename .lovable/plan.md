# Persist Diagnostic Quiz Progress Across Refreshes

## Problem

If a student refreshes the page (or accidentally navigates away and back) during the diagnostic quiz, all in-progress answers, the current question index, the in-progress text/MCQ selection, and the confidence value are lost. They have to start over from question 1.

## Goal

Persist quiz progress per `(student, course)` to `localStorage` so that on reload, the student resumes exactly where they left off — same question index, same prior answers/confidences/timings, and any partially entered current-question response.

Backend storage is intentionally not used: the diagnostic submits a single `diagnostic_results` row only when the quiz is finished. Per-question persistence is purely client-side and disposable, so `localStorage` is the right tool and avoids extra DB writes.

## Approach

All changes live in `src/pages/student/DiagnosticQuiz.tsx`.

### 1. Storage key

Use a per-student, per-course key:

```
diagnosticProgress:{userId}:{courseId}
```

This isolates progress so switching course or user never cross-contaminates state.

### 2. Saved shape

```ts
type SavedProgress = {
  v: 1;                          // schema version for forward-compat
  phase: "quiz";                 // only persist while actively taking the quiz
  currentQ: number;
  answers: number[];             // committed MCQ/T-F answers (one per finished Q)
  textAnswers: string[];         // committed short-answer text (one per finished Q)
  confidences: number[];         // committed confidence per finished Q
  questionTimes: number[];       // committed elapsed time per finished Q
  questionIds: string[];         // committed question ids (for ordering integrity)
  selected: number | null;       // in-progress MCQ/T-F selection on current Q
  textAnswer: string;            // in-progress short-answer text on current Q
  confidence: number | null;     // in-progress confidence on current Q
  questionStartTime: number;     // so timing stays roughly accurate after reload
  savedAt: number;
};
```

### 3. Restore on init

After the questions are fetched and shuffled (and before falling through to `setPhase("intro")`):

- Read `localStorage[diagnosticProgress:{user.id}:{courseId}]`.
- If present and `questionIds` is a prefix of the freshly shuffled question id order (sanity check that the question set hasn't changed), restore all fields and call `setPhase("quiz")` instead of `"intro"`.
- If the saved data is corrupt, mismatched, or for a different question set, ignore it and remove the key.

The seeded shuffle already guarantees the same student gets the same order for the same course, so the prefix check will normally pass.

### 4. Save on changes

Add an effect that runs whenever any of the persisted fields change AND `phase === "quiz"` and we have an `activeCourseId` and `user`:

```ts
useEffect(() => {
  if (!user || !activeCourseId || phase !== "quiz") return;
  const payload: SavedProgress = { v: 1, phase, currentQ, answers, textAnswers,
    confidences, questionTimes, questionIds, selected, textAnswer, confidence,
    questionStartTime, savedAt: Date.now() };
  try {
    localStorage.setItem(`diagnosticProgress:${user.id}:${activeCourseId}`,
      JSON.stringify(payload));
  } catch {}
}, [user, activeCourseId, phase, currentQ, answers, textAnswers, confidences,
    questionTimes, questionIds, selected, textAnswer, confidence,
    questionStartTime]);
```

### 5. Clear on completion / abandonment

Remove the saved key in three places:

- After the final-question `diagnostic_results` insert succeeds (right before `setPhase("result")`).
- In the early-return branch where an existing `diagnostic_results` row was found for the student/course (already-completed safety cleanup).
- In the Back-button handler when `currentQ === 0` (i.e. the student backs out to `/student/onboarding`).

### 6. Preserve existing behavior

- Auto-confidence init effect (`setConfidence(50)` once `hasAnswer` is true) is unchanged.
- Seeded-shuffle order is unchanged, so resume order matches.
- Question timing on the current question restarts from the saved `questionStartTime`; on the next-question transition it continues to use `Date.now()` exactly like today.

## Files to edit

- `src/pages/student/DiagnosticQuiz.tsx`

## Out of scope

- No DB schema changes. No edge function changes. No new tables.
- No cross-device resume (localStorage is per-browser by design — acceptable for a one-time diagnostic).
