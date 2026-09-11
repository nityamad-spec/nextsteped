# Career Readiness & Project Lab as Learning Path sub-items

## What changes

1. **Left menu grouping** — Career Readiness and Project Lab move directly under Learning Path, indented as sub-items so it reads as one section:

```text
Home
Learning Path
  Career Readiness
  Project Lab
Teaching Assistant
Feedback
```

They keep their current visibility rules: Career Readiness appears only when the course has published career-readiness modules, Project Lab only when the course has published labs. On mobile the bottom bar stays flat (no indentation there).

2. **Stage 4 links to Project Lab** — On the Learning Path, Stage 4 Capstone Project no longer lists each capstone. It shows one card with a short line and a single button that opens the Project Lab tab, matching how Stage 3 links out to Career Readiness. If nothing is published yet, the existing "not yet published" message stays.

## Technical notes

- `src/layouts/StudentLayout.tsx`: give nav entries an optional `parent` marker and render the two sub-items with extra left padding / smaller text under Learning Path in the desktop sidebar; keep the existing filter logic and mobile rendering unchanged.
- `src/pages/student/StudentLearningPath.tsx`: replace the `projectLabs.map(...)` block in `renderStage` for the capstone stage with a single link card navigating to `/student/project-lab`.
- No database, schema, or academic-pathway changes.
