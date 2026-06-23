In `src/pages/student/StudentHome.tsx`, in the Concept Exploration & Mastery Map tile rendering, change the percentage calculation from `Math.round(score * 100)` to `Math.floor(score * 100)`.

Scope:
- Only the concept mastery score display (tile main/secondary text and tooltip text).
- No change to mastery level thresholds (`getMasteryLevel` still uses raw score).
- No backend changes.