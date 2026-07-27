## 1) `/student/learning-path` — restrict "Upcoming" pill to locked units
File: `src/pages/student/StudentLearningPath.tsx` (~lines 267, 295–297).

Current behavior: each unit header renders a status pill — `COMPLETE`, `IN PROGRESS`, or `UPCOMING`. `UPCOMING` fires whenever `dp.day > currentWeek`, so future-but-visible units all get the pill.

Change: only render the status pill when it is meaningfully different from the default in-progress state — i.e., render it for `complete` and `upcoming`, and skip it for `in_progress`. `UPCOMING` will then only appear on units that are locked / not yet reached (the same units that already show the Lock icon in the avatar). No logic change to `status` itself.

```tsx
{status !== "in_progress" && (
  <span className={`text-[10px] ... ${statusStyles}`}>{statusLabel}</span>
)}
```

## 2) `/student/chat` — enlarge and lift the input (study mode)
File: `src/pages/student/AIChat.tsx` (~lines 1509–1530).

Current: single-line `<Input>` in a `flex gap-2` row inside a `border-t p-4` footer glued to the bottom.

Changes (only when `mode === "learning"`):
- Replace `<Input>` with an auto-resizing `<Textarea>` (`min-h-[64px]`, `max-h-[200px]`, `resize-none`, `Enter` sends, `Shift+Enter` newline).
- Widen: keep `flex-1` (already page-width) and remove the tight `p-4` → use `px-4 md:px-6 pt-4` with bottom padding `pb-8 md:pb-10` so the composer sits noticeably above the bottom edge.
- Send button: move to bottom-right of the textarea (`items-end` on the flex row) so the taller textarea reads as the primary surface.

Exam mode keeps the current compact `<Input>` layout unchanged (chat is disabled there).

## Scope
Frontend only. Two files. No data/query/backend changes. No new dependencies (`Textarea` is already in `@/components/ui/textarea`).

## Assumption to confirm on approval
For #1, "UPCOMING only when locked" is interpreted as: hide the pill on the current in-progress unit and only show it on future/locked units (which already show a Lock avatar). If you instead meant "add a new distinct 'Locked' pill separate from 'Upcoming'", say so and I'll adjust.
