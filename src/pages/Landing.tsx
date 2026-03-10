import { motion } from "framer-motion";
import { GraduationCap, BookOpen, ArrowRight } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useApp } from "@/contexts/AppContext";

const Landing = () => {
  const navigate = useNavigate();
  const { setRole } = useApp();

  const selectRole = (role: "teacher" | "student") => {
    setRole(role);
    navigate(role === "teacher" ? "/teacher/onboarding" : "/auth");
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4">
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

      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.8 }}
        className="mt-12 text-xs text-muted-foreground"
      >
        Built for the future of education
      </motion.p>
    </div>
  );
};

export default Landing;
