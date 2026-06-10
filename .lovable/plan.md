# Two-Stage System Prompt for `generate-practice-questions`

Replace the single `SYSTEM_PROMPT` in `supabase/functions/generate-practice-questions/index.ts` with a two-pass LLM pipeline: **(1) Intent Extraction**, then **(2) Question Generation** grounded in extracted intent + the student's mastery profile.

## Pipeline

```text
user prompt ──► [Stage 1: Intent Extractor LLM]
                     │ JSON intent {count, types, difficulty,
                     │              concepts, bloom_focus, goal}
                     ▼
   concepts + mastery + course mastery ──► [Stage 2: Question Generator LLM]
                                                  │
                                                  ▼
                                       {questions: [...]} (sanitized)
```

Both stages call `google/gemini-2.5-flash-lite` with `response_format: json_object`. Stage 1 is cheap (small output); Stage 2 is the existing generation call, now fed a structured intent + per-concept mastery snapshot.

## Stage 1 — Intent Extraction

**Inputs to the model:**
- Raw `prompt` (user request, ≤1000 chars, treated as untrusted)
- A short list of available course concept codes (so the model can map informal mentions like "loops" to `CONCEPT_LOOPS`)

**System prompt (Stage 1):**
```
You are an intent parser for a student practice-question request. Read the
student's message and return a JSON object describing what they want.

Output JSON schema (no prose, no markdown):
{
  "count": integer 1..10,
  "types": array, subset of ["mcq","true_false"], non-empty,
  "difficulty": "easy" | "medium" | "hard" | "mixed",
  "bloom_focus": array of integers in 1..6 (Bloom levels to emphasize),
  "concepts": array of concept codes from the provided list (may be empty),
  "weak_areas_requested": boolean (true if student asks to focus on weak/
                                   struggling/unclear topics),
  "goal": "review" | "challenge" | "exam_prep" | "general_practice",
  "notes": short free-text restating the request in <=140 chars
}

Fallback rules when the student is silent or vague:
- count: default 5
- types: default ["mcq","true_false"]
- difficulty: default "mixed"
- bloom_focus: default [2,3,4]
- concepts: []  (Stage 2 will pick from mastery)
- weak_areas_requested: false unless clearly implied
- goal: "general_practice"

Never invent concept codes that are not in the provided list. Never include
"short_answer" or any other question type. Clamp count to 1..10.
```

**User message (Stage 1):** the raw `prompt` plus a single line `AVAILABLE_CONCEPTS: <comma-separated codes>`.

**Server-side validation after Stage 1:** Zod-parse the JSON; if parsing fails, fall back to a deterministic default intent (`count=5, types=["mcq","true_false"], difficulty="mixed", concepts=[], weak_areas_requested=false, goal="general_practice"`) so the request still proceeds. Clamp `count` to 1..10, filter `types`/`bloom_focus`/`concepts` to known values.

## Stage 2 — Question Generation

**New server-side context the function assembles before calling Stage 2:**
1. `intent` JSON from Stage 1.
2. `concepts` for the course (already fetched).
3. **Per-concept mastery** from `student_concept_mastery` for `(student_id, course_id)` — pull `concept_code, mastery_score, mastery_level, sample_count`. Use this to identify weak concepts (lowest scores, prefer ones with `sample_count >= 1`).
4. **Course mastery** from `student_course_mastery` for `(student_id, course_id)` — `mastery_score, learner_level`. Used to calibrate baseline difficulty when `intent.difficulty == "mixed"`.
5. Recent assessment results (already fetched) kept as a brief signal.

**Concept selection logic (server-side, before Stage 2):**
- If `intent.concepts` non-empty → use them.
- Else if `intent.weak_areas_requested` or `goal == "exam_prep"` → pick the bottom N concepts by `mastery_score` (N = max(3, intent.count)).
- Else → weighted sample from the course concept list, biased toward lower mastery.
- Pass the chosen concept set with `{code, weight, mastery_score, mastery_level, sample_count}` into Stage 2.

