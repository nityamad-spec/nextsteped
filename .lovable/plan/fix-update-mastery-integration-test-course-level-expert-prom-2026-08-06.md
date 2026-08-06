# Fix update-mastery integration test: course-level Expert promotion

## Diagnosis (confirmed)

The failing assertion at `supabase/functions/update-mastery/integration_test.ts:256` is the **course-level** check (`course!.learner_level === "expert"`), not the concept-level one. The concept assertions above it (sample_count 4, attempted 40, level `expert`, score >= 0.75) are all satisfiable and pass.

Why it can never pass as written:

- The fixture creates **two** concepts, each with weight `0.5`, but the test only answers questions on **concept A**.
- `index.ts:313-328` computes course mastery with the denominator = total weight of **every** concept in the course, so unexplored concepts count as 0.
- Concept A converges to `0.8968` after 4 perfect exams (shrinkage + EMA alpha 0.6, verified by replaying the math), so the course score is `0.8968 * 0.5 / 1.0 = 0.4484` → band `developing`. This exactly matches the observed failure.
- The ceiling for a single-concept-only run in this fixture is `0.5`, i.e. `proficient` is also unreachable; `expert` (>= 0.75) is impossible by construction.

This denominator behaviour is intentional and asserted elsewhere: the weekly-quiz test at line 229 expects `0.3462`, which only holds with the all-concepts denominator. So production code is behaving as designed — the test's expectation is the defect.

## Smallest change

Make the test exercise **both** concepts so the course score can actually reach the Expert band, leaving `index.ts` and `mastery.ts` untouched.

In the "e2e exam: enough evidence promotes concept to Expert and course follows" test, change the per-exam payload from 10 questions on concept A to 10 on A **plus** 10 on B (same difficulty 0.7, bloom 3, all correct). Then:

- Concept A: unchanged — 40 attempted, 4 samples, score `0.8968`, level `expert` (existing asserts still hold).
- Course: `(0.8968*0.5 + 0.8968*0.5) / 1.0 = 0.8968` → `expert`, and the source is `exam` so the practice-only gate does not apply.

That is a one-line payload edit; no other assertions need to move.

## Scope

- `supabase/functions/update-mastery/integration_test.ts` — one test's payload (recommended path).
- No production code, no schema, no redeploy needed.