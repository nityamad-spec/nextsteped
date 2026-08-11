# Learning Path: three-step unit flow with readiness

## Goal
Turn `/student/learning-path` into a focused, single-next-action page for the current unit:

- **Before the quiz:** Study → Practice → Weekly Quiz, shown as three numbered cards with a "Your next move" banner.
- **After the quiz, when readiness is below 70%:** only two cards — "Study weak concepts" and "Complete scored practice" — with a "Weekly Quiz completed · one attempt only" footer.
- **At or above 70% readiness:** the unit is marked ready and the page points the student at the next unit.

The existing expandable list of all units stays below the new focused card.

## Readiness

Readiness for a unit is the **weighted average of the student's concept mastery scores for that unit's concepts**, using the existing mastery system (80% accuracy / 20% pace) already written by weekly quizzes, exams, and practice.

- Unit concepts come from `lesson_plan_weeks.concepts[].name`, which matches `concepts.concept_code`.
- Mastery per concept comes from `student_concept_mastery` (already updated by `update-mastery` after quizzes and practice, with practice weighted lower via its EMA alpha).
- Weighting uses `concepts.weight`; concepts with no mastery row are treated as 0 and still counted, so readiness rises as coverage grows.
- Displayed as a rounded percentage, e.g. "48% readiness".
- Threshold: **70%**. No hard lock — later units remain openable exactly as today; the threshold only drives status, copy, and the "ready to proceed" message.

## Page states (current unit card)

```text
State A — quiz not taken
  Header: UNIT n · <topic> · badge "Quiz due"
  Next move: Start studying  [Start studying] [Take quiz now]
  This week's path:  1 Study → 2 Practice → 3 Weekly Quiz
  Footer: "After the quiz, Study and Practice stay available." / "Quiz can only be taken once"

State B — quiz taken, readiness < 70%
  Header: badge "<x>% readiness" · "Weekly quiz completed · readiness below recommendation"
  Next move: Study and practice  [Start studying] [Start practice]
  Improve your readiness: 1 Study weak concepts → 2 Complete scored practice
  Footer: "Weekly Quiz completed · one attempt only"

State C — quiz taken, readiness >= 70%
  Header: badge "<x>% readiness · Ready"
  Next move: Move on to Unit n+1 (or "Course complete" on the last unit)
  Study and Practice cards remain available for continued improvement.
```

Which unit is "current": the first unit whose quiz has not been taken, falling back to the date-derived `currentWeek`.

## Actions

- **Study** → navigates to `/student/chat` in study mode, pre-seeded with the unit topic (and in state B, the student's weakest concepts for that unit).
- **Practice** → navigates to `/student/chat` and opens the Practice Questions widget, pre-filled with the unit topic / weak concepts.
- **Take quiz** → opens the existing `WeeklyQuizDialog`, keeping the current diagnostic gate and browser-lock/void rules unchanged.

## Technical notes

- New hook `src/hooks/useUnitReadiness.ts`: given the course id and lesson plan, loads `concepts` (code → id, weight) and `student_concept_mastery` once, and returns `{ readinessByUnit, weakConceptsByUnit, loading }`. Weak concepts = that unit's concepts sorted ascending by mastery, top 3.
- New component `src/components/student/UnitFocusCard.tsx` renders the three states from props (unit, quiz result, readiness, weak concepts, handlers). No data fetching inside.
- `src/pages/student/StudentLearningPath.tsx` renders the focus card above the existing Course Progress bar and unit accordion; existing quiz/void/diagnostic logic is reused as-is.
- Course Progress bar switches from "quizzes passed >50%" to "units at or above 70% readiness"; the per-unit accordion badge shows "COMPLETE" once readiness ≥ 70% (currently keyed to quiz > 50%).
- Study/Practice deep links use query params on `/student/chat` (e.g. `?mode=learning&topic=...&practice=1`); `AIChat.tsx` reads them on mount to seed the composer or open the practice widget.
- Styling uses existing semantic tokens (primary/muted/card) — no new colors. No database or edge-function changes.

## Risks

- Readiness depends on `student_concept_mastery` rows existing; a student who has taken a quiz but whose concepts were never resolved will show 0% until practice or a re-score fills them in. The copy is written so 0% reads as "keep practicing" rather than an error.
- Concept-name matching between the lesson plan and `concepts.concept_code` is by exact string; unmatched names are ignored in the weighted average (logged to console for debugging).
