import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  ArrowRight,
  ArrowLeft,
  Bot,
  ClipboardCheck,
  Compass,
  Map as MapIcon,
} from "lucide-react";

const features = [
  {
    icon: Bot,
    title: "Adaptive AI Tutor in Study Mode",
    desc: "Learn at your level with an AI tutor aligned to your curriculum, using real-world industry examples to make concepts click.",
  },
  {
    icon: ClipboardCheck,
    title: "AI Tutor for Exam Mode",
    desc: "Practice for exams with an AI tutor that simulates test conditions and gives you guided feedback without just giving you the answers.",
  },
  {
    icon: Compass,
    title: "What to Do Next",
    desc: "Never feel lost — NextStep tells you exactly what concept to focus on next based on where you are in your learning journey.",
  },
  {
    icon: MapIcon,
    title: "Mastery Map",
    desc: "Visualise your own performance across topics so you always know what you've mastered and what still needs work.",
  },
];

const StudentIntro = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-background px-4 py-12">
      <div className="mx-auto max-w-5xl">
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

        <div className="grid gap-4 sm:grid-cols-2">
          {features.map((f) => (
            <Card key={f.title} className="border bg-card transition-shadow hover:shadow-md">
              <CardContent className="p-6 space-y-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <f.icon className="h-5 w-5" />
                </div>
                <h3 className="font-semibold text-base text-foreground">{f.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{f.desc}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="mt-12 flex justify-center">
          <Button size="lg" onClick={() => navigate("/auth?role=student")} className="gap-2">
            Get Started <ArrowRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
};

export default StudentIntro;
