---
name: Coding Access (per-course, admin-approved)
description: Coding exercises/terminal are opt-in per course via admin approval; gating via useCodingAccess hook
type: feature
---

Coding functionality is hidden unless an admin approves it per course.

- **DB**: `courses.coding_access_status` = `none` | `pending` | `approved` | `rejected`, plus `coding_requested_at`, `coding_reviewed_at`, `coding_reviewed_by`. Trigger `courses_coding_access_guard` enforces: only admins set approved/rejected/revoke; teachers may only request (none/rejected → pending) or withdraw (pending → none).
- **Teacher**: `/teacher/setup/upload` has a "Coding Exercises" card — Yes/No radio ("Does this course require coding exercises?"). Yes → pending (admin review). Approved courses are locked for the teacher; only admin can revoke.
- **Admin**: `/admin/courses` list shows "Coding: pending"/"Coding" badges; the CourseProfileDialog has a Coding access section with Approve / Deny / Revoke.
- **Gating**: `src/hooks/useCodingAccess.ts` — `isApproved` is false until `ready` (most-restrictive-until-ready, same pattern as useTeacherNavPermissions). Gated surfaces: student chat Code button + CodingTerminalWidget (AIChat.tsx), "Industry-Relevant Exercise" resource option in lesson plan editor (CourseCreation.tsx), coding-exercise resource visibility for students (StudentLearningPath.tsx filter).
- **Not built yet** (explicitly deferred): Judge0 code execution (CodingTerminalWidget is a placeholder) and code-question mastery scoring. Coding/lab lesson-plan weeks ARE built (see coding-weeks memory) but are manual-only — AI lesson-plan generation does not create them. When Judge0 ships, it must also check coding access.
