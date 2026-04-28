## Goal

Add a thin sticky header banner that's visible across the app showing auth status (Signed in / Signed out), the user's email, their role, and a Sign out button when signed in.

## Changes

**1. New `src/components/SessionBanner.tsx`**
- Reads `user` and `loading` from `useAuth()`.
- When signed in, fetches `role` from `profiles` table by user id (via `useEffect` on user change). Falls back to user metadata if no profile row.
- Renders a slim sticky bar at top: `sticky top-0 z-50`, semantic `bg-background/80 backdrop-blur` with `border-b`.
- Left side:
  - Loading: "Checking session…"
  - Signed in: green dot + "Signed in as <email>" + role `Badge` (capitalized: student / teacher / admin)
  - Signed out: muted dot + "Signed out"
- Right side (only when signed in): ghost `Button` with `LogOut` icon → calls `signOut()` then `navigate("/", { replace: true })`.

**2. `src/App.tsx`**
- Import `SessionBanner`.
- Mount it inside `<BrowserRouter>` directly above `<Routes>` so it appears on every route (including Landing, auth, dashboards) and can use `useNavigate`.

## Notes

- Uses semantic design tokens (`bg-background`, `text-muted-foreground`, `border-b`) — no hardcoded colors except the small status dot.
- Banner is 40px tall (`h-10`) and sticky so it doesn't disrupt existing layouts; existing pages remain scrollable underneath.
- No backend changes; reads existing `profiles.role` column already used elsewhere (`useStudentStatus`).