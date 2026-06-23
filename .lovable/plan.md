## Fix Question Review alignment in Practice Exam Performance Dashboard

**Where:** `src/components/ExamHistory.tsx` (Question Review list inside each expanded attempt, lines ~283–326). This is what renders on `/student/chat` → Exam Prep view → Performance Dashboard.

**Problem:** Some question rows appear left-aligned/indented differently from others. Cause: `question_text` is rendered with `whitespace-pre-wrap`, so any leading spaces, tabs, or newlines stored on the question (common for code-style or multi-line prompts) are preserved and visually shift the text away from the icon/Q-number baseline. Other questions without that whitespace render flush, producing the inconsistent alignment the user sees.

**Fix (presentation only):**
1. Normalize the displayed question text before render:
   - Trim leading/trailing whitespace.
   - Collapse runs of leading spaces on each line so the first character of every line aligns to the same left edge.
2. Replace `whitespace-pre-wrap` on the question `<p>` with `whitespace-pre-line` so intentional line breaks are kept but stray indentation no longer offsets the text.
3. Apply the same normalization to `a.selected` and `a.correct` lines for consistency (they can have the same issue when the question is code/short-answer).
4. Keep all existing layout, icons, badges, colors, and the Explanation block untouched.

**Out of scope:** No data changes, no logic changes, no changes to other Question Review surfaces (`AssessmentView.tsx`, `PracticeQuestionsWidget.tsx`) unless you want the same fix applied there — say the word and I'll include them.
