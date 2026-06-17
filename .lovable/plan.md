On `/student/home`, the lesson plan loads each resource's `url` (StudentHome.tsx line 257) but the rendering block (lines 621-632) never uses it — resources are wrapped in a plain `<div>`, so titles look like text and aren't clickable.

Fix
- In `src/pages/student/StudentHome.tsx`, change the per-resource wrapper to render as an `<a>` (with `target="_blank"`, `rel="noopener noreferrer"`, hover styles) when `r.url` is present, and keep the existing `<div>` when it isn't.
- Keep the icon, title, action, and type badge layout unchanged.
- No backend, schema, or teacher-side changes.

Verification
- Reload `/student/home`, expand a week that has resources with URLs (as shown on the professor side), and confirm each resource title is clickable and opens the link in a new tab.