import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { useApp } from "@/contexts/AppContext";
import { mockCourse } from "@/data/mockData";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowRight, ArrowLeft, User, BookOpen } from "lucide-react";

const StudentOnboarding = () => {
  const { setStudentProfile, setStudentOnboarded, setCurrentCourse } = useApp();
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [rollNumber, setRollNumber] = useState("");
  const [university, setUniversity] = useState("");
  const [branch, setBranch] = useState("");
  const [year, setYear] = useState("");
  const courseCode = "PY101";
  const courseName = "Intro to Python";

  const isValid = name.trim() && rollNumber.trim() && university.trim() && branch.trim() && year;

  const handleComplete = () => {
    setStudentProfile({
      name,
      courseCode,
      learnerLevel: "Beginner",
      topicBaseline: {},
    });
    setCurrentCourse({ ...mockCourse, id: courseCode.toLowerCase(), name: courseName });
    setStudentOnboarded(true);
    navigate("/student/diagnostic");
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-8">
      <div className="w-full max-w-xl">
        <div className="mb-8 text-center">
          <h1 className="font-heading text-3xl font-bold">
            Welcome to Next<span className="text-primary">Step</span>
          </h1>
          <p className="mt-2 text-muted-foreground">Set up your student profile to get started</p>
        </div>

        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <User className="h-5 w-5" />
              </div>
              <div>
                <CardTitle>Student Profile & Course Setup</CardTitle>
                <CardDescription>Your information and course enrollment</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-5">
              <div className="space-y-2">
                <Label>Full Name</Label>
                <Input
                  placeholder="Enter your full name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  autoFocus
                />
              </div>

              <div className="space-y-2">
                <Label>Roll Number</Label>
                <Input
                  placeholder="Enter your roll number"
                  value={rollNumber}
                  onChange={(e) => setRollNumber(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label>University Name</Label>
                <Input
                  placeholder="Enter your university name"
                  value={university}
                  onChange={(e) => setUniversity(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label>Branch</Label>
                <Input
                  placeholder="e.g. Computer Science"
                  value={branch}
                  onChange={(e) => setBranch(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label>Year</Label>
                <Select value={year} onValueChange={setYear}>
                  <SelectTrigger className="h-11">
                    <SelectValue placeholder="Select your year" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="First Year">First Year</SelectItem>
                    <SelectItem value="Second Year">Second Year</SelectItem>
                    <SelectItem value="Third Year">Third Year</SelectItem>
                    <SelectItem value="Fourth Year">Fourth Year</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Your Course</Label>
                <Select value={courseCode} disabled>
                  <SelectTrigger className="h-11">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="PY101">
                      <span className="font-medium">PY101</span>
                      <span className="text-muted-foreground"> — Intro to Python</span>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }}>
                <Card className="border-primary/20 bg-primary/5">
                  <CardContent className="p-4">
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                        <BookOpen className="h-5 w-5" />
                      </div>
                      <div>
                        <p className="text-sm font-medium">{courseName}</p>
                        <p className="text-xs text-muted-foreground">Course Code: {courseCode}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>

              <div className="flex justify-between pt-2">
                <Button variant="ghost" onClick={() => navigate("/")}>
                  <ArrowLeft className="mr-2 h-4 w-4" /> Back
                </Button>
                <Button onClick={handleComplete} disabled={!isValid}>
                  Continue to Diagnostic <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </div>
            </motion.div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default StudentOnboarding;
