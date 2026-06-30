## Why the filter isn't showing

In `src/components/admin/CourseProfileContent.tsx` the university `<Select>` is rendered only when:

```ts
const showUniSelect = uniOptions.length > 1;
```

`uniOptions` is built from the enrolled students' `profiles.university_id`. So the dropdown is hidden whenever a course's roster contains 0 or 1 distinct universities — which is the case on your teacher analytics view. (On `/admin/courses` you've been seeing it because those courses happen to span multiple universities.)

## Change

Always render the university filter, even when there's only one option (or none).

### Edits in `src/components/admin/CourseProfileContent.tsx`

1. Remove the `showUniSelect` gate — render the `University:` row unconditionally inside the analytics body.
2. Keep the existing options logic; when `uniOptions.length === 0` (no enrolled student has a university set), the dropdown will simply show `All universities (0)` plus a disabled "No data" hint — still visible so teachers know the control exists.
3. Keep the "Showing N of M students" helper text behavior unchanged (only when a non-`ALL` value is picked).
4. No changes to data fetching, filtering math, or the sub-dialogs.

### Realtime

Confirmed: **the analytics on this page are not real-time.** Data is fetched once per course/filter change via a one-shot query in `CourseProfileContent`. Per your answer, we'll leave it as one-shot (no subscriptions, no polling). A page reload (or switching the university filter / course) is required to pick up new enrollments, submissions, or mastery updates.

### Files touched

- `src/components/admin/CourseProfileContent.tsx` (single conditional removed; small JSX adjustment)

No schema, RLS, edge function, or routing changes.
