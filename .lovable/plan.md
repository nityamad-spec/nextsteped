## Goal

On the Admin → Courses course profile (the "Enrollment & Diagnostic" strip that shows **Avg diagnostic**), add two new stat tiles:

1. **Active students %** — of students who submitted the diagnostic, the share who then completed at least one weekly quiz OR exam **after** their diagnostic timestamp.
2. **Dormant students %** — of students who submitted the diagnostic, the share who did **nothing further** (no quiz, no exam) after it.

Active% + Dormant% = 100% of diagnostic submitters. Denominator is diagnostic submitters (not enrolled), which matches how "Avg diagnostic" is scoped today.

## Where the change lives

The "Avg diagnostic" tile is rendered by `src/components/CourseAnalyticsView.tsx` (line ~534), which is embedded in `src/components/admin/CourseProfileDialog.tsx` opened from `/admin/courses`. All work is in `CourseAnalyticsView.tsx`. No backend, migration, or edge-function changes.

## Data changes

Extend the two existing fetches in `load()`:

- `diagnostic_results` select → add `created_at` (per-student earliest kept as the diagnostic timestamp).
- `assessment_results` select → add `created_at`, keep existing filter to `mode in ('daily_quiz','exam')` when computing activity (practice does not count per the spec).

No new queries or joins — same round-trip count.

## Stat computation

In the `stats` memo:

```text
diagStudents            = set of student_id in diagnostic_results
diagFirstAt[student_id] = min(created_at) from diagnostic_results

postDiagStudents = { s ∈ diagStudents :
  ∃ r ∈ assessment_results
    where r.student_id = s
      AND r.mode ∈ ('daily_quiz','exam')
      AND r.created_at > diagFirstAt[s] }

activePct  = postDiagStudents.size  / diagStudents.size * 100
dormantPct = 100 - activePct
```

Edge cases:
- `diagStudents.size === 0` → show "—" for both tiles.
- Ties (same-second quiz submission after diagnostic) → counted as active (`>` is strict; if this ever matters we relax to `>=`, but same-second is not realistic in the current flow).
- Practice mode and chat activity do NOT count — spec says "quiz or exam".

New fields on `Stats`:
```ts
activeStudents: number;
dormantStudents: number;
activePct: number | null;
dormantPct: number | null;
activeStudentList: StudentLite[];
dormantStudentList: StudentLite[];
```

## UI changes

In the "Enrollment & Diagnostic" section, add two `Stat` tiles immediately after `Avg diagnostic`:

```text
[ Diagnostic done ] [ Pending diagnostic ] [ Avg diagnostic ] [ Active % ] [ Dormant % ]
```

Both new tiles:
- Label + big value: `fmtPct(activePct)` / `fmtPct(dormantPct)`.
- Subtext: `{count}/{diagnosticSubmitted}`.
- Click-through opens the roster drawer (reusing existing `rosterView` mechanism) with two new views `"active"` and `"dormant"` — same pattern as `"done"` / `"pending"`. Titles: "Active after diagnostic" and "Dormant after diagnostic".

No new components — reuse `Stat` and the roster dialog.

## Out of scope

- No changes to `/admin/courses` table columns (metrics live in the profile dialog, which is what opens from that page).
- No new export column (can be added later if needed).
- Practice-question activity is intentionally excluded.
