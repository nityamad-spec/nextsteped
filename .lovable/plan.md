## Fix inflated "Avg score" in Course Profile dialog

### Root cause
`assessment_results.score` is already stored as a percentage (0–100), not a raw correct-answer count. The dialog in `src/components/admin/CourseProfileDialog.tsx` treats it as a count and divides by `total_questions`, then `fmtPct` multiplies by 100 again. With score=90 and total_questions=10 the result is (90/10)*100 = 900% (~784% observed across attempts).

### Fix
In `CourseProfileDialog.tsx`:
1. For both `daily_quiz` and `exam` accumulators, use `score / 100` instead of `score / total_questions` for the per-attempt percentage that feeds `quizPctSum` / `examPctSum`. Keep the `total_questions > 0` guard to skip malformed rows.
2. Leave `fmtPct` unchanged (`Math.floor(v * 100)%`) — input is now a true 0–1 fraction.
3. Apply the same correction to the diagnostic-average calculation only if its score field is also a percentage; `diagnostic_results.score` should be verified the same way before changing it. (Quick check: if diagnostic rows show score≈total they're counts; if score>total they're percentages.)

### Risk
- Diagnostic results may use a different convention than assessment results. The plan keeps the diagnostic logic as-is unless a quick check shows the same percentage convention; if so, apply the identical fix there.
- No schema/RLS changes; UI-only.
