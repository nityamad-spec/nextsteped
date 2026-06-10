# Practice Questions: Add Difficulty + Bloom, Restrict to MCQ/TF

Scope: `/student/chat` → Study mode → Practice widget only. No DB schema changes. Weekly quiz, exam, diagnostic untouched. Persistence into `assessment_questions` is **out of scope** (deferred until Option A/B decision).

## Changes

### 1. `src/components/PracticeQuestionsWidget.tsx`
- **Restrict question types to MCQ + True/False.** Remove `short_answer` from generation, parsing, and rendering paths.
- **Extend `GeneratedQuestion` type** with:
  - `difficulty_estimate: number` (0–1; AI emits ~0.2 easy / 0.5 medium / 0.85 hard)
  - `bloom_level: number` (1–6; default to 3 "Apply" if missing)
- **Update system prompt** (lines 87–102) to:
  - Generate ONLY `mcq` and `true_false` (drop `short_answer`)
  - Require `difficulty_estimate` and `bloom_level` per question, mirroring `generate-weekly-quiz` instructions
  - Add 1–2 sentence guidance on Bloom taxonomy (1 Remember → 6 Create) and difficulty calibration
- **Sanitize on parse**: clamp `difficulty_estimate` to [0,1], clamp/round `bloom_level` to integer in [1,6], default to 0.5 / 3 if missing or invalid. Drop any returned `short_answer` items defensively.
- **Pass meta through to answer rows** so each answer carries `difficulty_estimate` + `bloom_level` + `topic` to the parent.

### 2. `src/pages/student/AIChat.tsx` — `handlePracticeResult`
- Build `questionMeta: Map<questionId, { difficulty, bloom }>` from the answer rows.
- Call `invokeUpdateMastery({ source: "practice", course_id, source_id, questionMeta, perQuestion: [...] })` so the existing weighted `per_question` path is used (Bloom-weighted EMA), instead of the flat `per_concept` fallback.
- Include `difficulty_estimate` and `bloom_level` inside each answer object stored in `assessment_results.answers` JSON (already `jsonb` — no migration).

## Out of Scope
- No teacher-visible surface for practice difficulty/bloom.
- No persistence of generated questions into `assessment_questions` or a new table (deferred).
- Weekly quiz, exam mode, diagnostic, professor chat: unchanged.

## Risks & Mitigations
- AI may emit out-of-range or missing meta → clamp + defaults on parse.
- AI may still return `short_answer` despite prompt → filtered out on parse; prompt explicitly forbids it.
- Self-reported difficulty is noisier than teacher-curated weekly quiz items → acceptable; practice is a lighter signal blended via EMA α=0.4.

## Files Touched
- `src/components/PracticeQuestionsWidget.tsx`
- `src/pages/student/AIChat.tsx`
