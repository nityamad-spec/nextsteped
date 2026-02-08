import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { useApp } from "@/contexts/AppContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Card, CardContent } from "@/components/ui/card";
import { ArrowRight, ArrowLeft, User, Building2, BookOpen, Lightbulb } from "lucide-react";

const steps = [
  { title: "Your Name", icon: User, description: "Let's get to know you" },
  { title: "Department", icon: Building2, description: "Where do you teach?" },
  { title: "Courses", icon: BookOpen, description: "What do you teach?" },
  { title: "Teaching Style", icon: Lightbulb, description: "How do you teach?" },
];

const teachingStyles = [
  "Lecture-based",
  "Discussion-based",
  "Project-based",
  "Flipped Classroom",
  "Experiential Learning",
  "Hybrid / Blended",
];

const TeacherOnboarding = () => {
  const { setTeacherProfile, setTeacherOnboarded } = useApp();
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [name, setName] = useState("");
  const [department, setDepartment] = useState("");
  const [courses, setCourses] = useState("");
  const [style, setStyle] = useState("");

  const canNext = () => {
    if (step === 0) return name.trim().length > 0;
    if (step === 1) return department.trim().length > 0;
    if (step === 2) return courses.trim().length > 0;
    if (step === 3) return style.length > 0;
    return false;
  };

  const handleComplete = () => {
    setTeacherProfile({
      name,
      department,
      courses: courses.split(",").map((c) => c.trim()),
      teachingStyle: style,
    });
    setTeacherOnboarded(true);
    navigate("/teacher/courses");
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-lg">
        <div className="mb-8 text-center">
          <h1 className="font-heading text-3xl font-bold">Welcome to Next<span className="text-primary">Step</span></h1>
          <p className="mt-2 text-muted-foreground">Let's set up your professor profile</p>
        </div>

        <div className="mb-6">
          <Progress value={((step + 1) / steps.length) * 100} className="h-2" />
          <div className="mt-2 flex justify-between text-xs text-muted-foreground">
            {steps.map((s, i) => (
              <span key={i} className={i <= step ? "text-primary font-medium" : ""}>{s.title}</span>
            ))}
          </div>
        </div>

        <Card>
          <CardContent className="p-6">
            <motion.div key={step} initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.3 }}>
              <div className="mb-6 flex items-center gap-3">
                {(() => { const Icon = steps[step].icon; return <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary"><Icon className="h-5 w-5" /></div>; })()}
                <div>
                  <h2 className="text-lg font-semibold">{steps[step].title}</h2>
                  <p className="text-sm text-muted-foreground">{steps[step].description}</p>
                </div>
              </div>

              {step === 0 && (
                <div className="space-y-2">
                  <Label>Full Name</Label>
                  <Input placeholder="Dr. Jane Smith" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
                </div>
              )}

              {step === 1 && (
                <div className="space-y-2">
                  <Label>Department</Label>
                  <Input placeholder="Computer Science" value={department} onChange={(e) => setDepartment(e.target.value)} autoFocus />
                </div>
              )}

              {step === 2 && (
                <div className="space-y-2">
                  <Label>Courses You Teach</Label>
                  <Input placeholder="Operating Systems, Data Structures" value={courses} onChange={(e) => setCourses(e.target.value)} autoFocus />
                  <p className="text-xs text-muted-foreground">Separate multiple courses with commas</p>
                </div>
              )}

              {step === 3 && (
                <div className="space-y-3">
                  <Label>Preferred Teaching Style</Label>
                  <div className="grid grid-cols-2 gap-2">
                    {teachingStyles.map((s) => (
                      <button
                        key={s}
                        onClick={() => setStyle(s)}
                        className={`rounded-lg border px-3 py-2.5 text-sm transition-colors ${
                          style === s ? "border-primary bg-primary/5 text-primary font-medium" : "hover:bg-muted"
                        }`}
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </motion.div>

            <div className="mt-6 flex justify-between">
              <Button variant="ghost" onClick={() => setStep(step - 1)} disabled={step === 0}>
                <ArrowLeft className="mr-2 h-4 w-4" /> Back
              </Button>
              {step < steps.length - 1 ? (
                <Button onClick={() => setStep(step + 1)} disabled={!canNext()}>
                  Next <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              ) : (
                <Button onClick={handleComplete} disabled={!canNext()}>
                  Complete Setup <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default TeacherOnboarding;