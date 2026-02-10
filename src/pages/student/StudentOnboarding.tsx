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
import { ArrowRight, ArrowLeft, GraduationCap, User, BookOpen, Sparkles } from "lucide-react";

const StudentOnboarding = () => {
  const { setStudentProfile, setStudentOnboarded, setCurrentCourse } = useApp();
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [courseCode, setCourseCode] = useState("");

  const isValid = name.trim() && courseCode;
  const selectedCourse = availableCourses.find((c) => c.code === courseCode);

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
    <div className="flex min-h-screen bg-background">
      {/* Left panel — branding */}
      <div className="hidden lg:flex lg:w-[45%] flex-col justify-between bg-primary p-10 text-primary-foreground">
        <div>
          <h1 className="font-heading text-3xl font-bold">
            Next<span className="opacity-80">Step</span>
          </h1>
          <p className="mt-1 text-sm opacity-70">AI-Powered Learning</p>
        </div>
        <div className="space-y-8">
          <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.2 }} className="flex items-start gap-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary-foreground/10">
              <Sparkles className="h-5 w-5" />
            </div>
            <div>
              <h3 className="font-medium">Personalized Learning</h3>
              <p className="mt-1 text-sm opacity-70">AI adapts to your level and learning style for maximum understanding</p>
            </div>
          </motion.div>
          <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.35 }} className="flex items-start gap-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary-foreground/10">
              <BookOpen className="h-5 w-5" />
            </div>
            <div>
              <h3 className="font-medium">Course-Aligned Content</h3>
              <p className="mt-1 text-sm opacity-70">Practice problems and explanations directly from your course syllabus</p>
            </div>
          </motion.div>
          <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.5 }} className="flex items-start gap-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary-foreground/10">
              <GraduationCap className="h-5 w-5" />
            </div>
            <div>
              <h3 className="font-medium">Exam Preparation</h3>
              <p className="mt-1 text-sm opacity-70">Timed simulations and targeted review to boost your exam readiness</p>
            </div>
          </motion.div>
        </div>
        <p className="text-xs opacity-50">© 2025 NextStep Learning Platform</p>
      </div>

      {/* Right panel — form */}
      <div className="flex flex-1 items-center justify-center px-6 py-12">
        <div className="w-full max-w-md">
          <div className="mb-8">
            <div className="lg:hidden mb-6">
              <h1 className="font-heading text-2xl font-bold">
                Next<span className="text-primary">Step</span>
              </h1>
            </div>
            <h2 className="font-heading text-2xl font-bold">Welcome aboard 👋</h2>
            <p className="mt-2 text-muted-foreground">Let's set up your student profile to get started</p>
          </div>

          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
            {/* Name field */}
            <div className="space-y-2">
              <Label className="text-sm font-medium">Full Name</Label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Enter your full name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="pl-10"
                  autoFocus
                />
              </div>
            </div>

            {/* Course selection */}
            <div className="space-y-2">
              <Label className="text-sm font-medium">Select Your Course</Label>
              <Select value={courseCode} onValueChange={setCourseCode}>
                <SelectTrigger className="h-11">
                  <SelectValue placeholder="Choose a course..." />
                </SelectTrigger>
                <SelectContent>
                  {availableCourses.map((c) => (
                    <SelectItem key={c.code} value={c.code}>
                      <span className="font-medium">{c.code}</span>
                      <span className="text-muted-foreground"> — {c.name}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Selected course preview */}
            {selectedCourse && (
              <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }}>
                <Card className="border-primary/20 bg-primary/5">
                  <CardContent className="p-4">
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                        <BookOpen className="h-5 w-5" />
                      </div>
                      <div>
                        <p className="text-sm font-medium">{selectedCourse.name}</p>
                        <p className="text-xs text-muted-foreground">Course Code: {selectedCourse.code}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            )}

            {/* Actions */}
            <div className="flex justify-between pt-4">
              <Button variant="ghost" onClick={() => navigate("/")}>
                <ArrowLeft className="mr-2 h-4 w-4" /> Back
              </Button>
              <Button onClick={handleComplete} disabled={!isValid} size="lg">
                Continue to Diagnostic <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </div>
          </motion.div>
        </div>
      </div>
    </div>
  );
};

export default StudentOnboarding;
