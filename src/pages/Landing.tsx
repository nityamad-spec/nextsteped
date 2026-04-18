import { motion } from "framer-motion";
import { GraduationCap, BookOpen, ArrowRight, LogOut } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useApp } from "@/contexts/AppContext";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

const Landing = () => {
  const navigate = useNavigate();
  const { setRole } = useApp();
  const { user, signOut } = useAuth();

  const selectRole = async (role: "teacher" | "student") => {
    if (user) {
      // Check if the user already has a profile with a different role
      const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .maybeSingle();

      if (profile && profile.role !== role) {
        toast.error(`Your account is registered as a ${profile.role}. Please sign out first to use a different role.`);
        return;
      }

      // Already logged in with matching role — go directly
      setRole(role);
      navigate(role === "teacher" ? "/teacher" : "/student");
      return;
    }

    setRole(role);
    navigate(role === "teacher" ? "/intro/teacher" : "/intro/student");
  };

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center bg-background px-4">
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

      <div className="grid w-full max-w-3xl gap-4 sm:grid-cols-2">
        <motion.button
          initial={{ opacity: 0, x: -30 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.5, delay: 0.2 }}
          whileHover={{ scale: 1.02, y: -4 }}
          whileTap={{ scale: 0.98 }}
          onClick={() => selectRole("teacher")}
          className="group flex flex-col items-center gap-4 rounded-xl border bg-card p-8 shadow-sm transition-shadow hover:shadow-lg"
        >
          <div className="flex h-16 w-16 items-center justify-center rounded-xl bg-primary/10 text-primary transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
            <BookOpen className="h-8 w-8" />
          </div>
          <div className="text-center">
            <h2 className="text-xl font-semibold text-foreground">I'm a Professor</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Create courses, set up your Teaching Assistant, and monitor student progress.
            </p>
          </div>
          <div className="mt-2 flex items-center gap-1 text-sm font-medium text-primary opacity-0 transition-opacity group-hover:opacity-100">
            Get started <ArrowRight className="h-4 w-4" />
          </div>
        </motion.button>

        <motion.button
          initial={{ opacity: 0, x: 30 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.5, delay: 0.3 }}
          whileHover={{ scale: 1.02, y: -4 }}
          whileTap={{ scale: 0.98 }}
          onClick={() => selectRole("student")}
          className="group flex flex-col items-center gap-4 rounded-xl border bg-card p-8 shadow-sm transition-shadow hover:shadow-lg"
        >
          <div className="flex h-16 w-16 items-center justify-center rounded-xl bg-accent/10 text-accent transition-colors group-hover:bg-accent group-hover:text-accent-foreground">
            <GraduationCap className="h-8 w-8" />
          </div>
          <div className="text-center">
            <h2 className="text-xl font-semibold text-foreground">I'm a Student</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Learn with an AI tutor, practice for exams, and track your progress.
            </p>
          </div>
          <div className="mt-2 flex items-center gap-1 text-sm font-medium text-accent opacity-0 transition-opacity group-hover:opacity-100">
            Get started <ArrowRight className="h-4 w-4" />
          </div>
        </motion.button>
      </div>

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.8 }}
        className="mt-12 flex flex-col items-center gap-2"
      >
        <p className="text-xs text-muted-foreground">
          Built for the future of education
        </p>
        <button
          onClick={() => navigate("/auth?role=admin")}
          className="text-xs text-muted-foreground/50 hover:text-muted-foreground transition-colors"
        >
          Admin Login
        </button>
      </motion.div>
    </div>
  );
};

export default Landing;
