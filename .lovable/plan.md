# Resources tab under Learning Path (skilling courses only)

## What students see

A new "Resources" sub-item in the left sidebar, directly under Learning Path as its third and last sub-point:

```text
Home
Learning Path
  Career Readiness
  Project Lab
  Resources
Teaching Assistant
Feedback
```

- Visible only for skilling (employment-pathway) courses. Academic courses never see it. On mobile the bottom bar stays flat, no indentation.
- `/student/resources` opens an overview page: a short intro ("We've put together information on companies you can explore, plus insight into compensation for the roles you may be interested in") and two clickable sections:
  - **Companies** — the companies students can explore and target for jobs.
  - **Compensation** — what pay looks like for these roles.
- Each section opens its own page-specific view (in-page, via `?section=companies` / `?section=compensation`, matching the career-readiness `?step=` pattern).
- If the professor hasn't selected anything for the course yet, the page shows a short "No resources added yet" state instead of an empty shell.

## Content model: admin owns a global library, professors pick per course

1. **Global Companies library (admin-managed).** Each company entry: name, short description, roles they hire for, location(s), careers/apply link, and optional attached files (e.g. hiring-guide PDFs) and extra links. Draft fields — to be matched to the layout example you'll attach before implementation finalizes the fields.
2. **Global Compensation library (admin-managed).** Role-based entries (e.g. AI Engineer) showing pay structure (base / bonus / equity / total range), notes, and source links/files. Draft fields — to be matched to the compensation example you'll attach.
3. **Course selection (professor).** In the professor's Soft Skills setup (step 6, employment courses only), a new "Resources" section lists the global library with checkboxes — the professor picks which companies and which compensation entries their students see. Nothing is course-editable; picking only.
4. Files attached to resources upload to the existing course-materials storage bucket; resource rows reference their storage paths.

## Where things change

**Database (one migration, with GRANTs + RLS):**
- `resource_companies` — global entries (name, description, roles text[], locations, apply_url, logo, position).
- `resource_compensation` — global entries (role title, base/bonus/equity/total fields as text ranges, notes, position).
- `resource_files` — attachments for either resource (resource type + id, file name, storage path, kind).
- `resource_links` — external links for either resource (label, url).
- `course_resource_picks` — (course_id, resource_type, resource_id) unique; what a professor has enabled.
- RLS: admins (is_admin) write the global tables; professors (authenticated, is_course_member) read the global library to pick from; students read picks joined to their active enrollment (is_active_enrollment). Students read files/links only through picked resources. service_role full access.

**Student side:**
- `StudentLayout.tsx`: add the Resources entry with the `sub: true` marker (third sub-item), filtered to employment courses using the course-type hook, alongside the existing Career Readiness / Project Lab visibility filters.
- New `src/pages/student/StudentResources.tsx`: overview + Companies view + Compensation view; new hooks `useCourseResources` (picks + details, cached like the other student hooks).
- Route `/student/resources` in `App.tsx` inside the student layout.

**Professor side:**
- `SoftSkillsSetup.tsx`: new "Resources" section (employment courses only) with a checkbox list of global companies and compensation entries, plus a live count of what's selected.

**Admin portal:**
- New "Resources" tab in the admin area: create/edit/delete global companies and compensation entries, attach files and links, reorder.

## Decisions recorded

- Tab is shown to every skilling course; an unpicked course sees a friendly empty state (not hidden like Career Readiness/Project Lab).
- Company card and compensation fields are drafts; the exact fields follow the screenshots/examples you'll attach, applied during implementation.
- Content is global (same library for all skilling courses); per-course control is selection only.
