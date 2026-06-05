UI-only copy changes in `src/pages/teacher/DiagnosticQuestionsSetup.tsx`.

**1. "How it works" section (lines 332–333)** — update counts from 5 → 10:
- "**10 Standard Questions** — Common to all students, covering core concepts at a medium difficulty level"
- "**10 Adaptive Questions** — Based on performance on the standard questions, students are routed to an Easy, Medium, or Hard tier of follow-up questions"

**2. Generation progress panel (lines 439–442)** — remove the helper paragraph entirely:
- Delete the `<p className="text-[11px] text-muted-foreground">…All four tiers run in parallel. Each tier retries up to 3 times until 5 valid MCQs pass semantic validation. Using high-quality model (Gemini 2.5 Pro) — generation may take ~60–90s.</p>` block.

No edge function, schema, or business-logic changes.