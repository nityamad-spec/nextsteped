# Scope chat history to the selected course

Right now the chat sidebar lists every conversation a user has ever had, regardless of which course it belongs to. In the Cloud Engineering course you see Intro to Gen AI and Gen AI for Leaders chats. New chats are already tagged with a course; the history list just ignores that tag.

## What changes

1. Chat history is filtered by the currently selected course — student Teaching Assistant chat and the professor Course Assistant chat both.
2. Switching courses reloads the sidebar with only that course's chats.
3. Chats saved before course tagging existed (100 of them) get a one-time backfill onto a course, so nothing is lost.

## Backfill rule

For each untagged session, assign the course from the session's own messages where possible; otherwise assign the user's active/first-enrolled course (for professors, their owned course). Any session that still cannot be resolved is left untagged and hidden from the per-course lists.

Untagged counts today: 58 student study, 41 exam prep, 1 professor.

## Technical notes

- `src/hooks/useChatSessions.ts` — `loadSessions` currently filters by `user_id` + `mode` only. Add `.eq("course_id", courseId)` and include `courseId` in the query dependencies/effect so a course switch refetches. Skip loading (empty list) while `courseId` is null rather than showing everything.
- `src/pages/student/AIChat.tsx` already passes `enrolledCourseId`; `src/pages/teacher/TeacherChat.tsx` needs the teacher course id passed in the same way (via `useTeacherCourseId`).
- One-time data update on `chat_sessions` to set `course_id` for null rows, using the join to enrollments/courses described above.
- No schema change; `course_id` already exists and is already written on create.

## Verification

- Load a student account enrolled in two courses, confirm each course shows only its own chats and the counts add up to the untagged-plus-tagged totals.
- Create a new chat, switch course, switch back — the chat appears only under its own course.
