# Teaching Insights edge function

Replace the hardcoded `insightsMock` on `/teacher/courses/dashboard` with AI-generated, course-specific insights grounded in the real mastery distribution and recent assessment activity. Cache aggressively, refresh on demand.

## New edge function: `generate-teaching-insights`

`supabase/functions/generate-teaching-insights/index.ts`

**Auth**: validate caller's JWT in code (Lovable default `verify_jwt = false`). Reject if not authenticated. Then verify the caller is a course member via `is_course_member(course_id, auth.uid())` using a service-role client — same pattern as other teacher-facing functions. No anonymous access.

**Input** (Zod-validated):
```ts
{ course_id: uuid, force_refresh?: boolean }
```

**Server-side data assembly** (no PII leaves the DB layer):
1. `courses` → name, current week computed from `start_date` + `total_weeks`.
2. `concepts` → `id, concept_code, weight` (course scope).
3. `lesson_plan_weeks` → reveal which concepts are in-scope this week (mirror the dashboard's "visible by date" rule).
4. `student_concept_mastery` aggregated server-side per concept:
   - `n_students`, `avg_score`, band counts (beginner/developing/proficient/expert) using the same `< .25 / < .50 / < .75 / ≤ 1.0` thresholds.
   - Engagement: `COUNT(DISTINCT student_id)` overall vs `n_students` per concept → "untouched" concepts.
5. `assessment_results` last 14 days, grouped per concept via `assessment_questions.concept_id` → recent accuracy trend.
6. Enrollment count from `enrollments` for context ("X of Y students have engaged").

All aggregation done in SQL (one round-trip per group), only numeric summaries + concept_codes shipped to the model. No student ids, no emails, no roll numbers.

**Prompt** (system + structured output via AI SDK `Output.object`):
- System: "You are a pedagogy coach for a 16-week Intro to Python course. Produce 3–5 short, actionable teaching insights grounded ONLY in the supplied stats. Reference concepts by their concept_code. Never invent numbers."
- User: compact JSON payload with the aggregates above + current week.
- Output schema (kept small to avoid Gemini state-limit issues): `{ insights: Array<{ concept_code: string | null, severity: "info"|"warn"|"action", text: string }>` length 3–5.

**Model**: `google/gemini-3-flash-preview` via Lovable AI Gateway (`ai-sdk-lovable-gateway` helper). Default chat model; cheap, fast, multimodal not needed.

**Errors**: 401/403 for auth/membership, 429 (rate limit) and 402 (credits) surfaced verbatim to client with a friendly toast.

## Caching layer

New table `course_teaching_insights` (one row per course):
```sql
CREATE TABLE public.course_teaching_insights (
  course_id uuid PRIMARY KEY REFERENCES courses(id) ON DELETE CASCADE,
  insights jsonb NOT NULL,        -- array shaped like the model output
  inputs_hash text NOT NULL,      -- sha256 of the aggregated stats payload
  model text NOT NULL,
  generated_at timestamptz NOT NULL DEFAULT now(),
  generated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);
GRANT SELECT ON public.course_teaching_insights TO authenticated;
GRANT ALL   ON public.course_teaching_insights TO service_role;
ALTER TABLE public.course_teaching_insights ENABLE ROW LEVEL SECURITY;
CREATE POLICY "course members read insights"
  ON public.course_teaching_insights FOR SELECT TO authenticated
  USING (is_course_member(course_id, auth.uid()));
-- Writes only via the edge function (service_role).
```

Function behavior:
- Compute `inputs_hash` from the aggregated stats payload.
- If a cached row exists with the same `inputs_hash` AND `force_refresh !== true` AND age < 6 h → return cached, do not call the model.
- Else call the model, upsert the row, return fresh insights with a `cached: false` flag.

## Frontend changes

`src/pages/teacher/CourseDashboard.tsx`:
- Remove `insightsMock`.
- New `useEffect` fetches `course_teaching_insights` directly first (RLS-protected SELECT). If absent OR `generated_at` older than 6h, call `supabase.functions.invoke("generate-teaching-insights", { body: { course_id } })`.
- Render insights with the existing card layout. Show a small "Updated Xh ago" timestamp and a "Refresh" button (calls function with `force_refresh: true`, disabled while pending).
- Loading skeleton mirrors the existing concept-row skeleton style.
- Empty state ("Insights will appear after students start using the course") when no `student_concept_mastery` rows exist — skip the model call entirely client-side.

## Risks and mitigations

| Risk | Mitigation |
| --- | --- |
| **Cost blowup** — every dashboard load triggers a model call | 6-hour TTL + `inputs_hash` dedup + explicit Refresh button + client short-circuits when there are no mastery rows. Expected: ~1 call per course per teaching day. |
| **AI hallucinated numbers** ("80% of students struggled with loops") | Aggregate server-side, pass only real counts, system prompt forbids inventing numbers, structured output forces `concept_code` selection from a real list. Insights are advisory, not surfaced to students. |
| **PII leakage to the model** | Only aggregated counts + concept codes are sent. No `student_id`, name, email, or roll number ever reaches the prompt. Matches existing student-anonymity rule. |
| **Stale insights after teacher edits concepts/lesson plan** | `inputs_hash` includes concept list and visible-week set, so structural edits bust the cache automatically on the next fetch. |
| **Gemini "too many states" on structured output** | Keep schema flat: 3–5 items, three fixed enum severities, `concept_code` as plain string validated server-side against the real list before persisting. |
| **Rate limit / credit exhaustion (429 / 402)** | Surface as toast with the standard "add credits in Workspace → Usage" copy; fall back to last cached row if present so the card never goes blank. |
| **Race when multiple teachers click Refresh** | Upsert on PK `course_id`; last write wins. Function is idempotent for the same `inputs_hash`. |
| **Course with zero students or zero mastery rows** | Short-circuit client-side and render empty state. Function also guards and returns `{ insights: [] }` without calling the model. |
| **Schema drift in `assessment_questions.concept_id`** | Use the existing FK + concept_code validation trigger already in DB; aggregator falls back to skipping rows it can't map. |
| **RLS misconfiguration exposing other courses' insights** | Single membership-scoped SELECT policy + table only writable by service role; covered by the same `is_course_member` helper used elsewhere. |

## Out of scope

- "45 Active Students" / "312 Total Sessions" stat cards (still mocked — separate ask).
- Streaming the insights (not needed; small payload, one-shot generate is simpler).
- Per-section insights (no section column on `student_concept_mastery` today).

## Verification

1. Empty course → empty state, no function call (check Network tab).
2. Seed a few `student_concept_mastery` rows → click dashboard, function runs, row appears in `course_teaching_insights`, UI shows 3–5 insights referencing real `concept_code`s.
3. Reload within 6h → no second model call (edge logs), same insights served from cache.
4. Click Refresh → new call, `generated_at` advances, `inputs_hash` may or may not change.
5. Non-member teacher hitting the function directly → 403.
6. Force 402/429 via temporary model swap to a paid tier → toast appears, last cached insights remain visible.
