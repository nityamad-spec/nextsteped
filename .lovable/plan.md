## Goal
Add an "Auto-generate metadata" button on the Add/Edit Question dialog in `/teacher/setup/exam-mode` that calls a new edge function (Gemini 2.5 Pro) and populates 6 fields: Difficulty, Bloom's Level, Difficulty Estimate, Bloom Justification, Difficulty Justification, Explanation.

## New edge function: `supabase/functions/generate-question-metadata/index.ts`
- Accepts JSON: `{ question, questionType, options?, correctAnswer }`
- Validates with Zod; requires question + correctAnswer (+ options for MCQ/TF)
- Calls Lovable AI Gateway with model `google/gemini-2.5-pro`
- Uses AI SDK `Output.object` (strict Zod schema) to guarantee shape:
  ```
  {
    difficulty: "easy" | "medium" | "hard",
    bloomsLevel: 1-6,
    difficultyEstimate: number (0.00-1.00),
    bloomJustification: string,
    difficultyJustification: string,
    explanation: string
  }
  ```
- System prompt instructs model to analyze question cognitive demand, map Bloom's taxonomy correctly, estimate p-value (probability a typical student answers correctly), and write a student-facing explanation of the correct answer.
- Returns strict JSON; handles 429 (rate limit) and 402 (credits) with clear error messages.
- CORS enabled; standard corsHeaders pattern.

## Frontend changes: `src/pages/teacher/ExamMode.tsx`
- Add a `Sparkles`-icon button labeled **"Auto-generate with AI"** at the top of the question form (above the Difficulty field).
- Button state:
  - **Disabled** when `question` is empty, or `correctAnswer` is empty, or (for MCQ) fewer than 2 options filled. Tooltip explains what's missing.
  - Shows spinner + "Generating…" while pending.
- On click:
  - Calls `supabase.functions.invoke('generate-question-metadata', { body: {...} })`
  - **Only fills empty fields** — checks each of the 6 target fields and skips any with an existing non-empty/non-default value. (Difficulty default treated as empty only if user hasn't touched it — we'll track via a `metadataTouched` flag or compare to initial state.)
  - Shows toast: "Filled N field(s)" or "All fields already have values"
  - On error: toast with message from edge function; leaves form unchanged.
- Available in both **Add** and **Edit** dialogs (single shared form).

## Preserve-existing-values logic
Track initial snapshot of the 6 fields when dialog opens. A field is considered "empty" (eligible for auto-fill) if:
- string fields (justifications, explanation): trimmed value is `""`
- Difficulty: unchanged from initial and initial was empty/undefined
- Bloom's Level: `null`/unset
- Difficulty Estimate: `null`/unset (not just default 0.50 — we'll store as nullable until user edits)

## Verification
- Deploy edge function and test with `curl_edge_functions` using a sample MCQ.
- Confirm strict JSON returned; verify Bloom (1-6), difficulty enum, estimate in range.
- Manual UI check: button disabled → enabled once inputs filled → click populates only empty fields.

## Risks / notes
- Gemini 2.5 Pro is slower/more expensive than Flash; acceptable for one-shot metadata generation on demand.
- Structured output via Zod schema ensures parseable JSON — no manual JSON.parse fallback needed.
- Uses existing `LOVABLE_API_KEY`; no new secrets required.