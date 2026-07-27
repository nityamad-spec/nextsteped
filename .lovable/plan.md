
## Goal
Make accent colors on `/student/home` consistent with the app's primary purple.

## Changes

### 1. `src/pages/student/StudentHome.tsx` — "What to do today" icon tiles
Currently icon tiles vary by `badgeTone`/`visualCategory`:
- Green (`bg-green-500/10 text-green-600`) for completed/positive actions
- Muted for "heads-up"
- Primary for default

Update so **all icon tiles use primary purple** (`bg-primary/10 text-primary`), regardless of `isGreen`/`isMuted`. The badge pill next to the title keeps its existing green/muted tone so completion state is still visible via the badge — only the left icon tile turns purple.

### 2. `src/pages/student/StudentHome.tsx` — Concept mastery highlight tiles
- **Strong concept** tile: change from emerald (`border-emerald-500/30 bg-emerald-500/10`) to **darker purple** (`border-primary/40 bg-primary/20`).
- **Needs attention** tile: change from amber (`border-amber-500/30 bg-amber-500/10`) to **lighter purple** (`border-primary/20 bg-primary/5`).

### 3. `src/components/student/AchievementsCard.tsx` — Earned badge fill
- Earned tile: change from emerald (`bg-emerald-500/15 border-emerald-500/30`) to **primary purple** (`bg-primary/15 border-primary/30`).
- Header icon container: change amber (`bg-amber-500/15` + `text-amber-600`) to `bg-primary/15` + `text-primary` for consistency with the purple theme.
- Checklist "done" checkmark in tooltip: change `text-emerald-500` to `text-primary`.
- Unearned tile styling unchanged (stays muted/greyed).

## Out of scope
- `ConceptMasteryDialog` heatmap tiles (developing = amber, beginner = destructive) — these encode the mastery scale and were not called out.
- Weekly quiz "score" green/amber colors elsewhere.
