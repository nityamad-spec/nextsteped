# Scope-classifier gate for the student chat

Add a fast, single-message scope classifier inside `supabase/functions/chat/index.ts` that runs **only on the student path** (mode !== "teacher" && mode !== "exam"), right after `STUDENT_SECTION` is composed and before the main TA model call. It uses a lite model, sees only the incoming message + course context (no history), and decides ON_TOPIC vs OFF_TOPIC.

Existing call sites do not need to change — this is purely server-side.

## 1. Tunable config block (top of file)

Add near the other constants so the prompt can be tweaked without touching control flow:

```ts
const SCOPE_CLASSIFIER_CONFIG = {
  enabled: true,
  model: "google/gemini-2.5-flash-lite",
  timeoutMs: 4000,
  // {{courseTitle}} and {{courseTopics}} are interpolated at request time.
  promptTemplate: `You are a scope classifier for a university course chatbot. Course: {{courseTitle}}. Topics: {{courseTopics}}. Student message: {{message}}. The rule: if the message is not explicitly about the course, not about any of the course's concepts, and unrelated to any foundational prerequisite, it is OFF_TOPIC. Career preparation (interview prep, internships, job applications, resume help, company hiring advice) is always OFF_TOPIC even when the industry relates to the course. Short conversational replies, follow-ups, thanks, or requests to re-explain are ON_TOPIC. Reply with exactly one word: ON_TOPIC or OFF_TOPIC.`,
  redirectTemplate: `That's outside what I can help with for this course. Want to come back to something from {{courseTitle}}?`,
};
```

## 2. Classifier helper

New function `classifyScope({ message, courseTitle, courseTopics, apiKey })`:

- Builds the prompt by substituting `{{courseTitle}}`, `{{courseTopics}}`, `{{message}}`.
- POSTs to `https://ai.gateway.lovable.dev/v1/chat/completions` with:
  - `model: SCOPE_CLASSIFIER_CONFIG.model`
  - single user message (no system, no history)
  - `max_tokens: 4`, `temperature: 0`
  - `signal: AbortSignal.timeout(SCOPE_CLASSIFIER_CONFIG.timeoutMs)`
- Parses the first token; returns `"OFF_TOPIC"` only on an exact case-insensitive match, otherwise `"ON_TOPIC"`.
- On any throw / non-2xx / timeout: `console.error("scope_classifier_failure", ...)` and return `"ON_TOPIC"` (fail open).

Also log every OFF_TOPIC verdict in a single structured line for audit:

```ts
console.log(JSON.stringify({
  event: "scope_classifier_off_topic",
  courseId, studentId,
  courseTitle, message,
  model: SCOPE_CLASSIFIER_CONFIG.model,
  ts: new Date().toISOString(),
}));
```

(Plain `console.log` is sufficient — it shows up in Edge Function logs and on the AI Gateway Calls tab via Supabase log search. No new table needed for v1.)

## 3. Wire it into the handler

In `serve(...)`, after `STUDENT_SECTION` is built and the `latestUserMessage` is known, but before the main `fetch("https://ai.gateway.lovable.dev/...")` call (around line 482):

```ts
if (
  SCOPE_CLASSIFIER_CONFIG.enabled &&
  mode !== "teacher" &&
  mode !== "exam" &&
  latestUserMessage.trim().length > 0
) {
  const verdict = await classifyScope({
    message: latestUserMessage,
    courseTitle,
    courseTopics: courseTopics || "(none provided)",
    apiKey: LOVABLE_API_KEY,
  });

  if (verdict === "OFF_TOPIC") {
    const redirect = SCOPE_CLASSIFIER_CONFIG.redirectTemplate
      .replaceAll("{{courseTitle}}", courseTitle);

    // Stream-shaped SSE response so the existing client (which reads
    // text/event-stream from this function) renders it without changes.
    const sse =
      `data: ${JSON.stringify({ choices: [{ delta: { content: redirect } }] })}\n\n` +
      `data: [DONE]\n\n`;

    return new Response(sse, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
    });
  }
}
```

Note: `latestUserMessage` is currently only computed inside the RAG block (line 339). Hoist it to a single `const latestUserMessage = messages?.[messages.length - 1]?.content || "";` declared once near the top of the try-block so both the RAG block and the classifier reuse it.

## 4. Out of scope

- No new DB table — verdicts log to Edge Function logs only. A `scope_classifier_log` table can be added later if false-positive review needs SQL queries.
- No UI changes; redirect text is delivered through the existing chat stream.
- Exam mode and professor mode keep their current relevance handling (`relevanceContext` and `PROFESSOR_SECTION`).
- The old `relevanceContext`-based redirect (line 474) stays for backwards compatibility; the new classifier is independent and runs server-side regardless.

## Technical notes

- Lite model + 4-token cap + temperature 0 keeps the extra latency to ~150–400 ms in the typical case.
- Fail-open is enforced in `classifyScope` itself, so a Gateway outage cannot block legitimate students.
- The classifier never sees prior messages — this is deliberate per spec, even though it means "thanks" / "can you re-explain" must be handled by the prompt's allow-list clause rather than by history.
- Putting the prompt + model + timeout in `SCOPE_CLASSIFIER_CONFIG` means tuning is a single-constant edit, no control-flow change.
