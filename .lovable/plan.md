Plan: Add a "What you'll learn" subsection under the Mission column for the Jail Breaking lab only.

Current state

- `src/pages/student/StudentProjectLab.tsx` defines a `Lab` type with `mission`, `caution`, and `steps`.
- The Jail Breaking lab (index "01") currently shows only the mission paragraph md caution in the left Mission column.

Changes

1. Extend the `Lab` type with an optional `learnings` array of strings.
2. Add the three specified learning outcomes to the Jail Breaking lab data:
  1. Prompt Injection attacks – manipulating instructions to bypass model restrictions.
  2. Sensitive data exposure – getting the model to reveal hidden information.
  3. Context manipulation – altering how the model interprets or applies rules.
3. Render `learnings` in the Mission column when present, using a "What you'll learn" subheading and an ordered list to preserve the numbering.
4. Keep existing styling consistent with the Mission section (uppercase eyebrow label, muted text).

R8

- Should the numbering be preserved as 1/2/3
- Do you want the `learnings` field reusable for future labs