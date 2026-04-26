import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ClipboardCheck, Mail, Clock, ArrowLeft } from "lucide-react";

/**
 * Step 3 of the new-professor flow — the locked confirmation screen.
 *
 * The professor reaches this page after submitting their application.
 * They are NOT authenticated yet (account is created on admin approval),
 * so there's nothing to lock at the route level — the page itself is
 * a dead end with no in-app navigation other than "Back to Home".
 *
 * The actual login link comes via email from the admin invite flow.
 */
const TeacherPendingApproval = () => {
  const navigate = useNavigate();
  const [appliedEmail, setAppliedEmail] = useState<string | null>(null);

  useEffect(() => {
    const raw = sessionStorage.getItem("pendingApplication");
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw);
      if (parsed?.email) setAppliedEmail(parsed.email);
    } catch {
      /* ignore */
    }
  }, []);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-12">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="w-full max-w-xl"
      >
        <Card>
          <CardContent className="px-8 py-12 text-center">
            <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-primary/10 text-primary">
              <ClipboardCheck className="h-8 w-8" />
            </div>

            <h1 className="font-heading text-3xl font-bold tracking-tight">
              You're on the list
            </h1>
            <p className="mt-3 text-base text-muted-foreground">
              Your profile has been submitted and is under review by our admin team.
            </p>

            <div className="mt-8 space-y-3 text-left">
              <div className="flex items-start gap-3 rounded-lg border border-primary/20 bg-primary/5 px-4 py-3">
                <Clock className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                <div>
                  <p className="text-sm font-medium text-foreground">What happens next</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    An admin will review your details. This usually takes 1–2 business days.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3 rounded-lg border bg-card px-4 py-3">
                <Mail className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />
                <div>
                  <p className="text-sm font-medium text-foreground">You'll get an email</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Once approved, we'll email you{" "}
                    {appliedEmail ? (
                      <span className="font-medium text-foreground">{appliedEmail}</span>
                    ) : (
                      "a login link"
                    )}{" "}
                    so you can set your password and head straight to course setup.
                  </p>
                </div>
              </div>
            </div>

            <div className="mt-8 rounded-md border bg-muted/30 px-4 py-3 text-xs text-muted-foreground">
              You can close this tab. There's nothing else for you to do until the email arrives.
            </div>

            <Button
              variant="ghost"
              className="mt-6 gap-2"
              onClick={() => navigate("/")}
            >
              <ArrowLeft className="h-4 w-4" />
              Back to Home
            </Button>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
};

export default TeacherPendingApproval;
