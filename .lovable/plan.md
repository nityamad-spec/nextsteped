

## Multi-Feature Update Plan

### 1. Upload Tags Cleanup
**File:** `src/pages/teacher/CourseCreation.tsx`
- Line 492: Change `(Internal)` to `(Optional)`
- Line 527: Change `(Student-Facing · Optional)` to `(Optional)`

### 2. Forgot Password Feature
**Files:** New `src/pages/ResetPassword.tsx`, modified `src/pages/Auth.tsx`, `src/App.tsx`
- Add "Forgot password?" link below the password field on the Auth page
- On click, show an inline form that calls `supabase.auth.resetPasswordForEmail(email, { redirectTo: origin + '/reset-password' })`
- Create a `/reset-password` page that detects `type=recovery` in the URL hash and lets users set a new password via `supabase.auth.updateUser({ password })`
- Register the `/reset-password` route in App.tsx

### 3. Student/Professor Role Switcher on Auth Page
**File:** `src/pages/Auth.tsx`
- Add a toggle or link near the top of the auth card (below the role label) that says "Sign in as Professor instead" / "Sign in as Student instead"
- Clicking it navigates to `/auth?role=teacher` or `/auth?role=student` (updates the URL param), which already drives the `role` variable

### 4. Teaching Plan UI Overhaul (both `TeachingPlan.tsx` and `CourseCreation.tsx` plan phase)

**4a. Remove summary cards from the top**
- Delete the 3-card grid (Total Weightage, Total Days, Locked Days) from both files
- Keep the weightage editable per-day inside the expanded day card

**4b. Remove separate Resources section — integrate into lesson flow**
- Eliminate the standalone "Resources & Materials" section with its own heading
- Instead, render resources inline within the lesson description as part of the lesson flow
- Each resource appears as a compact inline card at the relevant point in the lesson (after description text)
- Resources show: icon, title, description in a clean single-color subtle card style

**4c. Simplify visual styling**
- Remove the per-resource-type color coding (`typeColors` map) — use a single consistent neutral card style for all resources
- Reduce font size variations — use consistent `text-sm` throughout
- Remove provenance badges (From uploads, From web, etc.)

**4d. Make AI Suggest button bigger and more prominent**
- Change from `size="sm"` outline button to a larger `size="lg"` primary-styled button
- Place it prominently at the top of the expanded day content, full-width or near-full-width

**4e. Lock/Unlock UX — make student visibility clear**
- When locked (hidden from students): show a red/muted badge "Hidden from students" with EyeOff icon
- When unlocked (visible to students): show a green badge "Visible to students" with Eye icon
- Replace the Lock/Unlock icons with Eye/EyeOff for clearer semantics

**4f. Highlight AI-suggested additions vs existing content**
- Track which resources were added by the latest AI suggestion using a `isNew` flag on the Resource type
- New AI-added resources get a subtle left-border highlight (e.g., `border-l-4 border-primary`) and a small "AI suggested" badge
- Clear the `isNew` flag on save

**4g. Fix text display — no "**" in rendered content**
- Update `renderDescription` to strip all `**` markdown and render proper HTML headings, collapsible sections, and bulleted lists
- Use Collapsible/Accordion for section headers instead of raw markdown parsing

### Files Modified
- `src/pages/Auth.tsx` — forgot password link, role switcher
- `src/pages/ResetPassword.tsx` — new file for password reset
- `src/App.tsx` — add /reset-password route
- `src/pages/teacher/CourseCreation.tsx` — tag cleanup, plan phase UI overhaul
- `src/pages/teacher/TeachingPlan.tsx` — same UI overhaul as CourseCreation plan phase

### Technical Notes
- The `Resource` type gets an optional `isNew?: boolean` field for AI suggestion tracking
- The `renderDescription` function is rewritten to parse markdown-like content into proper React elements using Collapsible components
- Lock/unlock toast messages updated to reference "student visibility" instead of "chatbot"
- No database changes needed

