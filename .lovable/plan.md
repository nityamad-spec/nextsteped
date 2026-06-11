# Restrict Weekly Quiz Bloom Levels to 1–4

## Problem

The weekly-quiz generator (`supabase/functions/generate-weekly-quiz/index.ts`) is producing questions tagged with Bloom's level 5 (Evaluate) and 6 (Create). These cognitive levels cannot be fairly assessed via MCQ or True/False — they require open-ended evaluation or creation. The generator currently allows 1–6 in every layer.

## Fix

Lock Bloom's level to the range **1–4** (Remember, Understand, Apply, Analyze) in all three places it appears in `supabase/functions/generate-weekly-quiz/index.ts`:

1. **System prompt (line 133)** — change the rule from `"bloom_level: integer 1-6."` to something explicit:
   > `bloom_level: integer 1-4 ONLY (1=Remember, 2=Understand, 3=Apply, 4=Analyze). Do NOT use 5 (Evaluate) or 6 (Create) — these cannot be fairly assessed with MCQ or True/False.`

2. **Tool-call JSON schema (line 168)** — tighten `bloom_level` to `{ type: "integer", minimum: 1, maximum: 4 }` so the AI gateway's structured-output enforcement rejects 5/6 at the source.

3. **Validator (lines 84–85)** — change the accepted band to `1..4`. When the model still returns 5 or 6, reject the question (push a reason into `rejects` so the retry hint tells the model why) rather than silently clamping. This way the retry loop genuinely re-generates instead of mislabeling.

## Out of scope

- No DB/schema changes — `bloom_level` column stays an integer.
- No changes to other generators (diagnostic, exam) unless the user asks; this fix is scoped to weekly quizzes per the request.
- No backfill of already-stored level-5/6 questions; next regeneration replaces the week's rows (existing delete-by-week logic at lines 327–332 handles this).

## Technical details

- File touched: `supabase/functions/generate-weekly-quiz/index.ts` only.
- `MAX_ATTEMPTS = 3` retry loop already handles rejected questions, so the stricter validator will trigger regeneration when needed.
- The validator change should return `{ ok: false, reason: 'bloom_level X not allowed for MCQ/TF (must be 1-4)' }` for out-of-range values.
