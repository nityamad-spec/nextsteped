## Goal
Remove the privacy notice banner that reads:
> "Your data is private & anonymized. Your professor can only see aggregate class trends — never your individual chats, quiz answers, or performance data."

from the `/student/home` page.

## Current state
The notice is rendered in `src/pages/student/StudentHome.tsx` at lines 580–589 inside a `<motion.div>` wrapper with a `ShieldCheck` icon and styled container.

## Proposed changes
1. **Delete the notice block** (lines 580–589) from `StudentHome.tsx`.
2. **Clean up imports**: `ShieldCheck` is imported on line 4 and used only by this notice. Remove it if no other usage remains.
3. **Verify no other references** to the removed text or `ShieldCheck` in this file.
4. **Run typecheck/build** to confirm the change compiles cleanly.

## Risks / considerations
- Removing the notice is purely presentational; no data, routing, or backend logic changes.
- If `ShieldCheck` is used elsewhere in the file, it must stay. I will verify before deleting.
- The surrounding `mb-5` margin on the notice block will disappear, which may slightly tighten spacing below the welcome header. This is expected and acceptable for a simple removal.

## Verification
- Visual check of `/student/home` preview to confirm the banner is gone.
- Build/typecheck passes.

No open questions — the request is clear. Approve to proceed.