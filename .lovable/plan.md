# Fix: Total Weeks input rejects typed digits

## Root cause

In `src/pages/teacher/CourseCreation.tsx`, the Total Weeks `<Input type="number">` (lines ~972–991, and a duplicate at ~1275–1297) only updates state when the parsed value is **already** within `4–24`:

```ts
if (Number.isFinite(v) && v >= 4 && v <= 24) {
  setTotalWeeks(v);
  ...
} else if (e.target.value === "") {
  setTotalWeeks(null);
}
```

When the user starts typing "16", the first keystroke produces `"1"` → fails the `>= 4` check → state is never updated → the input (controlled by `totalWeeks`) snaps back to empty/previous value. Typing "20" fails on the first `"2"` for the same reason. Pasting "16" works because the full value passes the range check in one event.

Midterm/Final selects don't have this problem (they're dropdowns); Classes per Week (min 1) and Duration also have the same "validate-on-each-keystroke" pattern and should be fixed consistently — Classes per Week happens to work for single-digit values but breaks if a user types "10".

## Fix

Relax both Total Weeks `onChange` handlers (and mirror the same fix for Classes per Week and Session Length where the min > 1 or the max is multi-digit) to:

1. Accept any intermediate numeric input — set state to the parsed integer (or `null` if empty) without enforcing the min on each keystroke.
2. Clamp / validate on `onBlur` instead: if the value is below min or above max, snap to the nearest bound (or clear it) and call `persistSchedule` then.
3. Keep the dependent-field reset logic (clearing `midtermWeek` / `finalWeek` when they exceed the new `totalWeeks`) but run it inside the blur handler / when a valid value is committed.

This preserves persistence semantics (we still only write valid values to the DB) while letting the user actually type a number.

## Files

- `src/pages/teacher/CourseCreation.tsx` — update both Total Weeks `<Input>` blocks (~lines 972 and ~1280) and apply the same onChange/onBlur pattern to Classes per Week and Session Length inputs in both schedule cards.

## Out of scope

No backend, schema, or generation-flow changes. Pure input-handling fix.
