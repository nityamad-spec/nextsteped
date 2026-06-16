## Problem

On `/student/chat`, asking "What concepts am I doing well in, and struggling with?" gets refused:

> I cannot access your personal progress data...

The data IS injected into the prompt (`courseMasteryLevel` + `conceptMasteryList` from `fetchStudentMasterySnapshot`), but the `STUDENT_SECTION` in `supabase/functions/chat/index.ts` carries a hard rule under `ADAPTING TO MASTERY`:

> never surface the level to the student … Never state a level as a label, talk down, or surface any of this. Adapt silently.

The model reads "never surface any of this" and refuses to discuss strengths/weaknesses at all. We want it to answer **qualitatively** when the student explicitly asks, while keeping the no-band-names rule (per the project core memory, which stays unchanged).

## Fix

Single file: `supabase/functions/chat/index.ts`. One targeted edit to the `STUDENT_SECTION` prompt — the `ADAPTING TO MASTERY` block (around lines 491–496). No data changes, no UI changes, no memory changes.

### Rewrite the ADAPTING TO MASTERY block

Keep the silent-adaptation default, but carve out an explicit exception for direct self-assessment questions.

New shape (conceptually):

```
ADAPTING TO MASTERY (internal — adapt silently by default)
- Course-level mastery: <band>
- Per-concept mastery:
  <concept: band lines>
- Match the question by MEANING to the closest concept ... (unchanged)
- Depth by level ... (unchanged)
- Never state a band as a label ("you're at the developing level"), talk
  down, or volunteer this data. Adapt silently.

EXCEPTION — direct self-assessment questions
- If the student directly asks about their own strengths, weaknesses,
  progress, or which concepts they're doing well in / struggling with,
  you MAY answer using the per-concept mastery above — but ONLY
  qualitatively. Group concepts into "going well" (proficient/expert
  internally) vs "needs more practice" (beginner/developing internally),
  name the concepts, and suggest one next step (e.g. revisit a topic in
  the lesson plan, try the Practice Questions tab).
- NEVER say the words "beginner", "developing", "proficient", "expert",
  or any numeric score, percentage, or level label. Talk about the
  concepts, not the rating.
- If no per-concept mastery is recorded yet, say so plainly and suggest
  taking the diagnostic or a weekly quiz so the assistant can give a
  more useful answer next time.
- This exception applies ONLY to direct self-assessment asks. Do not
  volunteer strengths/weaknesses in unrelated conversations.
```

This:
- Preserves "never show the band name" (core memory rule still holds — students never see beginner/developing/proficient/expert).
- Preserves silent adaptation as the default for normal teaching turns.
- Unblocks the direct question the user tested.

### Out of scope

- No change to `fetchStudentMasterySnapshot`, `fetchStudentProgressContext`, RAG wiring, caching, or `mode === "teacher"` branch.
- No change to `mem://index.md` or `mem://style/mastery-levels` — the core "never show bands" rule stays, and this new prompt language respects it.
- No UI changes on `/student/chat`.

## Verification

1. Deploy `chat`.
2. On `/student/chat`, ask "What concepts am I doing well in, and struggling with?" — confirm the response names concepts in "going well" / "needs more practice" groupings, names no bands or scores, and suggests a next step.
3. Ask a normal concept question (e.g. "explain for loops") — confirm the bot still answers as a normal teaching turn and does NOT volunteer mastery info.
4. As a student with no mastery rows yet (fresh account, no diagnostic), ask the same self-assessment question — confirm the bot says no data is recorded yet and suggests the diagnostic / a weekly quiz.
5. Confirm the bot never uses the strings "beginner", "developing", "proficient", "expert" in any of the above responses.
