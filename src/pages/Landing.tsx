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
      {user && (
        <div className="absolute right-6 top-6">
          <Button variant="outline" size="sm" onClick={signOut} className="gap-2">
            <LogOut className="h-4 w-4" />
            Sign Out
          </Button>
        </div>
      )}

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

      {/* Professor — two clearly differentiated paths */}
      <div className="w-full max-w-4xl">
        <p className="mb-3 text-center text-xs font-medium uppercase tracking-wider text-muted-foreground">
          For Professors
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          <motion.button
            initial={{ opacity: 0, x: -30 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.5, delay: 0.15 }}
            whileHover={{ scale: 1.02, y: -4 }}
            whileTap={{ scale: 0.98 }}
            onClick={goNewProfessor}
            className="group relative flex flex-col items-center gap-4 overflow-hidden rounded-xl border-2 border-primary/30 bg-gradient-to-br from-primary/5 to-primary/[0.02] p-8 shadow-sm transition-shadow hover:shadow-lg"
          >
            <div className="absolute right-3 top-3 inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-primary">
              <Sparkles className="h-3 w-3" /> New
            </div>
            <div className="flex h-16 w-16 items-center justify-center rounded-xl bg-primary text-primary-foreground transition-transform group-hover:scale-110">
              <BookOpen className="h-8 w-8" />
            </div>
            <div className="text-center">
              <h2 className="text-xl font-semibold text-foreground">I'm New Here</h2>
              <p className="mt-2 text-sm text-muted-foreground">
                See what NextStep does for professors and create your account.
              </p>
            </div>
            <div className="mt-2 flex items-center gap-1 text-sm font-medium text-primary">
              Get started <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
            </div>
          </motion.button>

          <motion.button
            initial={{ opacity: 0, x: 30 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.5, delay: 0.2 }}
            whileHover={{ scale: 1.02, y: -4 }}
            whileTap={{ scale: 0.98 }}
            onClick={goReturningProfessor}
            className="group flex flex-col items-center gap-4 rounded-xl border bg-card p-8 shadow-sm transition-shadow hover:shadow-lg"
          >
            <div className="flex h-16 w-16 items-center justify-center rounded-xl bg-muted text-foreground transition-colors group-hover:bg-foreground group-hover:text-background">
              <LogIn className="h-8 w-8" />
            </div>
            <div className="text-center">
              <h2 className="text-xl font-semibold text-foreground">Welcome Back — Log In</h2>
              <p className="mt-2 text-sm text-muted-foreground">
                Sign in to your approved professor account.
              </p>
            </div>
            <div className="mt-2 flex items-center gap-1 text-sm font-medium text-foreground opacity-0 transition-opacity group-hover:opacity-100">
              Sign in <ArrowRight className="h-4 w-4" />
            </div>
          </motion.button>
        </div>
      </div>

      {/* Student — two clearly differentiated paths */}
      <div className="mt-10 w-full max-w-4xl">
        <p className="mb-3 text-center text-xs font-medium uppercase tracking-wider text-muted-foreground">
          For Students
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          <motion.button
            initial={{ opacity: 0, x: -30 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.5, delay: 0.3 }}
            whileHover={{ scale: 1.02, y: -4 }}
            whileTap={{ scale: 0.98 }}
            onClick={goNewStudent}
            className="group relative flex flex-col items-center gap-4 overflow-hidden rounded-xl border-2 border-accent/30 bg-gradient-to-br from-accent/5 to-accent/[0.02] p-8 shadow-sm transition-shadow hover:shadow-lg"
          >
            <div className="absolute right-3 top-3 inline-flex items-center gap-1 rounded-full bg-accent/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-accent">
              <Sparkles className="h-3 w-3" /> New
            </div>
            <div className="flex h-16 w-16 items-center justify-center rounded-xl bg-accent text-accent-foreground transition-transform group-hover:scale-110">
              <GraduationCap className="h-8 w-8" />
            </div>
            <div className="text-center">
              <h2 className="text-xl font-semibold text-foreground">I'm New Here</h2>
              <p className="mt-2 text-sm text-muted-foreground">
                See what NextStep does for students and create your account.
              </p>
            </div>
            <div className="mt-2 flex items-center gap-1 text-sm font-medium text-accent">
              Get started <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
            </div>
          </motion.button>

          <motion.button
            initial={{ opacity: 0, x: 30 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.5, delay: 0.35 }}
            whileHover={{ scale: 1.02, y: -4 }}
            whileTap={{ scale: 0.98 }}
            onClick={goReturningStudent}
            className="group flex flex-col items-center gap-4 rounded-xl border bg-card p-8 shadow-sm transition-shadow hover:shadow-lg"
          >
            <div className="flex h-16 w-16 items-center justify-center rounded-xl bg-muted text-foreground transition-colors group-hover:bg-foreground group-hover:text-background">
              <LogIn className="h-8 w-8" />
            </div>
            <div className="text-center">
              <h2 className="text-xl font-semibold text-foreground">Welcome Back — Log In</h2>
              <p className="mt-2 text-sm text-muted-foreground">
                Sign in to your student account.
              </p>
            </div>
            <div className="mt-2 flex items-center gap-1 text-sm font-medium text-foreground opacity-0 transition-opacity group-hover:opacity-100">
              Sign in <ArrowRight className="h-4 w-4" />
            </div>
          </motion.button>
        </div>
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
          className="text-xs text-muted-foreground/50 transition-colors hover:text-muted-foreground"
        >
          Admin Login
        </button>
      </motion.div>
    </div>
  );
};

export default Landing;
