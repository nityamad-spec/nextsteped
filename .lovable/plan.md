

## Plan: Switch TA Model and Add Configurable System Instructions

### Overview
Change the AI model from `google/gemini-3-flash-preview` to `google/gemini-2.5-flash-lite` and allow professors to customize the system prompts for both Study and Exam Prep modes via the TA Settings page. These custom instructions are passed from the frontend to the edge function at chat time.

### Changes

#### 1. Add system instruction fields to TASettings type
**File: `src/types/index.ts`**
- Add `studySystemPrompt?: string` and `examSystemPrompt?: string` to the `TASettings` interface.

#### 2. Add system instruction editors to TA Settings page
**File: `src/pages/teacher/AITASettings.tsx`**
- Add a new section (or tab) with two textarea fields: one for Study mode instructions and one for Exam Prep mode instructions.
- Pre-populate with sensible defaults matching the current hardcoded prompts.
- Include helper text explaining these control how the AI behaves with students.

#### 3. Pass custom instructions from frontend to edge function
**File: `src/pages/student/AIChat.tsx`**
- When calling the chat edge function, include `studySystemPrompt` and `examSystemPrompt` from the app context's `taSettings` in the request body.

#### 4. Update edge function to use configurable prompts and new model
**File: `supabase/functions/chat/index.ts`**
- Change model from `google/gemini-3-flash-preview` to `google/gemini-2.5-flash-lite`.
- Accept optional `studySystemPrompt` and `examSystemPrompt` from the request body.
- If provided, use them instead of the hardcoded defaults.

#### 5. Update mock defaults
**File: `src/data/mockData.ts`**
- Add default values for `studySystemPrompt` and `examSystemPrompt` in `defaultTASettings`.

### Files Modified
1. `src/types/index.ts` — add prompt fields to TASettings
2. `src/data/mockData.ts` — add default prompts
3. `src/pages/teacher/AITASettings.tsx` — add textarea editors for system instructions
4. `src/pages/student/AIChat.tsx` — pass custom prompts in request body
5. `supabase/functions/chat/index.ts` — switch model, accept custom prompts

