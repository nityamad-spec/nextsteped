

## Plan: Persist TA Settings in the Database

### Problem
TA settings (AI prompts, exam config, quiz config) are stored only in `localStorage`, so they are lost on cache clear and invisible to collaborators.

### Database Change

Create a new `course_ta_settings` table tied to `course_id`:

```sql
CREATE TABLE public.course_ta_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id uuid NOT NULL UNIQUE,
  hint_ladder boolean NOT NULL DEFAULT true,
  knowledge_sources text NOT NULL DEFAULT 'uploaded_and_web',
  plagiarism_warnings boolean NOT NULL DEFAULT true,
  exam_time_limit integer NOT NULL DEFAULT 60,
  exam_difficulty text NOT NULL DEFAULT 'Mixed',
  exam_question_mix text NOT NULL DEFAULT '40% MCQ, 30% Short Answer, 30% Coding',
  exam_presentation text DEFAULT 'all_at_once',
  custom_study_prompt text DEFAULT '',
  custom_exam_prompt text DEFAULT '',
  quiz_num_questions integer DEFAULT 5,
  quiz_question_mix text DEFAULT 'mixed',
  quiz_difficulty text DEFAULT 'Medium',
  quiz_time_limit integer DEFAULT 10,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.course_ta_settings ENABLE ROW LEVEL SECURITY;

-- Teachers (owner) can do everything
CREATE POLICY "Teachers can manage own course TA settings"
  ON public.course_ta_settings FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM courses WHERE courses.id = course_id AND courses.teacher_id = auth.uid()));

-- Collaborators can view
CREATE POLICY "Collaborators can view TA settings"
  ON public.course_ta_settings FOR SELECT TO authenticated
  USING (is_course_member(course_id, auth.uid()));

-- Students can view (needed for AI chat to use correct prompts/limits)
CREATE POLICY "Students can view TA settings for enrolled courses"
  ON public.course_ta_settings FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM enrollments WHERE enrollments.course_id = course_ta_settings.course_id AND enrollments.student_id = auth.uid()));
```

### Code Changes

#### 1. New hook: `src/hooks/useTASettings.ts`
- Fetches settings from `course_ta_settings` by `courseId`
- Returns `{ taSettings, loading, saveTASettings }` 
- `saveTASettings` does an upsert (insert on conflict update)
- Falls back to `defaultTASettings` if no DB row exists yet

#### 2. Update `AITASettings.tsx` (step 6)
- Replace `useApp().taSettings` with `useTASettings(courseId)`
- On save, call `saveTASettings()` instead of `setTASettings()`
- Get `courseId` from `localStorage.getItem("currentCourseId")`

#### 3. Update `ExamMode.tsx` (step 7)
- Same pattern: use `useTASettings(courseId)` for load and save

#### 4. Update `AIChat.tsx` (student side)
- Fetch TA settings from DB using the student's enrolled course ID instead of `useApp().taSettings`
- This ensures students see the teacher's actual configured settings

#### 5. Update `AppContext.tsx`
- Remove `taSettings` / `setTASettings` from context (no longer needed in global state)
- Remove the `localStorage` key `ns_ta_settings`

### Files Modified
1. **New migration** — `course_ta_settings` table + RLS policies
2. **New file** — `src/hooks/useTASettings.ts`
3. `src/pages/teacher/AITASettings.tsx` — use new hook
4. `src/pages/teacher/ExamMode.tsx` — use new hook
5. `src/pages/student/AIChat.tsx` — fetch from DB
6. `src/contexts/AppContext.tsx` — remove taSettings state
7. `src/types/index.ts` — no changes needed (TASettings interface stays)

