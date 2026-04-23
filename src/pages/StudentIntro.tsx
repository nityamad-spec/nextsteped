import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import {
  ArrowRight,
  ArrowLeft,
  Bot,
  ClipboardCheck,
  Compass,
  Map as MapIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

const features = [
  {
    icon: Bot,
    title: "Adaptive AI Tutor",
    subtitle: "Study mode, built for you",
    description:
      "In Study Mode, NextStep's AI tutor adapts to your knowledge level and learning style, all while being aligned to your specific course syllabus and materials. Get clear explanations, generate practice questions on demand, and see real-world, industry-relevant examples so you can understand how concepts apply beyond the classroom.",
    callout: "Get personalised support that actually matches what you're being taught.",
  },
  {
    icon: ClipboardCheck,
    title: "AI Tutor for Exam Mode",
    subtitle: "Practice under real conditions",
    description:
      "Switch into Exam Mode when you want to practice under real test conditions. After each practice exam, you get structured feedback, concept explanations, and a targeted list of concepts to review — plus the ability to track your performance on practice exams over time.",
    callout: "Build real confidence before the exam, not just familiarity with the material.",
  },
  {
    icon: Compass,
    title: "What to Do Next",
    subtitle: "Your guided learning path",
    description:
      "NextStep tracks where you are in your learning journey and tells you exactly which concept to focus on next. You never have to figure out where to start or what to prioritise — it's always clear.",
    callout: "Spend your study time on what actually moves you forward.",
  },
  {
    icon: MapIcon,
    title: "Concept Exploration Map",
    subtitle: "See your progress clearly",
    description:
      "Your concept exploration map gives you a visual breakdown of how much you have engaged across every topic, and the mastery level per concept where applicable. You can see at a glance what you've explored deeply, what needs more work, and how your understanding has changed over time.",
    callout: "Know exactly where you stand, so you can study smarter.",
  },
];

const ADVANCE_MS = 8000;

const StudentIntro = () => {
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
            Here's how Next<span className="text-primary">Step</span> helps you learn.
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-base text-muted-foreground leading-relaxed">
            NextStep is your AI-powered study partner, built around your specific course. It adapts to your learning style, guides you though concepts step by step, and helps you understand where you stand. Here's what you get.
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
            onClick={() => navigate("/student")}
            className="gap-2"
          >
            Get Started <ArrowRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
};

export default StudentIntro;
