# Plan: Standardize "Your path" and unit name titles on /student/learning-path

## Goal
Make the "Your path" rail-card title and the open unit's name in the detail panel use the same font, size, and weight as the standardized main section card titles.

## Changes

### 1. `src/components/student/UnitPathRail.tsx`
Update the rail-card title:
```
Your path
```
Change its classes from `text-sm font-semibold` to `font-heading text-xl font-semibold`.
Keep the element as a paragraph and preserve the surrounding flex layout.

### 2. `src/components/student/UnitDetailPanel.tsx`
Update the unit-name heading:
```
<h2 className="truncate font-heading text-lg font-bold md:text-xl">{topic}</h2>
```
Change its classes to `font-heading text-xl font-semibold` so it matches "Your path" and the other standardized card titles.
Keep the `<h2>` element and the `truncate` class.

## Verification
- Run `npx tsgo --noEmit -p tsconfig.json` to confirm no type errors.
- Open `/student/learning-path` in the preview and confirm both "Your path" and the selected unit name appear at the same size, heading font, and semibold weight.

## Notes
- No database or backend changes.
- No behavior changes; only typography updates.
