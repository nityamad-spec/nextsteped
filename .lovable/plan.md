

## Plan: Mandate Confidence Level Selection

### Problem
Currently, the confidence slider defaults to 50 ("Somewhat Confident") and students can skip past it without actively choosing. This means the confidence data may not reflect genuine self-assessment.

### Approach
Make the confidence slider **disabled and unset** when each question loads. The "Next Question" / "Finish Quiz" button stays disabled until the student both answers the question **and** explicitly sets a confidence level.

### Changes

**`src/pages/student/DiagnosticQuiz.tsx`**

1. **Change confidence state to `null` initially** — `useState<number | null>(null)` instead of `useState<number>(50)`
2. **Reset confidence to `null`** on each new question (in `handleAnswer` and back-navigation)
3. **Update `hasAnswer` guard** — require `confidence !== null` in addition to having an answer selected
4. **Disable the slider visually** when no answer is selected (keep current behavior of showing it only after answering), but once visible, start it in an **unset state** with no thumb position highlighted
5. **Show a prompt** like "Please select your confidence level" when the slider is unset
6. **Back navigation** — restore the previously saved confidence value when going back (already stored in `confidences` array)

### UX Flow
```text
1. Student sees question → selects answer
2. Confidence slider appears (no value selected, thumb at center but grayed out)
3. Student taps/drags to set confidence → button enables
4. Student clicks Next → moves to next question with slider reset
```

### Files Modified
- `src/pages/student/DiagnosticQuiz.tsx`

### No database changes needed

