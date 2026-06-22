## Problem

In the post-submit weekly quiz review (`src/components/AssessmentView.tsx`, lines 464–494), each review card uses a single flex row: `[status icon] [question + answers (flex-1 min-w-0)] [topic Badge + chevron (shrink-0)]`. The topic `Badge` has no max-width or truncation, so a long topic string (screenshot: "Grounding and Retrieval Augmented Generation (RAG) with NotebookLM and Gemini for Google Cloud") consumes nearly the entire row width, squeezing the question column to ~1 word wide and producing the vertical word-per-line wrap shown in the screenshot.

## Fix

Edit only the review-card header in `src/components/AssessmentView.tsx`:

- Restructure the card into two rows instead of one:
  1. **Meta row:** status icon + topic `Badge` + chevron (right-aligned).
  2. **Body row:** `Q{i+1}: {question_text}` and the "Your answer / Correct answer" lines, using full card width.
- Add `max-w-[70%] truncate` (with `title={a.topic}` for hover tooltip) to the topic `Badge` as a secondary safeguard so even an extreme topic string can't push the chevron off-screen.
- Keep all existing classes (`whitespace-pre-wrap`, color states, expand/collapse behavior, explanation block) unchanged.

## Out of scope

- Explanation ↔ question mismatch (separate follow-up).
- Any change to `WeeklyQuizReviewDialog.tsx`, the active-quiz card, or backend functions.

## Verification

Reload a submitted weekly quiz with a long topic name; confirm the question text spans the full card width and wraps normally, and the topic badge truncates with an ellipsis.
