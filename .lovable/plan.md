Add a native hover tooltip to confirmed concept names on `/teacher/setup/concept-review` so the full `concept_code` is visible when text is truncated.

Change:
- File: `src/pages/teacher/ConceptReview.tsx`
- Line ~743: wrap the confirmed concept name `<span className="text-sm font-medium truncate">` with a `title` attribute set to `{c.concept_code}`.

Result:
- Long concept names still truncate visually to keep the layout compact.
- Hovering the name shows the browser's default tooltip with the complete text.

No other logic, styling, or data changes.