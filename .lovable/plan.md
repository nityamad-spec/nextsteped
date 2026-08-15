# Scoring & Mastery Review (no code changes)

Two different numbers exist and are often confused:

1. **Attempt score** — the % a student sees right after a quiz/exam/practice set.
2. **Mastery** — the slow-moving per-concept and course-level estimate written by the `update-mastery` backend function.

---

## Part 1 — Attempt score

Common building blocks (`src/lib/masteryScoring.ts`):

- `bloomWeight`: L1 1.0, L2 1.2, L3 1.5, L4 1.8, L5 2.1, L6 2.5
- `maxPoints(q) = difficulty (0..1) × bloomWeight`
- Reasoning factor (Bloom 3+ only, `reasoningEarnedFactor`):
  - correct + accepted/no verdict → 1
  - correct + rejected → min(1, 1.2 / bloomWeight)
  - incorrect + accepted → min(1, 1.2 / bloomWeight)
  - incorrect + rejected/none → 0
  - Bloom 1-2: simply 1 if correct, else 0
- `earned(q) = maxPoints(q) × factor(q)`
- `accuracy = Σ earned / Σ maxPoints`
- Pace: `expectedMs = EXPECTED_TIME_BASE[bloom] × (0.6 + 1.0 × difficulty)`, base ms = 20k/30k/45k/60k/80k/110k by Bloom.
  `r = actualMs / expectedMs`, then
  - r < 0.25 → 0.2 (guess floor)
  - 0.25 ≤ r ≤ 1 → linear 0.2 → 1.0
  - r > 1 → exp(-(r-1)/2)
  Pace score = mean over questions.
- **Final = round(100 × (0.80 × accuracy + 0.20 × meanPace))**

Where each format lands today:

| Format | Formula actually used |
|---|---|
| Weekly quiz (`type === "quiz"` in AssessmentView) | 80/20 accuracy + pace, as above |
| Exam | weighted accuracy only (`Σearned / Σmax × 100`) — **no pace term** |
| Practice (chat widget) | flat correct/total; feeds mastery, not the 80/20 blend |
| Diagnostic | own edge function `score-diagnostic`, same 80/20 constants |

So quiz and diagnostic are comparable; exam and practice are not yet on the same scale.

### Worked example — 4-question weekly quiz

| Q | Bloom | Diff | Correct | Verdict | Time | maxPts | earned |
|---|---|---|---|---|---|---|---|
| 1 | 1 | 0.4 | yes | – | 15s | 0.4×1.0 = 0.40 | 0.40 |
| 2 | 3 | 0.6 | yes | rejected | 50s | 0.6×1.5 = 0.90 | 0.90 × (1.2/1.5=0.8) = 0.72 |
| 3 | 4 | 0.8 | no | accepted | 70s | 0.8×1.8 = 1.44 | 1.44 × (1.2/1.8=0.667) = 0.96 |
| 4 | 2 | 0.5 | no | – | 8s | 0.5×1.2 = 0.60 | 0 |

- Σmax = 3.34, Σearned = 2.08 → **accuracy = 0.623**
- Pace: Q1 expected 20k×(0.6+0.4)=20.0s, r=0.75 → 0.2+0.667×0.8 = 0.733
  Q2 expected 45k×1.2=54s, r=0.926 → 0.2+0.9×0.8 = 0.921
  Q3 expected 60k×1.4=84s, r=0.833 → 0.2+0.778×0.8 = 0.822
  Q4 expected 30k×1.1=33s, r=0.242 (<0.25) → 0.20
  mean pace = **0.669**
- Final = 100 × (0.8×0.623 + 0.2×0.669) = **63**
- Without verdict adjustments accuracy would be 0.40/3.34 = 0.12 → score ~23, so the reasoning credit is doing heavy lifting here.

---

## Part 2 — Concept mastery (`update-mastery` + `mastery.ts`)

Per submission, per concept, four layers:

1. **Raw signal** — same weighted math: `raw = Σearned / Σmax` for that concept's questions in this attempt (falls back to `correct/attempted` when only aggregate data is sent). Pace never enters mastery.
2. **Beta shrinkage toward 0.5** — with `n` = total questions ever attempted on this concept after the attempt:
   `w = n / (n + 8)`; `shrunk = w × raw + (1 − w) × 0.5`
3. **EMA blend with previous score** — α by source: weekly_quiz 0.4, exam 0.6, practice 0.15, diagnostic 0.4.
   `new = α × shrunk + (1 − α) × prior` (first ever sample → `new = shrunk`)
4. **Band + evidence cap** — bands: <0.25 beginner, <0.50 developing, <0.75 proficient, else expert.
   Cap: attempted < 8 → max "developing"; attempted < 15 or samples < 2 → max "proficient".
   The numeric score is never capped — only the displayed level.

### Worked example — concept "Loops"

Prior row: score 0.62, samples 3, attempted 12. New weekly quiz: 4 questions on Loops, Σearned 2.4 / Σmax 3.0 → raw = 0.80.

- attemptedAfter = 16, samplesAfter = 4
- w = 16/24 = 0.667 → shrunk = 0.667×0.80 + 0.333×0.5 = **0.700**
- EMA (α = 0.4) → 0.4×0.700 + 0.6×0.62 = **0.652**
- Band(0.652) = proficient; caps don't bite (16 ≥ 15, 4 ≥ 2) → displayed **Proficient**

Same attempt via **practice** instead (α = 0.15): 0.15×0.700 + 0.85×0.62 = **0.632** — practice moves the needle ~4x less.

---

## Part 3 — Course mastery

Recomputed from scratch after every submission:

```text
courseMastery = Σ (conceptScore_i × conceptWeight_i)  /  Σ (weight of EVERY concept in the course)
```

Key point: the denominator is all course concepts, so concepts never assessed count as **0** — course mastery is deliberately depressed early in the term.

Level = same bands, plus a **practice-only gate**: if every contributing concept's most recent source was `practice`, the level is capped at "proficient" (score untouched).

### Worked example

Course has 4 concepts, weights 30 / 30 / 20 / 20 (total 100).

| Concept | Weight | Score |
|---|---|---|
| Loops | 30 | 0.652 |
| Functions | 30 | 0.71 |
| OOP | 20 | 0.40 |
| Recursion | 20 | no row → 0 |

`(30×0.652 + 30×0.71 + 20×0.40 + 20×0) / 100 = (19.56 + 21.3 + 8.0 + 0)/100 = 0.489` → **49%, "developing"**.

Once Recursion is assessed at 0.60, course mastery jumps to 0.609 → proficient. A single untouched heavy concept can hold a strong student a whole band down.

---

## Observations worth deciding on later

- **Exam has no pace component** and practice uses flat accuracy, so the three attempt scores aren't comparable even though they feed the same mastery store.
- **Practice attempt scores are flat correct/total**, while their mastery contribution is weighted — the student sees one number, the system stores another.
- The header comment in `update-mastery/index.ts` says practice α = 0.1 but the code uses **0.15** — doc drift, not a bug.
- Reasoning credit can lift a mostly-wrong attempt substantially (23 → 63 in the example above); worth confirming that's the intended generosity.
- Unassessed concepts scoring 0 in course mastery is correct for "course-wide progress" but reads as punitive to students mid-semester.

No code changes made — review only.
