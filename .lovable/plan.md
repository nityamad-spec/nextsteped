

## Plan: Enforce Single-Role-Per-Email and Role-Aware Auth Flow

### Problem
Currently, a user can sign up as both student and professor. The role is determined by which landing page button they click, not enforced in the database. Sign-in doesn't check if the user is logging in with the correct role.

### Changes

#### 1. Sign-Up: Store role in user metadata
**File: `src/contexts/AuthContext.tsx`**
- Pass the `role` parameter to `signUp` and store it in `user_metadata` alongside `name`.

#### 2. Auth page: Pass role through sign-up
**File: `src/pages/Auth.tsx`**
- Pass the `role` (from URL param) to `signUp(email, password, name, role)`.
- On **sign-in**, after successful authentication, check the user's profile in the `profiles` table to get their stored role. If a profile exists:
  - If the profile role doesn't match the URL role parameter, show an error: "This account is registered as a [role]. Please sign in from the correct page." and sign them out.
  - If it matches, navigate to the correct dashboard.
- If no profile exists yet (new user who verified email), check `user_metadata.role` and navigate accordingly.

#### 3. Auth redirect: Role-aware routing for already-logged-in users
**File: `src/App.tsx` (`AuthRedirect` component)**
- When a logged-in user visits `/auth`, check their profile role from the database and redirect to the correct dashboard (not based on URL param).
- If no profile yet, use `user_metadata.role` to route them.

#### 4. Landing page: If already logged in, route by stored role
**File: `src/pages/Landing.tsx`**
- When a logged-in user clicks a role button, check their profile role first. If they have a profile with a different role, show a toast error instead of navigating.

#### 5. Sign-out: Already handled
Both layouts call `signOut()` + `resetAll()` + `navigate("/")` which returns to the landing page. This is correct.

### Technical Details

- Role enforcement is done at the application level by checking the `profiles.role` column after sign-in.
- No new database tables or migrations needed -- the `profiles` table already has a `role` column.
- For users who have signed up but not yet created a profile, `user_metadata.role` (set during sign-up) serves as the role source.
- The `signUp` function signature changes from `(email, password, name)` to `(email, password, name, role)`.

### Files Modified
1. `src/contexts/AuthContext.tsx` -- add role param to signUp
2. `src/pages/Auth.tsx` -- role-aware sign-in validation and sign-up
3. `src/App.tsx` -- update AuthRedirect to check profile role
4. `src/pages/Landing.tsx` -- prevent role switching for logged-in users

