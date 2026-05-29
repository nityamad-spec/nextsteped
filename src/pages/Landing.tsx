import { motion } from "framer-motion";
import { GraduationCap, BookOpen, ArrowRight, LogIn, Sparkles, LogOut } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useApp } from "@/contexts/AppContext";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { AUTH_BYPASS, BYPASS_ADMIN_EMAIL } from "@/lib/authBypass";

const Landing = () => {
  const navigate = useNavigate();
  const { setRole } = useApp();
  const { user, signOut } = useAuth();

  // Returning professors: must already have a profile + be approved.
  // We send them straight to /auth?role=teacher (sign in).
  const goReturningProfessor = async () => {
    if (user) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("role, email")
        .eq("id", user.id)
        .maybeSingle();

      const isBypassAdmin =
        AUTH_BYPASS &&
        (profile?.role === "admin" ||
          profile?.email === BYPASS_ADMIN_EMAIL ||
          user.email === BYPASS_ADMIN_EMAIL);

      if (profile?.role === "teacher" || isBypassAdmin) {
        setRole("teacher");
        navigate("/teacher");
        return;
      }
      if (profile?.role && profile.role !== "teacher") {
        toast.error(`Your account is registered as a ${profile.role}. Please sign out first.`);
        return;
      }
    }
    setRole("teacher");
    navigate("/auth?role=teacher");
  };

  // New professors: always start at the intro page (Step 1 of the gated flow).
  const goNewProfessor = () => {
    setRole("teacher");
    navigate("/intro/teacher");
  };

  // Returning students: must already have a profile + diagnostic done.
  // Send them straight to /auth?role=student (sign in).
  const goReturningStudent = async () => {
    if (user) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .maybeSingle();

      if (profile?.role === "student") {
        setRole("student");
        navigate("/student");
        return;
      }
      if (profile?.role && profile.role !== "student") {
        toast.error(`Your account is registered as a ${profile.role}. Please sign out first.`);
        return;
      }
    }
    setRole("student");
    navigate("/auth?role=student");
  };

  // New students: always start at the intro page (Step 1 of the gated flow).
  const goNewStudent = () => {
    setRole("student");
    navigate("/intro/student");
  };

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center bg-background px-4 py-12">

      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
        className="mb-12 text-center"
      >
        <h1 className="font-heading text-5xl font-bold tracking-tight text-foreground md:text-6xl">
          Next<span className="text-primary">Step</span>
        </h1>
        <p className="mt-4 max-w-md text-lg text-muted-foreground">
          Your AI-powered learning companion for courses and exam prep.
        </p>
      </motion.div>

      {/* Two role cards: Professors & Students, each with two actions */}
      <div className="grid w-full max-w-4xl gap-6 sm:grid-cols-2">
        {/* Professors */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.15 }}
          className="group flex flex-col rounded-2xl border-2 border-primary/20 bg-gradient-to-br from-primary/[0.04] to-transparent p-6 shadow-sm transition-shadow hover:shadow-lg sm:p-8"
        >
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary text-primary-foreground">
              <BookOpen className="h-6 w-6" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-foreground">For Professors</h2>
              <p className="text-xs text-muted-foreground">Design courses & track students</p>
            </div>
          </div>

          <div className="mt-6 flex flex-col gap-3">
            <button
              onClick={goNewProfessor}
              className="group/btn relative flex items-center justify-between gap-3 rounded-xl border-2 border-primary/30 bg-card p-4 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:border-primary/50 hover:shadow-md"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-foreground">I'm New Here</span>
                  <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-primary">
                    <Sparkles className="h-2.5 w-2.5" /> New
                  </span>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">Create your professor account</p>
              </div>
              <ArrowRight className="h-4 w-4 shrink-0 text-primary transition-transform group-hover/btn:translate-x-0.5" />
            </button>

            <button
              onClick={goReturningProfessor}
              className="group/btn flex items-center justify-between gap-3 rounded-xl border bg-card p-4 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:border-foreground/30 hover:shadow-md"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <LogIn className="h-3.5 w-3.5 text-foreground" />
                  <span className="text-sm font-semibold text-foreground">Welcome Back — Log In</span>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">Sign in to your approved account</p>
              </div>
              <ArrowRight className="h-4 w-4 shrink-0 text-foreground transition-transform group-hover/btn:translate-x-0.5" />
            </button>
          </div>
        </motion.div>

        {/* Students */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.25 }}
          className="group flex flex-col rounded-2xl border-2 border-accent/20 bg-gradient-to-br from-accent/[0.04] to-transparent p-6 shadow-sm transition-shadow hover:shadow-lg sm:p-8"
        >
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-accent text-accent-foreground">
              <GraduationCap className="h-6 w-6" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-foreground">For Students</h2>
              <p className="text-xs text-muted-foreground">Learn, practice & ace exams</p>
            </div>
          </div>

          <div className="mt-6 flex flex-col gap-3">
            <button
              onClick={goNewStudent}
              className="group/btn relative flex items-center justify-between gap-3 rounded-xl border-2 border-accent/30 bg-card p-4 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:border-accent/50 hover:shadow-md"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-foreground">I'm New Here</span>
                  <span className="inline-flex items-center gap-1 rounded-full bg-accent/10 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-accent">
                    <Sparkles className="h-2.5 w-2.5" /> New
                  </span>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">Create your student account</p>
              </div>
              <ArrowRight className="h-4 w-4 shrink-0 text-accent transition-transform group-hover/btn:translate-x-0.5" />
            </button>

            <button
              onClick={goReturningStudent}
              className="group/btn flex items-center justify-between gap-3 rounded-xl border bg-card p-4 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:border-foreground/30 hover:shadow-md"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <LogIn className="h-3.5 w-3.5 text-foreground" />
                  <span className="text-sm font-semibold text-foreground">Welcome Back — Log In</span>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">Sign in to your student account</p>
              </div>
              <ArrowRight className="h-4 w-4 shrink-0 text-foreground transition-transform group-hover/btn:translate-x-0.5" />
            </button>
          </div>
        </motion.div>
      </div>

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.8 }}
        className="mt-12 flex flex-col items-center gap-2"
      >
        <p className="text-xs text-muted-foreground">Built for the future of education</p>
        <button
          onClick={() => navigate("/auth?role=admin")}
          aria-label="Admin"
          className="text-xs leading-none text-muted-foreground/20 transition-colors hover:text-muted-foreground/60"
        >
          ·
        </button>
      </motion.div>
    </div>
  );
};

export default Landing;
