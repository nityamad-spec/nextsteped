

## Fix "In Progress" badge stuck after AI Assistant & Enrollment save

### Root cause

`CourseSetup.tsx` uses two strategies to compute the status badge:

1. **Data-driven** (e.g. syllabus uploaded, concepts exist, lesson plan published) → flips to **Complete** automatically.
2. **Opened-only** (Enrollment) or **content-driven** (AI Assistant requires `custom_study_prompt` non-empty).

Problems:
- **AI Assistant**: stays **In Progress** unless the teacher types a custom prompt. The default prompt is shown disabled and is sufficient on its own — most teachers save without overriding it, so the step never completes.
- **Enrollment & Course Settings**: there is no completion criterion in `CourseSetup.tsx` at all (comment in code: "no DB-backed completion criteria yet"), and `EnrollmentSettings.handleSave` is a toast-only no-op. So clicking "Save & Finish" can never mark it Complete.

### Fix

Introduce an explicit per-step **"completed"** flag stored in the existing `teacher_setup_progress` table, alongside `opened_at`. The save handler in each module marks it complete; `CourseSetup` reads it as the completion source for steps that don't have a natural data-driven signal.

#### 1. DB migration

Add `completed_at timestamptz NULL` to `teacher_setup_progress`. No backfill needed — null = not completed.

#### 2. New helper in `CourseSetup.tsx`

- Extend `fetchOpenedSteps` → `fetchStepProgress(uid)` returning `{ opened: Record<string,boolean>, completed: Record<string,boolean> }`.
- New `markStepCompleted(uid, stepId)` upserts `completed_at = now()`.

#### 3. Module save handlers mark themselves complete

| Module | File | Change |
|---|---|---|
| AI Assistant | `src/pages/teacher/AIAssistantAndSettings.tsx` | After successful `saveTASettings(...)`, call `markStepCompleted(user.id, "ai-settings")` |
| Enrollment & Course | `src/pages/teacher/EnrollmentSettings.tsx` | In `handleSave`, persist `start_date`/`end_date` to `courses` table (currently lost), then call `markStepCompleted(user.id, "enrollment")` |

#### 4. Update `CourseSetup.tsx` status logic

- **AI Assistant** (`ai-settings`): Complete if `completed[ai-settings]` is true OR `custom_study_prompt` is non-empty (keep legacy auto-complete for teachers who already wrote a prompt). Otherwise In Progress if opened.
- **Enrollment** (`enrollment`): Complete if `completed[enrollment]` is true. Otherwise In Progress if opened.
- **Exam Mode**: Keep existing logic (`exam_enabled || exam_approved`); no change.

### Files touched

| Path | Change |
|---|---|
| `supabase/migrations/<new>.sql` | `ALTER TABLE teacher_setup_progress ADD COLUMN completed_at timestamptz NULL;` |
| `src/pages/teacher/CourseSetup.tsx` | Replace `fetchOpenedSteps` with `fetchStepProgress`; update AI Assistant + Enrollment completion rules; export `markStepCompleted` helper (or move helpers to a small shared file) |
| `src/pages/teacher/AIAssistantAndSettings.tsx` | Call `markStepCompleted(user.id, "ai-settings")` after successful save |
| `src/pages/teacher/EnrollmentSettings.tsx` | Persist `start_date`/`end_date` to `courses`; call `markStepCompleted(user.id, "enrollment")` after save |

### Out of scope

- No change to the AI Assistant's default prompt behavior or Enrollment UI/fields.
- No retroactive marking — teachers who previously saved these modules will need to click "Save & Finish" once more (single click, then permanent).
- No change to other steps (Upload, Concept Review, Lesson Plan, Diagnostic, Exam Mode) — their data-driven completion already works.

