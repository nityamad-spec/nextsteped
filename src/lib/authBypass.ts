// TEMPORARY: set to false to restore normal auth gating across the app.
// When true:
//  - ProtectedRoute renders children without checking session
//  - AuthContext auto-signs-in as the seeded admin so RLS-protected DB
//    queries still work (auth.uid() resolves to the admin id)
export const AUTH_BYPASS = true;

export const BYPASS_ADMIN_EMAIL = "admin@nextstep.ai";
export const BYPASS_ADMIN_PASSWORD = "admin@3465";