**System prompt (Stage 2):**
```
You are a practice-question generator for a university course. You will be
given (a) a parsed INTENT describing what the student asked for and
(b) a MASTERY SNAPSHOT for the student across course concepts. Generate
practice questions that match the intent and target the student's current
level.

Rules:
- Generate exactly INTENT.count questions.
- Only use question types in INTENT.types (subset of {"mcq","true_false"}).
  Never produce short_answer, fill-in-the-blank, or code questions.
- Distribute questions across INTENT.concepts (or the provided MASTERY
  SNAPSHOT concepts if INTENT.concepts is empty), favoring concepts with
  lower mastery_score when INTENT.weak_areas_requested or
  INTENT.goal == "exam_prep".
- Calibrate difficulty_estimate (0..1):
  * INTENT.difficulty == "easy"   → target 0.15..0.35
  * INTENT.difficulty == "medium" → target 0.40..0.60
  * INTENT.difficulty == "hard"   → target 0.65..0.90
  * INTENT.difficulty == "mixed"  → spread across the range, anchored to
    the student's course mastery_score (lower mastery → easier center).
- bloom_level (1..6) should bias toward INTENT.bloom_focus, with most items
  at 2..4 unless INTENT.goal == "challenge".
- For each MCQ: 4 plausible options, exactly one correct, answer must match
  one option string exactly.
- For each True/False: answer must be "True" or "False".
- Explanations must be 1–3 sentences and reference the concept.
- Set "topic" to the matching concept code from the snapshot.

Return ONLY JSON of the form {"questions":[...]} where each item has:
question, type, options?, answer, explanation, topic,
difficulty_estimate, bloom_level.
```

**User message (Stage 2):** a structured block:
```
INTENT: <intent JSON>
MASTERY SNAPSHOT:
  course: {mastery_score, learner_level}
  concepts: [{code, weight, mastery_score, mastery_level, sample_count}, ...]
RECENT ASSESSMENTS: <existing recentLine>
ORIGINAL REQUEST: <raw prompt, quoted>
```

Existing server-side sanitization (`clamp01`, `clampBloom`, type filter, option/answer validation, `pq-<ts>-<i>` id) stays as-is and runs on Stage 2 output. If sanitized list is empty, return 502 as today.

## Code Changes (single file)

`supabase/functions/generate-practice-questions/index.ts`:
1. Add `SYSTEM_PROMPT_INTENT` and `SYSTEM_PROMPT_GENERATE` constants (replace the current `SYSTEM_PROMPT`).
2. Add a small `callGateway(messages)` helper to dedupe the two `fetch` calls and share 429/402/502 handling.
3. After fetching concepts + recent results, also fetch `student_concept_mastery` and `student_course_mastery` rows for `(studentId, courseId)`.
4. Call Stage 1, parse + clamp intent (with fallback defaults).
5. Run concept-selection logic to build the mastery snapshot passed to Stage 2.
6. Call Stage 2 with intent + snapshot; keep existing JSON parse + sanitize + response shape.
7. Log Stage 1's parsed intent (without the raw prompt) for debugging; do not log mastery PII beyond ids.

## Risks & Mitigations

| Risk | Mitigation |
|---|---|
| Two LLM calls double latency and cost | Stage 1 is tiny (~200 output tokens). Expected added latency ~600–900ms. Acceptable for practice flow; no streaming UX regression because the widget already waits for the full array. |
| Stage 1 returns malformed JSON | `response_format: json_object` + Zod parse + deterministic fallback intent so the request still completes. |
| Stage 1 hallucinates concept codes | Server filters `intent.concepts` against the known concept list before Stage 2. |
| Stage 1 inflates `count` to bypass UI cap | Server clamps to 1..10 before Stage 2. |
| Prompt injection in raw user prompt | Treated as untrusted user content in both stages; system prompts are server-owned. Length cap (≤1000) and control-char strip unchanged. |
| Mastery rows missing for a new student | Concept-selection logic falls back to course concept weights; Stage 2 prompt tolerates an empty/short snapshot. |
| Stage 2 still emits `short_answer` or out-of-range meta | Existing sanitizer filters/clamps before returning. |
| Extra DB reads (`student_concept_mastery`, `student_course_mastery`) | Both indexed by `(student_id, course_id)`; small row counts per student. No new tables. |
| Behavior drift vs. current single-prompt flow | Default intent (silent student) is tuned to match today's output: 5 questions, mcq+true_false, mixed difficulty, bloom 2–4. |

## Out of Scope
- Persisting generated questions to `assessment_questions` (still deferred).
- Streaming, caching across sessions, weekly-quiz/exam/diagnostic functions, or the chat function.
- Widget (`PracticeQuestionsWidget.tsx`) and mastery pipeline — unchanged; response shape is identical.

## Files Touched
- `supabase/functions/generate-practice-questions/index.ts` (only file)
