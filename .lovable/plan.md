# Prevent teachers from being stranded when admin hides Course Setup

## Problem

Course Setup is now admin-hideable via `teacher_nav_permissions`. If a teacher whose Setup is hidden creates a new course (`/teacher/courses/new` sits outside `TeacherLayout`, so it's always reachable), the post-creation redirect sends them to `/teacher/setup`, which `TeacherLayout` then bounces to `/teacher/support`. They can never finish setup for the course they just created.

## Fix — auto-unlock Course Setup while the teacher owns a course with incomplete setup

Course Setup becomes effectively "always visible" whenever the teacher is the owner of at least one course whose setup pipeline is not yet complete. Admin's hide preference still applies the moment setup is finished — so the option stays useful, but never traps a teacher mid-onboarding.

This mirrors intent: admin wants to hide the setup UI from teachers who don't need it, not from teachers who are actively required to complete it.

## Changes

### `src/hooks/useTeacherNavPermissions.ts`
- Add a second computed set `forcedPaths`. If `useTeacherSetupStatus` reports `isComplete === false` **and** the teacher owns at least one course (owner, not collaborator-only), include `/teacher/setup` in `forcedPaths`.
- Merge `forcedPaths` into the effective allow-list returned by `isAllowed`.
- To avoid a circular dep, do the "owner + setup incomplete" check inline in the hook: query `courses` filtered by `teacher_id = auth.uid()` (limit 1) and call the same setup-complete probe already used by `useTeacherSetupStatus`. Reuse that hook directly — it's already in `TeacherLayout`'s tree, so calling it in the permissions hook is safe.

Simpler alternative that avoids a hook-in-hook data dep: pass `forceSetup: boolean` into the filter from `TeacherLayout` (which already calls both hooks). Preferred, because it keeps `useTeacherNavPermissions` a pure read of the DB row.

### `src/layouts/TeacherLayout.tsx`
- Compute `forceSetup = !setupComplete && ownsAtLeastOneCourse`.
  - `ownsAtLeastOneCourse` is inferred from `useTeacherSetupStatus`'s existing course lookup — but that hook doesn't currently expose it. Small extension: have `useTeacherSetupStatus` also return `ownsAnyCourse: boolean` (already fetched internally via the `courses` query where `teacher_id = user.id`).
- Build effective allow-list = `allowed ∪ (forceSetup ? ["/teacher/setup"] : [])`.
- Use this effective list for both:
  - the sidebar filter (`teacherNav = TEACHER_NAV.filter(item => effectiveAllowed(item.path))`)
  - the redirect guard (`if (!effectiveAllowed(location.pathname)) navigate("/teacher/support")`).

### `src/components/admin/TeacherProfileDialog.tsx`
- Add a small helper note under the Course Setup row: "Automatically shown while any of this teacher's courses still needs setup." — so admins are not surprised to see it appear.

## Behavior after fix

| Case | Course Setup in sidebar? |
|---|---|
| Admin hid Setup, teacher owns no course | Hidden |
| Admin hid Setup, teacher owns a course with incomplete setup | **Auto-visible** (until setup done) |
| Admin hid Setup, all owned courses have completed setup | Hidden |
| Admin allowed Setup | Visible (unchanged) |
| Collaborator-only, no owned courses | Hidden if admin hid it (they don't run setup) |

## Out of scope

- No change to `/teacher/courses/new` reachability. Course creation stays admin-independent by design (there is no nav-permission entry for it).
- No changes to student or admin flows.

## Verification

1. Seed a teacher with `allowed_paths = ['/teacher/support']` and no courses → sidebar shows only Support.
2. Same teacher creates a new course via `/teacher/courses/new` → after redirect, sidebar now shows Course Setup + Support, and `/teacher/setup` loads.
3. Complete setup for that course → sidebar drops Course Setup on next mount (admin's hide preference kicks back in).
4. Grant Setup back in the admin dialog → Course Setup is visible regardless of setup state.
