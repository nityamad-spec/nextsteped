# Drag and drop topics between weeks (Lesson Plan)

Make "Topics Covered" cards on the lesson plan step draggable — reorder within a week and move across weeks — with exam weeks blocked as drop targets. Changes auto-save to the draft; students only see them after re-publishing.

## What changes for you

- Each topic card gets a visible drag handle on the left. Grab it and drag.
- Drop a topic anywhere in another expanded week's topic list to move it, or onto a collapsed week's header row to append it to that week.
- Drop above/below other topics inside the same week to change teaching order.
- Exam weeks (midterm/final) reject drops and show a "not allowed" state with a short tooltip explaining why.
- While dragging, a floating preview of the card follows the cursor and the target list shows a placeholder gap.
- After a successful move, a toast confirms "Moved <topic> to Week N" with an Undo button that reverts the exact move.
- The existing hover "move to week" arrow menu stays as a keyboard/accessibility-friendly fallback and is made always visible instead of hover-only.
- Long lists auto-scroll the page when you drag near the top or bottom edge.
- Each move writes to the draft immediately (same auto-save that already runs when you edit a topic). The unpublished-changes state and the Publish button behave exactly as they do today.

## Technical details

- Add `@dnd-kit/core` and `@dnd-kit/sortable` (already the standard pairing for this stack; nothing comparable is installed today).
- Wrap the weekly breakdown list in `CourseCreation.tsx` with a single `DndContext` using `PointerSensor` (activation distance 6px so clicks on Edit/Delete still work) and `KeyboardSensor`.
- Each week's topic list becomes a `SortableContext` with `verticalListSortingStrategy`, id = `week.id`; each topic card becomes `useSortable` with id = `concept.id`. Register each collapsed week header as a `useDroppable` with the same week id so cross-week drops work without expanding.
- New reducer helper `moveConceptBetweenWeeks(fromWeekId, conceptId, toWeekId, toIndex)` in the same file, replacing the append-only `moveConceptToWeek` internals (the existing dropdown calls it with `toIndex = end`). Reorder within a week uses `arrayMove`.
- Drop guard: in `onDragOver`/`onDragEnd`, reject when the target week has `is_exam_week === true`; surface via `DragOverlay` styling and a destructive toast on attempted drop.
- Undo: keep the pre-move `weeks` snapshot in a ref and restore it from the toast action.
- Persistence: no new save path. `weeks` is already in the draft-persist `useEffect` (localStorage + `draft-plan-v2.json` in storage), so a move auto-saves. Publishing still goes through `upsertPublishedWeeks`.
- Numbering: the numeric badge on each card is index-derived, so it renumbers automatically after a move.

## Risks and constraints

- Nested interactive controls (inline edit inputs, dropdown menus, delete buttons) live inside the draggable card. Mitigated by a dedicated drag handle plus pointer activation distance — dragging is not bound to the whole card.
- The draft persist effect fires on every `weeks` change and uploads a JSON file to storage. Rapid drag operations could cause several uploads in a row; the effect already debounces on a timer, and moves reuse it unchanged.
- Moving a topic does not move that week's resources — resources stay with their original week and may reference a concept that has moved. Called out in the UI copy only; no automatic resource migration.
- Moving topics does not re-run AI generation, so week titles and overviews can drift out of sync with their new topic set. Per-week "Regenerate" already exists for that.
- Concepts moved into a week that is already visible to students will appear as soon as you re-publish; the plan does not block that, per the guardrail choice (exam weeks only).

## Steps

1. Install `@dnd-kit/core` and `@dnd-kit/sortable`.
2. Extract the topic card into a `SortableConceptCard` subcomponent with a drag handle (keeps `CourseCreation.tsx` readable).
3. Add `DndContext` + per-week `SortableContext`, collapsed-week droppables, and `DragOverlay`.
4. Implement `moveConceptBetweenWeeks` / in-week reorder, exam-week guard, and undo toast.
5. Make the existing move dropdown always visible and route it through the new helper.
6. Verify in the browser: reorder in-week, cross-week move (expanded and collapsed target), exam-week rejection, undo, and that a reload restores the moved layout from the draft.
