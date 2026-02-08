import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { useApp } from "@/contexts/AppContext";
import { availableCourses, mockCourse } from "@/data/mockData";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowRight, User, BookOpen } from "lucide-react";
import { Progress } from "@/components/ui/progress";

const StudentOnboarding = () => {
  const { setStudentProfile, setStudentOnboarded, setCurrentCourse } = useApp();
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [name, setName] = useState("");
  const [courseCode, setCourseCode] = useState("");

  const handleComplete = () => {
    setStudentProfile({
      name,
      courseCode,
      learnerLevel: "Beginner",
      topicBaseline: {},
    });
    setCurrentCourse(mockCourse);
    setStudentOnboarded(true);
    navigate("/student/diagnostic");
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-lg">
        <div className="mb-8 text-center">
          <h1 className="font-heading text-3xl font-bold">Join Next<span className="text-primary">Step</span></h1>
          <p className="mt-2 text-muted-foreground">Set up your student profile in under 2 minutes</p>
        </div>

        <Progress value={((step + 1) / 2) * 100} className="mb-6 h-2" />

        <Card>
          <CardContent className="p-6">
            <motion.div key={step} initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }}>
              {step === 0 && (
                <div className="space-y-4">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary"><User className="h-5 w-5" /></div>
                    <div>
                      <h2 className="text-lg font-semibold">Your Name</h2>
                      <p className="text-sm text-muted-foreground">How should we address you?</p>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>Full Name</Label>
                    <Input placeholder="Alex Johnson" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
                  </div>
                </div>
              )}

              {step === 1 && (
                <div className="space-y-4">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent/10 text-accent"><BookOpen className="h-5 w-5" /></div>
                    <div>
                      <h2 className="text-lg font-semibold">Select Course</h2>
                      <p className="text-sm text-muted-foreground">Which course are you enrolling in?</p>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>Course</Label>
                    <Select value={courseCode} onValueChange={setCourseCode}>
                      <SelectTrigger><SelectValue placeholder="Select your course" /></SelectTrigger>
                      <SelectContent>
                        {availableCourses.map((c) => (
                          <SelectItem key={c.code} value={c.code}>{c.code} — {c.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              )}
            </motion.div>

            <div className="mt-6 flex justify-between">
              <Button variant="ghost" onClick={() => setStep(0)} disabled={step === 0}>Back</Button>
              {step === 0 ? (
                <Button onClick={() => setStep(1)} disabled={!name.trim()}>Next <ArrowRight className="ml-2 h-4 w-4" /></Button>
              ) : (
                <Button onClick={handleComplete} disabled={!courseCode}>Start Diagnostic <ArrowRight className="ml-2 h-4 w-4" /></Button>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default StudentOnboarding;