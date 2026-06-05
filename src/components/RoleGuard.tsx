import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { AUTH_BYPASS } from "@/lib/authBypass";

type Role = "student" | "teacher" | "admin";

// Module-level cache so navigating between guarded routes doesn't refetch.
const roleCache = new Map<string, Role | null>();

// Clear the cache on sign-out so a re-login picks up fresh role state.
supabase.auth.onAuthStateChange((event) => {
  if (event === "SIGNED_OUT") roleCache.clear();
});

const HOME_FOR: Record<Role, string> = {
  teacher: "/teacher",
  admin: "/admin/dashboard",
  student: "/student",
};

interface RoleGuardProps {
  allow: Role[];
  children: React.ReactNode;
  /** If true, unauthenticated users render children instead of being redirected.
   * Used for /student/onboarding and /student/verify-email which must be reachable mid-signup. */
  allowAnonymous?: boolean;
}

export default function RoleGuard({ allow, children, allowAnonymous = false }: RoleGuardProps) {
  const { user, loading: authLoading } = useAuth();
  const [resolved, setResolved] = useState<Role | null | undefined>(() =>
    user ? roleCache.get(user.id) : undefined,
  );

  useEffect(() => {
    if (AUTH_BYPASS) return;
    if (authLoading) return;
    if (!user) {
      setResolved(undefined);
      return;
    }
    if (roleCache.has(user.id)) {
      setResolved(roleCache.get(user.id) ?? null);
      return;
    }
    let cancelled = false;
    supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled) return;
        const role = (data?.role as Role | undefined)
          ?? (user.user_metadata?.role as Role | undefined)
          ?? null;
        roleCache.set(user.id, role);
        setResolved(role);
      });
    return () => { cancelled = true; };
  }, [user, authLoading]);

  if (AUTH_BYPASS) return <>{children}</>;

  if (authLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="text-muted-foreground">Loading...</div>
      </div>
    );
  }

  if (!user) {
    if (allowAnonymous) return <>{children}</>;
    return <Navigate to="/auth" replace />;
  }

  if (resolved === undefined) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="text-muted-foreground">Loading...</div>
      </div>
    );
  }

  if (resolved && allow.includes(resolved)) return <>{children}</>;

  if (resolved && HOME_FOR[resolved]) {
    return <Navigate to={HOME_FOR[resolved]} replace />;
  }
  // Unknown role — bounce to /auth so the user can pick one explicitly.
  return <Navigate to="/auth" replace />;
}

/** Allow other components (e.g. AuthRedirect) to seed the role cache after a lookup. */
export function seedRoleCache(userId: string, role: Role | null) {
  roleCache.set(userId, role);
}
