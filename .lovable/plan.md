

## RAG-Enhanced TA Chat — Implementation Plan

### Overview

Upgrade the `chat` edge function to retrieve and inject relevant course context before each AI call. Four retrieval layers, all executed server-side in the edge function.

### Current State

- The chat edge function receives `messages`, `mode`, system prompts, and `relevanceContext`
- No course-specific content is injected — the AI answers from general knowledge only
- Course materials (syllabus, lecture notes) exist in the `course-materials` storage bucket
- Concepts, assessment questions, and diagnostic results exist in the DB

### Architecture

```text
Student sends message
       │
       ▼
  chat edge function
       │
       ├─ 1. Fetch approved syllabus JSON from storage
       ├─ 2. Query concepts table for course concept codes + weights
       ├─ 3. Query assessment_questions for topic-matched practice Qs
       ├─ 4. Query diagnostic_results + assessment_results for student mastery
       │
       ▼
  Build enriched system prompt with retrieved context
       │
       ▼
  Call AI gateway with augmented prompt
```

### Layer Details

**1. Syllabus & Lecture Notes RAG**
- The client sends `courseId` and `teacherId` (the course owner) to the chat function
- Edge function downloads `{teacherId}/syllabus/approved-syllabus.json` from storage using service role
- Extracts relevant sections (week titles, topics, learning outcomes) and injects as context
- Truncated to ~2000 tokens to stay within budget

**2. Concept-Aware Context Injection**
- Query `concepts` table filtered by `course_id`
- Inject concept codes and weights into the system prompt so the AI understands the course taxonomy
- Example: "Course concepts (by importance): PWIM/Python_Environment (0.15), PWIM/Data_Types (0.20)..."

**3. Assessment Question Bank RAG**
- Extract the topic from the student's latest message (reuse the classify-question pattern or keyword match against concept codes)
- Query `assessment_questions` where `topic` matches and `mode = 'quiz'`, limit 3
- Inject as "Reference questions the professor uses for this topic" so the AI can calibrate depth and style

**4. Student Progress-Aware Responses**
- Query `diagnostic_results` for the student's learner level and per-concept scores
- Query `assessment_results` for recent quiz/exam performance
- Inject a summary: "Student level: Intermediate. Weak areas: OOP Basics (38%), Error Handling (30%). Strong: Variables (85%)"
- The AI adapts explanation depth accordingly

### Changes

**`supabase/functions/chat/index.ts`**
- Accept new fields: `courseId`, `teacherId`, `studentId`
- Create a Supabase admin client using `SUPABASE_SERVICE_ROLE_KEY`
- Add retrieval functions for each of the 4 layers
- Build a `courseContext` string and prepend it to the system prompt
- Add a `ragEnabled` flag (default true) so it can be toggled

**`src/pages/student/AIChat.tsx`**
- Pass `courseId` (from `enrolledCourseId`), `teacherId` (from course record), and `studentId` (from `user.id`) in the chat function call body

**New DB query** (no migration needed — all tables exist):
- `concepts` — SELECT by course_id
- `assessment_questions` — SELECT by course_id + topic match
- `diagnostic_results` — SELECT by student_id + course_id
- `assessment_results` — SELECT by student_id + course_id

### Context Budget

To avoid exceeding model context limits, each layer is capped:
- Syllabus: ~2000 chars (key topics and outcomes only)
- Concepts: ~500 chars (codes + weights)
- Practice questions: ~1000 chars (3 sample questions, truncated)
- Student progress: ~300 chars (summary stats)
- Total additional context: ~3800 chars (~950 tokens)

### Files Modified
- `supabase/functions/chat/index.ts` — add 4 retrieval layers and context injection
- `src/pages/student/AIChat.tsx` — pass courseId, teacherId, studentId to chat function

