import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import {
  ArrowRight,
  ArrowLeft,
  ClipboardList,
  Bot,
  Sparkles,
  BarChart3,
  Lightbulb,
} from "lucide-react";
import { cn } from "@/lib/utils";

const features = [
  {
    icon: ClipboardList,
    title: "Lesson Plan Generation",
    subtitle: "Built from your syllabus",
    description:
      "Upload your syllabus and NextStep instantly generates a structured, week-by-week lesson plan. Each week includes topics, one industry-relevant exercise, curated articles, and key concepts to cover. If you've already got a lesson plan, NextStep identifies gaps and adds only what's missing.",
    callout: "Cut hours of prep work down to minutes.",
  },
  {
    icon: Bot,
    title: "Curriculum-Aligned AI TA",
    subtitle: "For your students",
    description:
      "Your students get access to an AI tutor that is trained only on what you've uploaded. It won't go off-syllabus, won't give away answers, and guides students through concepts the way you would want it to.",
    callout: "Every student gets support that matches exactly what you teach.",
  },
  {
    icon: Sparkles,
    title: "Professor AI TA",
    subtitle: "Your personal teaching assistant",
    description:
      "You get your own AI assistant separate from the student-facing one. Use it to get help with course planning, drafting explanations, anticipating student questions, or thinking through how to structure a difficult topic.",
    callout: "Like having a well-prepared co-instructor available at all times.",
  },
  {
    icon: BarChart3,
    title: "Student Mastery Tracking",
    subtitle: "Real-time performance data",
    description:
      "NextStep tracks how each student is progressing across every concept in your course, segmented by mastery level from Beginner to Expert. You get a class-wide view as well as individual student breakdowns.",
    callout: "Stop guessing who needs help — see it directly in your dashboard.",
  },
  {
    icon: Lightbulb,
    title: "AI Teaching Insights",
    subtitle: "Know where students struggle",
    description:
      "NextStep surfaces which concepts your students are collectively struggling with most, based on their interactions with the AI TA and diagnostic performance. You get actionable data, not just raw numbers.",
    callout: "Adjust your teaching before a concept becomes a class-wide gap.",
  },
];

const ADVANCE_MS = 8000;

const TeacherIntro = () => {
  const navigate = useNavigate();
  const [activeIndex, setActiveIndex] = useState(0);
  const [progressKey, setProgressKey] = useState(0);
  const [paused, setPaused] = useState(false);
  const timerRef = useRef<number | null>(null);
  const active = features[activeIndex];
  const ActiveIcon = active.icon;

  useEffect(() => {
    if (timerRef.current) window.clearTimeout(timerRef.current);
    if (paused) return;
    timerRef.current = window.setTimeout(() => {
      setActiveIndex((i) => (i + 1) % features.length);
      setProgressKey((k) => k + 1);
    }, ADVANCE_MS);
    return () => {
      if (timerRef.current) window.clearTimeout(timerRef.current);
    };
  }, [activeIndex, progressKey, paused]);

  const selectTab = (i: number) => {
    setActiveIndex(i);
    setProgressKey((k) => k + 1);
    setPaused(true);
  };

  return (
    <div className="min-h-screen bg-background px-4 py-12">
      <div className="mx-auto max-w-6xl">
        <button
          onClick={() => navigate("/")}
          className="mb-6 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-4 w-4" /> Back
        </button>

        <div className="mb-10 text-center">
          <h1 className="font-heading text-4xl font-bold tracking-tight md:text-5xl">
            Here's what Next<span className="text-primary">Step</span> does for you.
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-base text-muted-foreground leading-relaxed">
            NextStep is your AI-powered teaching assistant, built to reduce your prep burden and give you real visibility into how your students are learning. It aligns entirely to your syllabus and course materials, so students always get support that matches what you teach. Here's what you get access to.
          </p>
        </div>

        <div className="grid gap-0 rounded-xl border bg-card overflow-hidden md:grid-cols-[35%_65%]">
          {/* Left: tabs */}
          <div className="border-b md:border-b-0 md:border-r bg-muted/30">
            <ul className="flex flex-col">
              {features.map((f, i) => {
                const isActive = i === activeIndex;
                return (
                  <li key={f.title}>
                    <button
                      onClick={() => selectTab(i)}
                      className={cn(
                        "w-full text-left px-5 py-4 border-l-4 transition-colors",
                        isActive
                          ? "border-l-primary bg-primary/5"
                          : "border-l-transparent hover:bg-muted/60",
                      )}
                    >
                      <div
                        className={cn(
                          "font-semibold transition-all duration-300 ease-out",
                          isActive
                            ? "text-primary text-base"
                            : "text-muted-foreground text-sm",
                        )}
                      >
                        {f.title}
                      </div>
                      <div className="mt-0.5 text-xs text-muted-foreground">
                        {f.subtitle}
                      </div>
                    </button>
                </li>
              );
            })}
          </ul>
        </div>

          {/* Right: panel */}
          <div className="relative p-8 md:p-10 overflow-hidden min-h-[360px]">
            <AnimatePresence mode="wait">
              <motion.div
                key={activeIndex}
                initial={{ opacity: 0, x: 24 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -24 }}
                transition={{
                  opacity: { duration: 0.3, ease: "easeOut" },
                  x: { duration: 0.3, ease: "easeOut" },
                }}
              >
                <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10 text-primary mb-6">
                  <ActiveIcon className="h-8 w-8" />
                </div>
                <h2 className="text-2xl font-bold text-foreground md:text-3xl">
                  {active.title}
                </h2>
                <p className="mt-4 text-base text-muted-foreground leading-relaxed">
                  {active.description}
                </p>
                <div className="mt-6 relative overflow-hidden rounded-md border-l-4 border-primary bg-primary/5 px-4 py-3">
                  <p className="relative z-10 text-sm font-medium text-foreground">
                    {active.callout}
                  </p>
                  <motion.div
                    key={`sweep-${activeIndex}`}
                    className="pointer-events-none absolute inset-y-0 left-0 w-1/3 bg-gradient-to-r from-transparent via-primary/20 to-transparent"
                    initial={{ x: "-100%" }}
                    animate={{ x: "350%" }}
                    transition={{ duration: 0.4, ease: "easeOut", delay: 0.3 }}
                  />
                </div>
              </motion.div>
            </AnimatePresence>
          </div>
        </div>

        <div className="mt-12 flex justify-center">
          <Button
            size="lg"
            onClick={() => navigate("/auth?role=teacher")}
            className="gap-2"
          >
            Get Started <ArrowRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
};

export default TeacherIntro;
