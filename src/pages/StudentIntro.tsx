import { useState } from "react";
import { useNavigate } from "react-router-dom";
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
      "NextStep's AI tutor adapts to your mastery level and teaches only what your professor has covered in your course. Every explanation uses real-world, industry-relevant examples so you can see how concepts apply beyond the classroom.",
    callout: "Get personalised support that actually matches what you're being taught.",
  },
  {
    icon: ClipboardCheck,
    title: "AI Tutor for Exam Mode",
    subtitle: "Practice under real conditions",
    description:
      "Switch into Exam Mode when you want to practice under test conditions. The AI tutor guides you through problems with hints and structured feedback, without just handing you the answer.",
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
    title: "Mastery Map",
    subtitle: "See your progress clearly",
    description:
      "Your Mastery Map gives you a visual breakdown of your performance across every topic in the course. You can see at a glance what you've understood well, what needs more work, and how your level has changed over time.",
    callout: "Know exactly where you stand, so you can study smarter.",
  },
];

const StudentIntro = () => {
  const navigate = useNavigate();
  const [activeIndex, setActiveIndex] = useState(0);
  const active = features[activeIndex];
  const ActiveIcon = active.icon;

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
            NextStep is your AI-powered study partner, built around your actual course syllabus. It adapts to your level, guides you through concepts step by step, and helps you understand where you stand. Here's what you get.
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
                      onClick={() => setActiveIndex(i)}
                      className={cn(
                        "w-full text-left px-5 py-4 border-l-4 transition-colors",
                        isActive
                          ? "border-l-primary bg-primary/5"
                          : "border-l-transparent hover:bg-muted/60",
                      )}
                    >
                      <div
                        className={cn(
                          "font-semibold text-sm",
                          isActive ? "text-primary" : "text-foreground",
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
          <div className="p-8 md:p-10">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10 text-primary mb-6">
              <ActiveIcon className="h-8 w-8" />
            </div>
            <h2 className="text-2xl font-bold text-foreground md:text-3xl">
              {active.title}
            </h2>
            <p className="mt-4 text-base text-muted-foreground leading-relaxed">
              {active.description}
            </p>
            <div className="mt-6 rounded-md border-l-4 border-primary bg-primary/5 px-4 py-3">
              <p className="text-sm font-medium text-foreground">
                {active.callout}
              </p>
            </div>
          </div>
        </div>

        <div className="mt-12 flex justify-center">
          <Button
            size="lg"
            onClick={() => navigate("/auth?role=student")}
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
