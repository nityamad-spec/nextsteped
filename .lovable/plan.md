## Plan

### 1) Move Course Progress bar from `/student/home` to top of `/student/learning-path`

**On `StudentLearningPath.tsx`:**

- Add the same data the Home page uses to compute progress. `takenQuizzes` and `availableQuizDays` are already loaded in this file, and `totalWeeks` is already returned by `useLearningPlan`. So we just replicate the derived values:
  - `passedQuizCount = quizzes with score > 50`
  - `publishedQuizCount = availableQuizDays.size`
  - `progressPct = round(passedQuizCount / publishedQuizCount * 100)`
  - `displayedUnit = clamp(lastPassedUnit + 1, 1, totalWeeks)`
- Insert a new Course Progress `Card` immediately after the page heading (before the "Your Learning Path" card), visually matching the existing Home version (BookOpen icon, "Unit X of Y" label, `Progress` bar, "X of Y weekly quizzes passed (>50%)" caption).

**On `StudentHome.tsx`:**

- Remove the Course Progress `motion.div` block (currently lines ~542–561).
- Keep the underlying `passedQuizCount` / `progressPct` / `displayedUnit` calculations only if still consumed elsewhere on Home; otherwise drop the now-unused derived vars and imports (`Progress`, `BookOpen`) if no other use remains. I'll verify before deleting.

### 2) `/student/feedback` — widen textbox, add "Report an issue" box

**On `Feedback.tsx`:**

- Change the two feedback cards from `max-w-2xl` to full page width (`max-w-full` or drop the constraint) so the textareas span the page width. Keep them inside the existing `p-6` page padding.
- Increase the existing "Share Feedback Anytime" `Textarea` `rows` from 3 to ~5 for a taller box.
- Add a **third card** below: **"Report an Issue"**
  - Icon: `AlertCircle` (lucide) in the same avatar treatment.
  - Description: "Found a bug or something not working? Send us the details."
  - Full-width `Textarea` (rows ~5), separate state (`issueReport`, `issueSubmitting`).
  - Submit button opens a prefilled `mailto:` link to `info@nextsteped.com`:
    - Subject: `NextStep issue report`
    - Body: the textarea content plus the signed-in user's email for context.
  - Use `window.location.href = mailto:...` on click; clear the textarea and toast "Opening your email app…" on success.
  - No DB insert (email is the delivery channel, per request). If you'd rather also log the issue to a table, tell me and I'll add it.

### Risks / notes

- The Course Progress metric on Home currently uses the *published quiz* count. That's identical to what's already fetched in Learning Path, so the number will match 1:1 after the move.
- `mailto:` depends on the user having a default mail client. If you want a more reliable path (edge function → email), say so and I'll wire it via the existing Lovable email infra instead.
- No backend / schema changes.

### Open question

- For "Report an issue": mailto-only. 