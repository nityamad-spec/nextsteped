

## Plan: Remove Legacy Redirect Routes

Remove the two `<Navigate>` redirect routes for `/teacher/setup/course-creation` and `/teacher/setup/syllabus` from `src/App.tsx` since `/teacher/setup/lesson-plan` is now the canonical route and no code references the old paths.

### File Modified
`src/App.tsx` — delete these two lines:
```tsx
<Route path="/teacher/setup/syllabus" element={<Navigate to="/teacher/setup/lesson-plan" replace />} />
<Route path="/teacher/setup/course-creation" element={<Navigate to="/teacher/setup/lesson-plan" replace />} />
```

