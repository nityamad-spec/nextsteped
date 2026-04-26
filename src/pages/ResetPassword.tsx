import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Eye, EyeOff, KeyRound } from "lucide-react";

const ResetPassword = () => {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<"recovery" | "invite" | "waiting">("waiting");
  const navigate = useNavigate();

  useEffect(() => {
    // Detect recovery (forgot password) or invite (first-time approved professor)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === "PASSWORD_RECOVERY") {
        setMode("recovery");
        return;
      }
      if (event === "SIGNED_IN" && session?.user) {
        // Check if this user was just invited and needs to set a password
        const { data: profile } = await supabase
          .from("profiles")
          .select("needs_password_setup")
          .eq("id", session.user.id)
          .maybeSingle();
        if (profile?.needs_password_setup) {
          setMode("invite");
        }
      }
    });

    // Also handle case where session already exists on page load
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (session?.user) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("needs_password_setup")
          .eq("id", session.user.id)
          .maybeSingle();
        if (profile?.needs_password_setup) {
          setMode("invite");
        }
      }
    });

    return () => subscription.unsubscribe();
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
    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password });
    if (error) {
      toast.error(error.message);
      setLoading(false);
      return;
    }

    // If this was an invite flow, clear the flag and route them into the app
    if (mode === "invite") {
      const { data: { user } } = await supabase.auth.getUser();
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

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <KeyRound className="h-5 w-5" /> {title}
            </CardTitle>
            <CardDescription>{description}</CardDescription>
          </CardHeader>
          <CardContent>
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
              <Button type="submit" className="w-full" disabled={loading || mode === "waiting"}>
                {loading ? "Saving…" : isInvite ? "Set Password & Continue" : "Update Password"}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default ResetPassword;
