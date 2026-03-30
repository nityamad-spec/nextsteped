

## Plan: Course Relevance Classification Layer for Study Mode

### How It Works

When a student sends a message in study mode, the system first makes a quick backend call to determine if the question is relevant to the course syllabus and concepts. Based on the result:

- **Relevant** → Normal chat call proceeds as-is
- **Not relevant** → A modified prompt is sent to the chat function, instructing the AI to acknowledge the off-topic nature, draw a practical real-world connection to the course, and then answer through that lens

### Architecture

```text
Student sends message
        │
        ▼
┌──────────────────────┐
│ classify-question    │  ← New edge function (non-streaming, fast)
│ Input: user message  │
│ + course name        │
│ + objectives         │
│ + concept list       │
│ Output: { relevant } │
└──────────────────────┘
        │
   ┌────┴────┐
   │relevant │ not relevant
   ▼         ▼
Normal    Chat call with
chat      wrapper prompt:
call      "The student asked
          something off-topic.
          Relate it to [course]
          in a practical way,
          then answer."
```

### Changes

**1. New edge function — `supabase/functions/classify-question/index.ts`**
- Accepts: `{ message, courseName, objectives, concepts }`
- Builds a classification prompt: "Given this course context, is the following question relevant? Reply with JSON `{relevant: true/false}`"
- Uses `google/gemini-2.5-flash-lite` (cheapest, fast) with tool-calling to extract structured `{ relevant: boolean }`
- Non-streaming, returns JSON response

**2. Update `src/pages/student/AIChat.tsx`**
- On component mount (when `enrolledCourseId` is available), fetch course name, objectives, and concepts from the database and store in state
- In `sendMessage` (study mode only):
  - Call `classify-question` with the user's message + course context
  - If `relevant: false`, prepend a wrapper system message to the chat call:
    *"The student's question is not directly about [course]. Before answering, briefly and naturally connect their question to a real-world application of [course concepts]. Then answer helpfully through that lens."*
  - If `relevant: true`, proceed with the normal chat call unchanged
- Show a subtle indicator when the AI is relating an off-topic question (optional small badge on the response)

**3. Update `supabase/functions/chat/index.ts`**
- Accept an optional `relevanceContext` field in the request body
- When present and `relevant === false`, prepend the "relate to course" instruction to the system prompt dynamically
- This keeps the routing logic clean — classification on a separate function, prompt modification in the chat function

### Performance Considerations
- Classification call uses the cheapest/fastest model and a minimal prompt (~100 tokens)
- Adds ~0.5-1s latency only for study mode messages
- Course context is fetched once on mount and cached in component state

### Files Modified
- `supabase/functions/classify-question/index.ts` — new edge function
- `src/pages/student/AIChat.tsx` — fetch course context, call classifier before chat
- `supabase/functions/chat/index.ts` — handle relevance context in prompt

