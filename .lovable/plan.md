## Redesign "What to Do Next" section on `/student/home`

Match the reference screenshot (excluding all XP elements).

### Header
- Card header shows a small circular badge with a **Compass** icon (indigo tint) next to the title "**What to do next**" (lowercase 'to do').
- Remove the current `Sparkles` icon.
- No right-side "Earn XP with every step" text (excluded per user).

### Action rows
Each row shows:
- **Left**: rounded-square colored icon tile (tinted background matching the row's category color).
- **Middle**:
  - A small uppercase **category label** in the category color (e.g. STRENGTHEN, START THIS WEEK, PRACTICE, REVIEW, DIAGNOSTIC, HEADS UP).
  - **Bold title** below it.
  - Muted **description** below title.
- **Right**: only a chevron/arrow (`ArrowRight`). No XP badge.

### Category derivation
Extend `NextAction` type with a `category` field. Assign in the rules already in `StudentHome.tsx` (lines 404–521):
- Rule 1 (no lesson plan) → `HEADS UP` (slate/muted)
- Rule 2 (diagnostic) → `DIAGNOSTIC` (indigo)
- Rule 3 (this week's quiz) → `THIS WEEK'S QUIZ` (indigo)
- Rule 4 (weakest concept "Strengthen: …") → `STRENGTHEN` (indigo); strip the "Strengthen: " prefix from title.
- Rule 5 (unexplored current-week concept "Start this week: …") → `START THIS WEEK` (indigo); strip "Start this week: " prefix.
- Rule 6 (missed earlier quiz "Catch up …") → `REVIEW` (indigo)
- Rule 7 (Practice Exam) → `PRACTICE` (amber)
- Rule 8 / fallback (caught up, open chat) → `EXPLORE` (indigo)
- Exam-week Practice Exam → `PRACTICE` (amber)

Two color families only, to match the screenshot:
- **Indigo**: category text `text-primary`, icon tile `bg-primary/10 text-primary`.
- **Amber** (for PRACTICE): category text `text-amber-600 dark:text-amber-500`, icon tile `bg-amber-500/10 text-amber-600 dark:text-amber-500`.

### Tile styling
- Larger padding (`p-4`), `rounded-xl`, `border`, hover `bg-muted/40`, gap-4.
- Icon tile: `h-11 w-11 rounded-xl` (was `h-8 w-8`).
- Category label: `text-[11px] font-semibold tracking-wider uppercase`.
- Title: `text-[15px] font-semibold`.
- Description: `text-sm text-muted-foreground`.
- Right chevron only (no XP).

### Scope
- Only edits `src/pages/student/StudentHome.tsx`:
  - Lines 380–521 (add `category` to actions).
  - Lines 570–607 (card header + row rendering).
- Import `Compass` from `lucide-react`.
- No backend, no data-model, no other files.
