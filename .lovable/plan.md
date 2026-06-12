# Anti-decay in long student conversations

All changes are in `supabase/functions/chat/index.ts`, scoped to the student path (`mode !== "teacher" && mode !== "exam"`). Teacher and exam request assembly is untouched.

## 1. Config block

Add a new tunable constant near `SCOPE_CLASSIFIER_CONFIG` (~line 298):

```ts
const ANTI_DECAY_CONFIG = {
  enabled: true,
  reminderAfterStudentTurns: 8,   // append reminder once student turns > this
  maxTurnsSent: 12,               // cap on most recent messages forwarded
  reminderText:
    "Reminder of standing rules: (1) only this course's subject, its concepts, and foundational prerequisites — anything else is out of scope, decline in one or two sentences; (2) keep responses short and matched to the question, no length creep; (3) at most one question per response; (4) never give direct exam or assignment answers.",
  // Neutral summary placeholder for dropped earlier turns. {{topics}} is filled
  // with a comma-joined list of short topic hints extracted from dropped user turns.
  summaryTemplate:
    "Summary of earlier conversation (topics only, details omitted): {{topics}}.",
};
```

Both thresholds (8 and 12) live here so they can be tuned without code changes.

## 2. History-shaping helper

New pure function `shapeStudentHistory(messages)`:

- Count student turns = `messages.filter(m => m.role === "user").length`.
- If `messages.length <= maxTurnsSent`: keep as-is.
- Otherwise:
  - Take the last `maxTurnsSent` messages as `recent`.
  - From the dropped prefix, collect each `user` message's first ~60 chars, dedupe, join with `; ` → `topics`. If empty, use `"earlier discussion"`.
  - Prepend a single synthetic message: `{ role: "system", content: summaryTemplate.replace("{{topics}}", topics) }`.
- Return `{ shapedMessages, studentTurns }`.

This is a topics-only neutral summary — no model call, zero added latency, no risk of leaking earlier content into the new request beyond bare topic hints.

## 3. Wire into the main request

At the main TA call (~line 573–582), only for the student path:

```ts
let outgoingMessages = messages;
if (mode !== "teacher" && mode !== "exam" && ANTI_DECAY_CONFIG.enabled) {
  const { shapedMessages, studentTurns } = shapeStudentHistory(messages);
  outgoingMessages = shapedMessages;
  if (studentTurns > ANTI_DECAY_CONFIG.reminderAfterStudentTurns) {
    outgoingMessages = [
      ...outgoingMessages,
      { role: "system", content: ANTI_DECAY_CONFIG.reminderText },
    ];
  }
}

// existing fetch body becomes:
messages: [{ role: "system", content: fullSystemPrompt }, ...outgoingMessages],
```

The reminder is appended **after** the conversation history so it is the most recent instruction the model sees, exactly as specified.

## 4. Out of scope

- No changes to teacher mode, exam mode, the scope classifier, or RAG assembly.
- No DB changes, no UI changes, no client changes — request shape on the wire is unchanged from the client's perspective.
- No LLM-generated summary; the spec says "one short neutral summary paragraph (topics only)" and a deterministic topic list satisfies that without adding cost or a failure mode.

## Technical notes

- "Turns" is interpreted as student (user) messages, matching the spec wording "student turns".
- Cap is applied to total messages forwarded (`maxTurnsSent = 12` most recent), which preserves paired user/assistant context at the tail.
- Both the reminder and the summary are injected as `role: "system"` messages so they aren't mistaken for student input and don't pollute the visible transcript on the client.
- Reminder is re-appended on every request once the threshold is crossed, so the model sees it as the freshest instruction every turn — directly counteracting instruction decay.
