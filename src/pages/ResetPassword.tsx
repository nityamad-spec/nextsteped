import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Eye, EyeOff, KeyRound, AlertTriangle } from "lucide-react";

const ResetPassword = () => {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<"recovery" | "invite" | "waiting" | "expired">("waiting");
  const [hasSession, setHasSession] = useState(false);
  const [completed, setCompleted] = useState(false);
  const navigate = useNavigate();

  // Warn (but do NOT auto-sign-out) if the user tries to close the tab without
  // setting a password. Auto-signout-on-unmount was unsafe — under React
  // StrictMode and fast-refresh the cleanup runs while the component is still
  // legitimately mounted, killing the invite session before submit.
  useEffect(() => {
    const beforeUnload = (e: BeforeUnloadEvent) => {
      if (!completed && mode === "invite") {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", beforeUnload);
    return () => window.removeEventListener("beforeunload", beforeUnload);
  }, [completed, mode]);

  useEffect(() => {
    let cancelled = false;

    // 1. Detect recovery/invite directly from the URL hash.
    let hashType: string | null = null;
    try {
      const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
      hashType = hash.get("type");
      if (hashType === "recovery") {
        setMode("recovery");
      } else if (hashType === "invite" || hashType === "signup") {
        setMode("invite");
      }
    } catch {
      /* ignore */
    }

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (cancelled) return;
      if (session?.user) setHasSession(true);
      if (event === "PASSWORD_RECOVERY") {
        setMode("recovery");
        return;
      }
      if (event === "SIGNED_IN" && session?.user) {
        const email = session.user.email?.toLowerCase();
        if (email) {
          const { data: pending } = await supabase
            .from("pending_signups")
            .select("id")
            .eq("email", email)
            .is("consumed_at", null)
            .maybeSingle();
          if (cancelled) return;
          if (pending) {
            setMode("invite");
            return;
          }
        }
        const { data: profile } = await supabase
          .from("profiles")
          .select("needs_password_setup")
          .eq("id", session.user.id)
          .maybeSingle();
        if (cancelled) return;
        if (profile?.needs_password_setup) {
          setMode("invite");
          return;
        }
        setMode((prev) => (prev === "waiting" ? "recovery" : prev));
      }
    });

    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (cancelled) return;
      if (!session?.user) return;
      setHasSession(true);
      const email = session.user.email?.toLowerCase();
      if (email) {
        const { data: pending } = await supabase
          .from("pending_signups")
          .select("id")
          .eq("email", email)
          .is("consumed_at", null)
          .maybeSingle();
        if (cancelled) return;
        if (pending) {
          setMode("invite");
          return;
        }
      }
      const { data: profile } = await supabase
        .from("profiles")
        .select("needs_password_setup")
        .eq("id", session.user.id)
        .maybeSingle();
      if (cancelled) return;
      if (profile?.needs_password_setup) {
        setMode("invite");
        return;
      }
      setMode((prev) => (prev === "waiting" ? "recovery" : prev));
    });

    // Safety net: after 2s, if we still have no session AND no recovery/invite
    // hash, treat the link as expired/invalid. Otherwise, if a session exists
    // but mode is still 'waiting', flip to recovery so the form is usable.
    const safetyTimer = window.setTimeout(async () => {
      if (cancelled) return;
      const { data: { session } } = await supabase.auth.getSession();
      if (cancelled) return;
      const hasHash = hashType === "recovery" || hashType === "invite" || hashType === "signup";
      if (!session?.user && !hasHash) {
        setMode("expired");
      } else if (session?.user) {
        setHasSession(true);
        setMode((prev) => (prev === "waiting" ? "recovery" : prev));
      }
    }, 2000);

    return () => {
      cancelled = true;
      subscription.unsubscribe();
      window.clearTimeout(safetyTimer);
    };
  }, []);


  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirmPassword) {
      toast.error("Passwords do not match");
      return;
    }
    if (password.length < 6) {
      toast.error("Password must be at least 6 characters");
      return;
    }

    // Guard: never call updateUser without a session — it produces the
    // "Auth session missing!" error.
    const { data: { session: preCheckSession } } = await supabase.auth.getSession();
    if (!preCheckSession?.user) {
      toast.error("Your reset link has expired. Please request a new one.");
      setMode("expired");
      return;
    }

    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password });
    if (error) {
      const msg = error.message?.toLowerCase() ?? "";
      if (msg.includes("auth session missing") || msg.includes("session")) {
        toast.error("Your reset link has expired. Please request a new one.");
        setMode("expired");
      } else {
        toast.error(error.message);
      }
      setLoading(false);
      return;
    }
    setCompleted(true);

    const { data: { user } } = await supabase.auth.getUser();
    const email = user?.email?.toLowerCase();
    if (user && email) {
      const { data: pending } = await supabase
        .from("pending_signups")
        .select("id")
        .eq("email", email)
        .is("consumed_at", null)
        .maybeSingle();

      if (pending) {
        try {
          const { data, error: completeErr } = await supabase.functions.invoke(
            "complete-student-signup",
            { body: {} },
          );
          if (completeErr) throw completeErr;
          const courseId = (data as any)?.course_id;
          toast.success("Account ready! Let's get started.");
          navigate(courseId ? `/student/diagnostic?course=${courseId}` : "/student");
          setLoading(false);
          return;
        } catch (err: any) {
          toast.error(err.message || "Couldn't finish setting up your account.");
          setLoading(false);
          return;
        }
      }
    }

    if (mode === "invite") {
      if (user) {
        await supabase
          .from("profiles")
          .update({ needs_password_setup: false })
          .eq("id", user.id);
      }
      toast.success("Password set! Welcome to NextStep.");
      navigate("/teacher");
    } else {
      toast.success("Password updated successfully!");
      navigate("/auth");
    }
    setLoading(false);
  };

  const isInvite = mode === "invite";
  const isExpired = mode === "expired";
  const title = isInvite ? "Set Your Password" : "Reset Password";
  const subtitle = isInvite
    ? "Welcome! Choose a password to finish setting up your account."
    : "Set your new password";
  const description =
    mode === "waiting"
      ? "Waiting for password recovery link verification…"
      : isInvite
        ? "Pick a password you'll remember — you'll use it every time you log in."
        : "Enter your new password below.";

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <h1 className="font-heading text-4xl font-bold tracking-tight text-foreground">
            Next<span className="text-primary">Step</span>
          </h1>
          <p className="mt-2 text-muted-foreground">{subtitle}</p>
        </div>

        {isExpired ? (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-amber-500" /> Link expired
              </CardTitle>
              <CardDescription>
                This password reset link is no longer valid, or you opened this page directly.
                Please request a fresh link to set your password.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button className="w-full" onClick={() => navigate("/auth?role=student")}>
                Go to sign in
              </Button>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <KeyRound className="h-5 w-5" /> {title}
              </CardTitle>
              <CardDescription>{description}</CardDescription>
            </CardHeader>
            <CardContent>
              {isInvite && (
                <div className="mb-4 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
                  You must set a password here before you can sign in. If you close this page without setting one, you'll need to request a new link.
                </div>
              )}
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="new-password">{isInvite ? "Password" : "New Password"}</Label>
                  <div className="relative">
                    <Input
                      id="new-password"
                      type={showPassword ? "text" : "password"}
                      placeholder="••••••••"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      minLength={6}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="confirm-password">Confirm Password</Label>
                  <Input
                    id="confirm-password"
                    type={showPassword ? "text" : "password"}
                    placeholder="••••••••"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    required
                    minLength={6}
                  />
                </div>
                <Button
                  type="submit"
                  className="w-full"
                  disabled={loading || mode === "waiting" || !hasSession}
                >
                  {loading
                    ? "Saving…"
                    : !hasSession && mode !== "waiting"
                      ? "Waiting for session…"
                      : isInvite
                        ? "Set Password & Continue"
                        : "Update Password"}
                </Button>
              </form>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
};

export default ResetPassword;
