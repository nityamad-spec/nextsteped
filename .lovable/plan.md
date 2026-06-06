# View Quiz Questions — Review Dialog

Add a read-only review modal to `/teacher/setup/lesson-plan` so professors can inspect the generated weekly quiz questions before students take them.

## Scope

Frontend-only. No backend changes — questions are already persisted in `assessment_questions` by `generate-weekly-quiz` (mode=`daily_quiz`, `quiz_day=<week>`). "Publishing to students" is already governed by the existing quiz enable/visibility settings; this change only surfaces the questions for teacher review.

## Note on the "10 questions" wording

The generator produces **20** questions per week across 4 tiers: 5 standard + 5 easy + 5 medium + 5 hard. At runtime each student sees 10 (5 standard for everyone, then 5 adaptive routed by tier). The dialog will reflect this clearly — show all 20 grouped by tier with a label explaining that students see 5 standard + 5 adaptive.

## Changes

### 1. New component `src/components/WeeklyQuizReviewDialog.tsx`
- Props: `open`, `onOpenChange`, `courseId`, `weekNumber`, `weekName`
- On open, fetches `assessment_questions` where `course_id=courseId`, `mode='daily_quiz'`, `quiz_day=weekNumber`, ordered by `tier` then `item_code`
- Renders questions grouped into 4 sections: **Standard (shown to all)**, **Easy adaptive**, **Medium adaptive**, **Hard adaptive**
- Per question card: stem (`question_text`), format badge (MCQ / True-False), topic (concept code), difficulty + Bloom level, options list with the correct option visibly marked (check icon + accent), and the explanation in a muted block
- Empty state: "No questions generated yet. Click Generate Weekly Quiz first."
- Loading state with spinner; error state with retry
- Uses `Dialog` + `ScrollArea`; max height ~80vh, single column

### 2. `src/pages/teacher/CourseCreation.tsx`
- Add state: `reviewQuizWeek: WeekPlan | null`
- Replace the disabled "View Quiz Questions" button (line 1701-1703) with an active button that sets `reviewQuizWeek = w`. Disable only when `quizGenerated[w.week]` is 0 or undefined (so professors must generate first), with tooltip text "Generate the quiz first"
- Mount `<WeeklyQuizReviewDialog>` once outside the week loop, controlled by `reviewQuizWeek`

## Out of scope

- Editing/regenerating individual questions (regenerate-all already exists via the Generate button)
- Manual approve/publish flag — quiz availability stays under TA settings
- Shuffling preview / per-student adaptive simulation
