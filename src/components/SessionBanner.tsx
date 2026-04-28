import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { LogOut } from "lucide-react";

export default function SessionBanner() {
  const { user, loading, signOut } = useAuth();
  const navigate = useNavigate();
  const [role, setRole] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!user) {
      setRole(null);
      return;
    }
    supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled) return;
        const r = (data?.role as string) ?? (user.user_metadata?.role as string) ?? null;
        setRole(r);
      });
    return () => {
      cancelled = true;
    };
  }, [user]);

  const handleSignOut = async () => {
    await signOut();
    navigate("/", { replace: true });
  };

  return (
    <div className="sticky top-0 z-50 w-full border-b bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="mx-auto flex h-10 max-w-7xl items-center justify-between gap-2 px-4 text-xs">
        <div className="flex items-center gap-2 text-muted-foreground">
          {loading ? (
            <span>Checking session…</span>
          ) : user ? (
            <>
              <span className="h-2 w-2 rounded-full bg-emerald-500" aria-hidden />
              <span>
                Signed in as <span className="font-medium text-foreground">{user.email}</span>
              </span>
              {role && (
                <Badge variant="secondary" className="capitalize">
                  {role}
                </Badge>
              )}
            </>
          ) : (
            <>
              <span className="h-2 w-2 rounded-full bg-muted-foreground/40" aria-hidden />
              <span>Signed out</span>
            </>
          )}
        </div>
        {user && (
          <Button size="sm" variant="ghost" className="h-7 gap-1 px-2" onClick={handleSignOut}>
            <LogOut className="h-3.5 w-3.5" />
            Sign out
          </Button>
        )}
      </div>
    </div>
  );
}
