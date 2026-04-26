import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { motion } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Mail, ArrowLeft, RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

const VerifyEmail = () => {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const email = params.get("email") || "";
  const [resending, setResending] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  // Cooldown ticker for the resend button
  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown(c => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  const resend = async () => {
    if (!email || cooldown > 0) return;
    setResending(true);
    try {
      // Re-trigger the invite via the staging edge function — it'll fall back
      // to a recovery link if the user already exists.
      const { error } = await supabase.functions.invoke("student-pending-signup", {
        body: { resend: true, email, origin: window.location.origin },
      });
      if (error) throw error;
      toast.success("Verification email resent. Check your inbox.");
      setCooldown(30);
    } catch (err: any) {
      // The pending-signup function requires the full payload, so the resend
      // path will likely fail — surface a friendlier message.
      toast.error("Couldn't resend automatically. Please return to onboarding to resubmit.");
    } finally {
      setResending(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md"
      >
        <div className="mb-8 text-center">
          <h1 className="font-heading text-3xl font-bold">
            Next<span className="text-primary">Step</span>
          </h1>
        </div>

        <Card>
          <CardHeader className="text-center">
            <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 text-primary">
              <Mail className="h-7 w-7" />
            </div>
            <CardTitle>Check your inbox</CardTitle>
            <CardDescription>
              We've sent a verification link to{" "}
              {email ? <span className="font-medium text-foreground">{email}</span> : "your email"}.
              <br />
              Click the link to verify your email and set your password.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-lg border border-primary/20 bg-primary/5 p-4 text-sm text-muted-foreground">
              <p className="mb-2 font-medium text-foreground">Next steps</p>
              <ol className="list-inside list-decimal space-y-1">
                <li>Open the email from NextStep</li>
                <li>Click the verification link</li>
                <li>Set your password</li>
                <li>Take your one-time diagnostic for the course</li>
              </ol>
            </div>

            <p className="text-center text-xs text-muted-foreground">
              Didn't get it? Check your spam folder, or wait a minute and try again.
            </p>

            <div className="flex flex-col gap-2">
              <Button
                variant="outline"
                onClick={resend}
                disabled={resending || cooldown > 0 || !email}
                className="gap-2"
              >
                <RefreshCw className={`h-4 w-4 ${resending ? "animate-spin" : ""}`} />
                {cooldown > 0 ? `Resend in ${cooldown}s` : "Resend verification email"}
              </Button>
              <Button variant="ghost" onClick={() => navigate("/")} className="gap-2">
                <ArrowLeft className="h-4 w-4" /> Back to landing
              </Button>
            </div>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
};

export default VerifyEmail;
