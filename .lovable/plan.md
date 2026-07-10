# Make "Course Setup" admin-editable

Remove the always-visible lock on Course Setup so admins can hide/show it like any other nav item. Only Support stays always visible (fallback landing page for hidden-route redirects).

## Changes

1. `src/config/teacherNav.ts` — drop `alwaysVisible: true` from the Course Setup entry. Keep `alwaysUnlocked: true` so the setup-completion gate still lets teachers reach it. Support keeps both flags.

2. `src/hooks/useTeacherNavPermissions.ts` — remove `/teacher/setup` from `TEACHER_NAV_ALWAYS_ON`; keep `/teacher/support` as the only always-on path.

3. `src/components/admin/TeacherProfileDialog.tsx` — no code change needed: the "Always visible" badge + disabled checkbox are driven off `item.alwaysVisible`, so Course Setup will automatically become an editable checkbox.

## Behavior after change

- Admin can uncheck Course Setup in the Navigation Access tab.
- If Course Setup is hidden, direct visits to `/teacher/setup` redirect to `/teacher/support` (existing nav-permission guard).
- The existing setup-incomplete redirect still points at `/teacher/setup`, but Support remains in `ALWAYS_OPEN_PATHS`, so a teacher with hidden Setup + incomplete setup just lands on Support with no other nav — the intended admin-imposed state, no redirect loop.
- Default for teachers with no permissions row is now **only Support** (matches your original "Only Support" choice more strictly).

## Verification

- Open Navigation Access for a teacher → Course Setup is a normal checkbox (no "Always visible" badge).
- Uncheck it, save. Sign-in simulation / DB row shows `/teacher/setup` removed from `allowed_paths`; `TeacherLayout` filter hides Course Setup and redirects `/teacher/setup` to `/teacher/support`.
- Support remains uneditable and always visible.
