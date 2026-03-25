

## Plan: Redesign Lesson Plan Output with AI Suggest & Editable Day View

### Summary
Three changes: (1) swap the Lock icon on lesson plan uploads, (2) completely redesign the post-upload "plan" phase in `CourseCreation.tsx` to be an interactive, editable, day-by-day lesson plan with AI-powered suggestions per day, and (3) create a new edge function for AI suggestions. The output should mirror the polished review style of the Syllabus Review page.

### Changes

#### 1. Fix Upload Icon
**File: `src/pages/teacher/CourseCreation.tsx`**
- Replace `<Lock className="h-5 w-5 text-primary" />` on the "Upload Lesson Plans" card header with `<ClipboardList>` (already imported as it's available in lucide-react) — better represents internal lesson plans.

#### 2. Redesign the Plan Phase Output
**File: `src/pages/teacher/CourseCreation.tsx`**

Replace the current resource-accept/reject model with an editable lesson plan layout:

**Each Day card (collapsible/expandable) contains:**
- **Day header**: editable topic title, date range, weightage — inline edit on click
- **Description field**: a `Textarea` auto-filled from uploads, fully editable by professor
- **"AI Suggest" button** per day: calls the new edge function with context (all uploads, course objectives, day number, existing content) and streams back a detailed suggestion for that day's lesson description. Shows a loading spinner while generating, then populates the description field (professor can accept, edit, or dismiss).
- **Resources list**: similar to current but simpler — editable titles/descriptions, add/remove

**Overall layout improvements:**
- Clean card-based design matching the Syllabus Review page style
- All days expanded by default initially, collapsible via chevron
- Each day shows: Day badge, topic (editable), date (editable), description textarea, resources
- AI Suggest button styled with `<Sparkles>` icon, placed next to the description label
- When AI is generating, show inline `<Loader2>` spinner with "Generating suggestion..." text

**Bottom bar:**
- "Export Plan" dropdown (PDF/Word) — keep existing export logic
- "Publish Plan" button — professors don't need to complete all days; publish works with partial content
- After publishing, "Continue to Diagnostic Questions" button appears
- Remove the "Publish plan & activate Student TA" label — just "Publish Lesson Plan"

**Post-setup access:**
- The existing `TeachingPlan.tsx` (at `/teacher/teaching-plan`) already allows editing after setup. No routing changes needed.

#### 3. New Edge Function: `suggest-lesson`
**File: `supabase/functions/suggest-lesson/index.ts`**

- Accepts: `{ dayNumber, dayTopic, existingDescription, courseObjectives, totalDays }`
- System prompt: "You are an expert curriculum designer. Generate a detailed, actionable lesson description for a single day of a course. Include specific activities, timing suggestions, learning outcomes, and best practices. Be practical and detailed."
- Uses Lovable AI gateway with `google/gemini-3-flash-preview`
- Returns non-streaming JSON: `{ suggestion: string }`
- Includes CORS headers and 429/402 error handling

#### 4. Wire AI Suggest in CourseCreation
**File: `src/pages/teacher/CourseCreation.tsx`**

- Add `suggestingDayId` state to track which day is loading
- On click "AI Suggest" for a day: call `supabase.functions.invoke("suggest-lesson", { body: {...} })`
- On success: populate that day's description field with the suggestion
- Professor can then edit, keep, or clear it
- Toast on error

### Files Modified
1. `src/pages/teacher/CourseCreation.tsx` — icon fix, full plan phase redesign, AI suggest integration
2. `supabase/functions/suggest-lesson/index.ts` — new edge function for AI lesson suggestions

