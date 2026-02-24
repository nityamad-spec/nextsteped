import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { useApp } from "@/contexts/AppContext";
import { availableCourses, availableDepartments, mockCourse } from "@/data/mockData";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowRight, ArrowLeft, User, Upload, FileText, BookOpen, Check } from "lucide-react";

const TeacherOnboarding = () => {
  const { setTeacherProfile, setCurrentCourse } = useApp();
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [department, setDepartment] = useState("");
  const [courseCode, setCourseCode] = useState("");
  const [term, setTerm] = useState("");
  const [sections, setSections] = useState("");
  const [objectives, setObjectives] = useState("");
  const [syllabusUploaded, setSyllabusUploaded] = useState(false);
  const [materialsUploaded, setMaterialsUploaded] = useState(false);

  const isValid = name.trim() && department && courseCode && term && syllabusUploaded && materialsUploaded;

  const handleContinue = () => {
    const selectedCourse = availableCourses.find((c) => c.code === courseCode);
    setTeacherProfile({
      name,
      department,
      courses: selectedCourse ? [selectedCourse.name] : [],
    });
    setCurrentCourse({
      ...mockCourse,
      name: selectedCourse?.name || mockCourse.name,
      term: (term as any) || mockCourse.term,
      sections: sections ? sections.split(",").map((s) => s.trim()) : mockCourse.sections,
      objectives: objectives ? objectives.split("\n").filter(Boolean) : mockCourse.objectives,
    });
    navigate("/teacher/setup/syllabus");
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-8">
      <div className="w-full max-w-xl">
        <div className="mb-8 text-center">
          <h1 className="font-heading text-3xl font-bold">
            Welcome to Next<span className="text-primary">Step</span>
          </h1>
          <p className="mt-2 text-muted-foreground">Set up your profile, course, and upload materials</p>
        </div>

        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <User className="h-5 w-5" />
              </div>
              <div>
                <CardTitle>Professor Profile & Course Setup</CardTitle>
                <CardDescription>Your information, course details, and materials</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-5">
              <div className="space-y-2">
                <Label>Full Name</Label>
                <Input placeholder="Dr. Jane Smith" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
              </div>

              <div className="space-y-2">
                <Label>Department</Label>
                <Select value={department} onValueChange={setDepartment}>
                  <SelectTrigger><SelectValue placeholder="Select department" /></SelectTrigger>
                  <SelectContent>
                    {availableDepartments.map((d) => (
                      <SelectItem key={d} value={d}>{d}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Course</Label>
                <Select value={courseCode} onValueChange={setCourseCode}>
                  <SelectTrigger><SelectValue placeholder="Select course" /></SelectTrigger>
                  <SelectContent>
                    {availableCourses.map((c) => (
                      <SelectItem key={c.code} value={c.code}>{c.code} — {c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Term</Label>
                  <Select value={term} onValueChange={setTerm}>
                    <SelectTrigger><SelectValue placeholder="Select term" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="First Semester">First Semester</SelectItem>
                      <SelectItem value="Second Semester">Second Semester</SelectItem>
                      <SelectItem value="Summer Semester">Summer Semester</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Section(s)</Label>
                  <Input placeholder="Section A, Section B" value={sections} onChange={(e) => setSections(e.target.value)} />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Learning Objectives <span className="text-muted-foreground text-xs">(optional)</span></Label>
                <textarea
                  className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  placeholder="One objective per line..."
                  value={objectives}
                  onChange={(e) => setObjectives(e.target.value)}
                />
              </div>

              {/* Syllabus Upload */}
              <div className="space-y-2">
                <Label className="flex items-center gap-2"><FileText className="h-4 w-4" /> Syllabus & Guidelines Upload</Label>
                <p className="text-xs text-muted-foreground">Upload the following documents:</p>
                <ul className="text-xs text-muted-foreground list-disc pl-5 space-y-0.5">
                  <li>Course Syllabus</li>
                  <li>AICTE Guidelines</li>
                </ul>
                <div
                  onClick={() => setSyllabusUploaded(true)}
                  className={`flex cursor-pointer flex-col items-center gap-2 rounded-lg border-2 border-dashed p-6 transition-colors ${
                    syllabusUploaded ? "border-primary/50 bg-primary/5" : "border-muted hover:border-primary/30 hover:bg-muted/50"
                  }`}
                >
                  {syllabusUploaded ? (
                    <>
                      <Check className="h-6 w-6 text-primary" />
                      <span className="text-sm font-medium text-primary">Documents uploaded</span>
                    </>
                  ) : (
                    <>
                      <Upload className="h-6 w-6 text-muted-foreground" />
                      <span className="text-sm text-muted-foreground">Click to upload PDF or DOC</span>
                    </>
                  )}
                </div>
              </div>

              {/* Teaching Materials Upload */}
              <div className="space-y-2">
                <Label className="flex items-center gap-2"><BookOpen className="h-4 w-4" /> Teaching Materials</Label>
                <p className="text-xs text-muted-foreground">Upload your teaching materials:</p>
                <ul className="text-xs text-muted-foreground list-disc pl-5 space-y-0.5">
                  <li>Teaching Plans</li>
                  <li>Slides & Decks</li>
                  <li>Past Exams</li>
                  <li>Other Materials</li>
                </ul>
                <div
                  onClick={() => setMaterialsUploaded(true)}
                  className={`flex cursor-pointer flex-col items-center gap-2 rounded-lg border-2 border-dashed p-6 transition-colors ${
                    materialsUploaded ? "border-primary/50 bg-primary/5" : "border-muted hover:border-primary/30 hover:bg-muted/50"
                  }`}
                >
                  {materialsUploaded ? (
                    <>
                      <Check className="h-6 w-6 text-primary" />
                      <span className="text-sm font-medium text-primary">Materials uploaded</span>
                    </>
                  ) : (
                    <>
                      <Upload className="h-6 w-6 text-muted-foreground" />
                      <span className="text-sm text-muted-foreground">Click to upload files</span>
                    </>
                  )}
                </div>
              </div>

              <div className="flex justify-between pt-2">
                <Button variant="ghost" onClick={() => navigate("/")}>
                  <ArrowLeft className="mr-2 h-4 w-4" /> Back
                </Button>
                <Button onClick={handleContinue} disabled={!isValid}>
                  Continue to Teaching Plan Review <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </div>
            </motion.div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default TeacherOnboarding;
