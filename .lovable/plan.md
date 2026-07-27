## Plan: Add Learning Path and Project Lab tabs to student navigation

### Goal

Add two new tabs to the left-side student navigation bar:

1. **Learning Path** — directly underneath **Home**
2. **Project Lab** — directly underneath **Teaching Assistant**

### Decisions confirmed

- **Learning Path** becomes a new dedicated page (`/student/learning-path`).
- The existing Learning Path section on `/student/home` will be removed.
- **Project Lab** will be a placeholder / Coming Soon page.
- New tabs will appear on both desktop sidebar and mobile bottom navigation.

### Proposed defaults (review/override)

- **Icons**: `Route` for Learning Path, `FlaskConical` for Project Lab.
- **Project Lab placeholder text**: "Project Lab — hands-on projects are coming soon."

### Implementation steps

#### 1. Create `src/pages/student/StudentLearningPath.tsx`

- Extract the Learning Path rendering logic from `StudentHome.tsx` (lesson plan loading, week expansion, activity done state, resources, quiz dialogs, diagnostic gate).
- Keep the same data fetching and behavior; move helper constants/types as needed.
- Render inside the existing `StudentLayout` via `<Outlet>`.

#### 2. Create `src/pages/student/StudentProjectLab.tsx`

- New placeholder page using the existing `ComingSoon` component or a simple centered card.
- Route: `/student/project-lab`.

#### 3. Update `src/App.tsx`

- Add imports for `StudentLearningPath` and `StudentProjectLab`.
- Add two new `<Route>` entries under the `/student/*` layout:
  - `/student/learning-path`
  - `/student/project-lab`

#### 4. Update `src/layouts/StudentLayout.tsx`

- Update the `studentNav` array to include the new items in order:
  1. Home (`/student/home`)
  2. Learning Path (`/student/learning-path`)
  3. Teaching Assistant (`/student/chat`)
  4. Project Lab (`/student/project-lab`)
  5. Feedback (`/student/feedback`)
- Import the chosen icons (`Route`, `FlaskConical` by default).
- Both desktop sidebar and mobile bottom nav iterate the same array, so the new tabs appear automatically.

#### 5. Update `src/pages/student/StudentHome.tsx`

- Remove the Learning Path section and all related state/effects that are moving to `StudentLearningPath.tsx`.
- Keep the Home dashboard content: course progress, mastery heatmap, "What to do next", weekly quiz CTA, etc.
- Remove unused imports that were only needed for the Learning Path section.

#### 6. Verify and test

- Run TypeScript typecheck.
- Run the existing test suite (especially `StudentHome.test.tsx`).
- Visually verify desktop sidebar and mobile bottom nav render correctly with 5 items.
- Confirm active-tab highlighting works for the two new routes.

### Risks and considerations

- **Mobile bottom nav crowding**: Adding two tabs brings the total to 5 items. On narrow screens the labels may wrap or feel cramped. We can keep labels short or consider a "More" overflow menu later if needed.
- **State duplication**: Extracting Learning Path from `StudentHome.tsx` must not leave orphaned state or broken quiz dialogs. The `WeeklyQuizDialog` and `DiagnosticGateDialog` usage moves with the section.
- **Route redirects**: Any hardcoded redirects to `/student/home#learning-path` or similar will need updating; a quick search will confirm there are none.
- **Active route matching**: `NavLink` uses `end={false}`, so `/student/learning-path` and `/student/chat` will highlight independently without overlap.

### Open questions for you

1. happy with the default icons (`Route` / `FlaskConical`) and Project Lab placeholder text 
2. Shorten them (e.g., "Path", "Lab") to avoid crowding?
3. On `/student/home` add a card/link pointing students to the new Learning Path page. 