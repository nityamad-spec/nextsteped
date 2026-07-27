## Plan: Clean up Exam Prep action bar

### Current state

`src/components/ExamPrepPanel.tsx` currently shows:

- A global summary row with two badge "buttons": `{timeLimit} min` and `{questionCount} questions`.
- On the same row, `Edit Settings` and `Performance` buttons.
- Below that, a list of exam cards; each card shows its own `{lengthMin} min` / `{questionCount} questions` info and a `Start Exam` button.

### Goal

1. Remove the global `{timeLimit} min` and `{questionCount} questions` badges from the header row.
2. Keep the per-exam time and question count inside each exam card (already present).
3. Visually align/style each exam card's `Start Exam` button so it sits at the same level as the `Edit Settings` / `Performance` actions (consistent height/variant/spacing).

### Changes

- `src/components/ExamPrepPanel.tsx`
  - Delete the two `Badge` elements that render the global time and question count (lines ~85-90).
  - Keep the `Customized` badge logic if still relevant, or remove it if it only made sense next to the removed badges (decision point below).
  - Ensure the right-side action group (`Edit Settings`, `Performance`) remains unchanged.
  - For each exam card, keep the existing `Button` but adjust its size/variant/classes so it matches the header action-button height/prominence (e.g., same `h-8` / `size="sm"` treatment, consistent gap).

### Decision needed

Should the `Customized` badge also be removed? It currently appears only when the user has deviated from the professor's recommended time/question count. Since the global summary badges are going away, the `Customized` badge may look odd alone. Options:

- Remove it entirely (settings are professor-fixed and disabled anyway).

### Risks / constraints

- Very low risk; this is a presentational change only.
- No data model or API changes.
- Need to verify the exam list still looks balanced after the header row loses its left-side content (the row may become right-aligned actions only).

### Verification

- Typecheck and build.
- Playwright screenshot of `/student/chat?mode=exam` with at least one published exam to confirm the header is clean and per-exam Start buttons align with the top action bar.