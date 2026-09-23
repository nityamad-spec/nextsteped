# Guardrails for "What's new"

Make the generated news reliably relevant: tied to the course's role and topics, weighted toward India, with genuinely important global stories included.

## What changes for the student

- Stories are about the student's target role, industry and course topics — not generic "training" or unrelated news.
- Roughly two thirds India-focused (Indian companies, hiring, policy, product launches, funding, research), the rest major global developments that matter for that role.
- Each card keeps its topic badge, and India-focused items are visibly marked so the mix is obvious.
- If nothing relevant and recent is found, the card says so instead of showing filler.

## Why today's results are weak

For the current course, no concepts are saved, so the searches fall back to the course name alone ("Skill Training Test"), which is why unrelated casualty-care and food-service training stories appeared.

## How the guardrails work

1. **Better context.** Alongside the course name and concepts, the function also reads the course's target role, course type, and the week names plus per-week concept lists from the lesson plan. When the concepts table is empty, the lesson-plan topics are used instead, so searches always have real subject matter.
2. **Better searches.** Queries are built from role + topic pairs, split into an India set (India-scoped phrasing) and a global set, roughly 2:1, restricted to the past week.
3. **Relevance filter before ranking.** Results whose title and snippet match none of the role/topic keywords are dropped before the model sees them.
4. **Stricter selection rules.** The model is told the target role and industry, must reject anything unrelated to that role or those topics even if recent, must aim for about two thirds India-relevant items, and must tag each item with `region` of `india` or `global`.
5. **Honest empty state.** If fewer than three items survive filtering, the card returns the "no relevant news today" message rather than padding it out.

## Technical notes

- Edits are confined to `supabase/functions/course-news/index.ts` and `src/components/student/WhatsNewCard.tsx`.
- Server reads add `courses.target_role`, `courses.course_type` and `lesson_plan_weeks.week_name, concepts`; concept source falls back from `concepts` to lesson-plan concepts.
- Firecrawl search keeps `tbs: "qdr:w"`; query count stays small (about 5) to control cost. India queries pass an India-scoped query string.
- Response items gain `region: "india" | "global"`; the client renders a small "India" badge for those, and the URL allow-list check stays as is.
- No database or schema changes.

## Verification

- Typecheck.
- Call the function for the AI Engineer course and confirm returned items are role-relevant, mostly India-focused, and correctly tagged.
- Browser check on `/student/home` that badges render and the empty state still works.
