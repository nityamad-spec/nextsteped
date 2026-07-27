# Plan: Redesign "What to do next" on /student/home

## Goal
Update the existing "What to do next" card on `/student/home` to match the visual structure in the attached screenshot: a header with Preview/activity-count badges and a "View full learning path" link, followed by up to three structured activity cards (Quiz, Reading, Continue learning) with category badges, metadata, descriptions, and right-aligned action buttons.

## Scope
UI-only changes in `src/pages/student/StudentHome.tsx`. No backend or data-model changes.

## Detailed changes

### 1. Section header
- Change title from "What to do next" → "What to do today".
- Add subtitle: "Three focused activities based on your course schedule and recent mastery."
- Add a top-row flex layout containing:
  - A "Preview" badge (neutral/secondary variant) linking to `/student/learning-path`.
  - An activity-count badge showing the number of rendered cards (e.g., "3 activities").
  - A "View full learning path →" text/button link on the right, also navigating to `/student/learning-path`.

### 2. Refactor `nextActions` data model
Extend the `NextAction` type so each item carries the fields needed by the new card layout:
- `visualCategory`: `'quiz' | 'reading' | 'continue' | 'practice' | 'heads-up'`
- `badgeLabel`: human category label shown in the card (e.g., "Quiz", "Reading", "Continue learning").
- `badgeTone`: `'neutral' | 'green'` (green for Continue learning, neutral for others).
- `metadata`: short secondary line (e.g., "10 questions · 8–10 min", "12 min", "Unit 2 · Based on your last session").
- `buttonLabel`: dynamic CTA text (e.g., "Start quiz", "Open reading", "Review with TA").
- `buttonVariant`: `'default' | 'outline'`.

### 3. Map existing dynamic actions to visual categories
Keep the existing priority logic, but map each generated action to the new visual category:
- `THIS WEEK'S QUIZ`, `REVIEW` (missed earlier quiz) → **Quiz** card.
- `PRACTICE` (practice exam) → **Quiz** card (or its own category if preferred; treat as quiz-style for layout consistency).
- `DIAGNOSTIC` → **Quiz** card.
- `START THIS WEEK`, `STRENGTHEN`, `EXPLORE` → **Continue learning** card (green badge).
- `HEADS UP` (learning path not published) → single neutral card, no header badges needed.

### 4. Add Reading card
- Derive one Reading card from the current week's `lessonPlan` resources.
- Pick the first resource of type `'reading'` or `'material'` in the current week; fallback to the first resource of any type if no reading exists.
- Metadata: derive a read time from the resource description/title heuristically, or use a fixed fallback (e.g., "~10 min").
- Title: "Read: {resource.title}".
- Description: resource description or a generic prompt.
- Action: navigate to `/student/learning-path`.
- If the current week has no resources, omit the Reading card.

### 5. Quiz metadata
For Quiz cards, use live TA settings:
- Question count: `taSettings.quizNumQuestions || 5`.
- Time limit: `taSettings.quizTimeLimit || 10`.
- Render as: "{count} questions · {time} min".

### 6. Card layout update
Replace the current `<button>` row with a structured card row:
- Left: rounded-square icon container (keep existing color logic, but align with badge tone).
- Middle top: category badge + metadata on the same line.
- Middle: title (semibold) + description (muted).
- Right: action `<Button>` with dynamic label and variant.
- Entire row remains clickable; the button is the primary action target.
- Keep max 3 cards and the existing skeleton loading state, styled to match the new layout.

### 7. Styling guardrails
- Use project design tokens only (`bg-primary`, `text-muted-foreground`, `border`, etc.).
- No hardcoded hex colors.
- Continue-learning badge uses `bg-green-100 text-green-700` or semantic equivalents (`bg-green-500/10 text-green-600`).

## Verification
- Run `tsc --noEmit` and production build.
- Visually verify via Playwright screenshot that the section renders with the new header, three activity cards, and correct navigation links.

## Risks / open items
- Reading-card duration is heuristic/fallback because lesson-plan resources do not currently store a read-time field. If exact durations are required later, a backend field should be added.
- If no current-week resource exists, the Reading card is omitted and the section may show fewer than three cards; this matches the dynamic nature of the existing list.
- The green badge tone is reserved for Continue-learning actions to match the screenshot; other categories remain neutral.