import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  ArrowRight,
  ArrowLeft,
  ClipboardList,
  Bot,
  Sparkles,
  BarChart3,
  Lightbulb,
} from "lucide-react";

const features = [
  {
    icon: ClipboardList,
    title: "Lesson Plan Generation",
    desc: "Upload your syllabus and get a structured, week-by-week lesson plan with industry-relevant exercises and resources.",
  },
  {
    icon: Bot,
    title: "Curriculum-Aligned AI TA for Students",
    desc: "Your students get an AI tutor that only teaches what you've covered, keeping learning on track and on syllabus.",
  },
  {
    icon: Sparkles,
    title: "Professor AI TA",
    desc: "Get your own AI assistant to help you with course planning, student questions, and teaching support.",
  },
  {
    icon: BarChart3,
    title: "Student Mastery Tracking",
    desc: "See exactly where each student stands across concepts, with class-wide diagnostics and performance data.",
  },
  {
    icon: Lightbulb,
    title: "AI Teaching Insights",
    desc: "Identify which concepts students are struggling with most so you can adjust your teaching before it's too late.",
  },
];

const TeacherIntro = () => {
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
            Here's what Next<span className="text-primary">Step</span> does for you.
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-base text-muted-foreground leading-relaxed">
            NextStep is your AI-powered teaching assistant, built to reduce your prep burden and give you real visibility into how your students are learning. It aligns entirely to your syllabus and course materials, so students always get support that matches what you teach. Here's what you get access to.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
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
          <Button size="lg" onClick={() => navigate("/auth?role=teacher")} className="gap-2">
            Get Started <ArrowRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
};

export default TeacherIntro;
