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

1. **Global Companies library (admin-managed), styled after your first screenshot.** The Companies view is a responsive grid of dark, clickable company cards: letter/color logo tile, tier badge (Tier-1 / Mid-tier / Startup), pay range (e.g. ₹45–90 LPA), and role tags (SDE, ML, DS…). Filter pills at the top — All / Tier-1 / Mid-tier / Startup — narrow the grid. Clicking a card opens the company detail view with: about the company, interview format (e.g. "OA + 2 coding rounds + system design + behavioral"), what they look for / focus areas, DSA difficulty rating (out of 4), pay range, locations, careers link, and attached files.
2. **Seed content from reputable sources.** The admin library is pre-seeded with entries from the DSA Interview Matrix reference you attached (Google, Meta, Amazon, Microsoft, Uber, Atlassian, Adobe, Infosys, TCS, Salesforce, Zoho, Wipro, etc. — difficulty, focus areas, interview patterns) plus other reputable public sources; the admin can edit everything afterward.
3. **Global Compensation library (admin-managed).** Role-based entries (e.g. SDE, ML Engineer, Data Scientist) showing pay structure (base / bonus / equity / total range), notes, and source links/files. The per-company LPA ranges shown on company cards come from each company's entry. Exact fields follow the compensation example you'll attach.
4. **Course selection (professor).** In the professor's Soft Skills setup (step 6, employment courses only), a new "Resources" section lists the global library with checkboxes — the professor picks which companies and which compensation entries their students see. Nothing is course-editable; picking only.
5. Files attached to resources upload to the existing course-materials storage bucket; resource rows reference their storage paths.

## Where things change

**Database (one migration, with GRANTs + RLS):**
- `resource_companies` — global entries (name, description, tier tier1|mid_tier|startup, roles text[], pay_range text, interview_format text, focus_areas text, dsa_difficulty numeric, locations, apply_url, logo_color, position).
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
- Company card and detail fields follow the two reference screenshots you attached (grid of tier-badged cards + interview-matrix fields). Compensation fields remain drafts until your compensation example arrives; they'll be easy to adjust.
- Content is global (same library for all skilling courses); per-course control is selection only.
