import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { useApp } from "@/contexts/AppContext";
import { mockCourse, mockSyllabusRecommendations, mockTopics } from "@/data/mockData";
import { SyllabusRecommendation } from "@/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Upload, FileText, Check, X, ArrowRight, Sparkles, BookOpen } from "lucide-react";

const CourseCreation = () => {
  const { setCurrentCourse } = useApp();
  const navigate = useNavigate();
  const [phase, setPhase] = useState<"create" | "syllabus" | "review" | "concepts">("create");
  const [courseName, setCourseName] = useState("");
  const [term, setTerm] = useState("");
  const [sections, setSections] = useState("");
  const [objectives, setObjectives] = useState("");
  const [syllabusUploaded, setSyllabusUploaded] = useState(false);
  const [materialsUploaded, setMaterialsUploaded] = useState(false);
  const [recommendations, setRecommendations] = useState<SyllabusRecommendation[]>(mockSyllabusRecommendations);

  const handleCreateCourse = () => {
    setPhase("syllabus");
  };

  const handleSyllabusUpload = () => {
    setSyllabusUploaded(true);
    setTimeout(() => setPhase("review"), 600);
  };

  const handleMaterialsUpload = () => {
    setMaterialsUploaded(true);
  };

  const toggleRecommendation = (id: string, accepted: boolean) => {
    setRecommendations((prev) =>
      prev.map((r) => (r.id === id ? { ...r, accepted } : r))
    );
  };

  const handleApproveAll = () => {
    setRecommendations((prev) => prev.map((r) => ({ ...r, accepted: true })));
  };

  const handleRejectAll = () => {
    setRecommendations((prev) => prev.map((r) => ({ ...r, accepted: false })));
  };

  const handleFinishReview = () => {
    setPhase("concepts");
  };

  const handleContinue = () => {
    setCurrentCourse({
      ...mockCourse,
      name: courseName || mockCourse.name,
      term: (term as any) || mockCourse.term,
      sections: sections ? sections.split(",").map((s) => s.trim()) : mockCourse.sections,
    });
    navigate("/teacher/courses/settings");
  };

  return (
    <div className="mx-auto max-w-4xl p-6">
      <div className="mb-8">
        <h1 className="font-heading text-3xl font-bold">Create Course</h1>
        <p className="text-muted-foreground">Set up your course, upload materials, and let AI help you build a comprehensive learning experience.</p>
      </div>

      {phase === "create" && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
          <Card>
            <CardHeader>
              <CardTitle>Course Details</CardTitle>
              <CardDescription>Enter the basic information for your course</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Course Name</Label>
                <Input placeholder="e.g., Operating Systems" value={courseName} onChange={(e) => setCourseName(e.target.value)} />
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
                <Label>Learning Objectives</Label>
                <textarea
                  className="flex min-h-[100px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  placeholder="Paste or type your learning objectives..."
                  value={objectives}
                  onChange={(e) => setObjectives(e.target.value)}
                />
              </div>
              <Button onClick={handleCreateCourse} disabled={!courseName || !term}>
                Continue to Syllabus <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </CardContent>
          </Card>
        </motion.div>
      )}

      {phase === "syllabus" && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><FileText className="h-5 w-5" /> Syllabus Upload</CardTitle>
              <CardDescription>Upload your syllabus for AI review and recommendations</CardDescription>
            </CardHeader>
            <CardContent>
              <div
                onClick={handleSyllabusUpload}
                className={`flex cursor-pointer flex-col items-center gap-3 rounded-lg border-2 border-dashed p-8 transition-colors ${
                  syllabusUploaded ? "border-primary/50 bg-primary/5" : "border-muted hover:border-primary/30 hover:bg-muted/50"
                }`}
              >
                {syllabusUploaded ? (
                  <>
                    <Check className="h-8 w-8 text-primary" />
                    <span className="text-sm font-medium text-primary">Syllabus uploaded — Analyzing...</span>
                  </>
                ) : (
                  <>
                    <Upload className="h-8 w-8 text-muted-foreground" />
                    <span className="text-sm text-muted-foreground">Click to upload PDF or DOC</span>
                    <span className="text-xs text-muted-foreground">or drag and drop</span>
                  </>
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><BookOpen className="h-5 w-5" /> Teaching Materials</CardTitle>
              <CardDescription>Upload slides, readings, problem sets, past exams</CardDescription>
            </CardHeader>
            <CardContent>
              <div
                onClick={handleMaterialsUpload}
                className={`flex cursor-pointer flex-col items-center gap-3 rounded-lg border-2 border-dashed p-8 transition-colors ${
                  materialsUploaded ? "border-primary/50 bg-primary/5" : "border-muted hover:border-primary/30 hover:bg-muted/50"
                }`}
              >
                {materialsUploaded ? (
                  <>
                    <Check className="h-8 w-8 text-primary" />
                    <span className="text-sm font-medium text-primary">Materials uploaded successfully</span>
                  </>
                ) : (
                  <>
                    <Upload className="h-8 w-8 text-muted-foreground" />
                    <span className="text-sm text-muted-foreground">Upload supplementary materials</span>
                  </>
                )}
              </div>
            </CardContent>
          </Card>
        </motion.div>
      )}

      {phase === "review" && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2"><Sparkles className="h-5 w-5 text-accent" /> AI Syllabus Review</CardTitle>
                  <CardDescription>We've analyzed your syllabus and have suggestions to improve it</CardDescription>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={handleApproveAll}>Approve All</Button>
                  <Button variant="ghost" size="sm" onClick={handleRejectAll}>Reject All</Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {recommendations.map((rec) => (
                <div key={rec.id} className={`rounded-lg border p-4 transition-colors ${rec.accepted === true ? "border-primary/30 bg-primary/5" : rec.accepted === false ? "opacity-50" : ""}`}>
                  <div className="mb-2 flex items-center justify-between">
                    <Badge variant="secondary">{rec.category}</Badge>
                    <div className="flex gap-1">
                      <button onClick={() => toggleRecommendation(rec.id, true)} className={`rounded-md p-1.5 transition-colors ${rec.accepted === true ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}>
                        <Check className="h-4 w-4" />
                      </button>
                      <button onClick={() => toggleRecommendation(rec.id, false)} className={`rounded-md p-1.5 transition-colors ${rec.accepted === false ? "bg-destructive text-destructive-foreground" : "hover:bg-muted"}`}>
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                  <p className="mb-1 text-sm text-muted-foreground line-through">{rec.original}</p>
                  <p className="text-sm font-medium">{rec.suggestion}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{rec.reason}</p>
                </div>
              ))}
              <Button onClick={handleFinishReview} className="mt-4">Continue to Concepts <ArrowRight className="ml-2 h-4 w-4" /></Button>
            </CardContent>
          </Card>
        </motion.div>
      )}

      {phase === "concepts" && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Course Knowledge Map</CardTitle>
              <CardDescription>Auto-extracted concepts organized by module. You can edit these.</CardDescription>
            </CardHeader>
            <CardContent>
              {["Module 1: Fundamentals", "Module 2: Memory", "Module 3: Storage", "Module 4: Concurrency"].map((mod) => (
                <div key={mod} className="mb-4">
                  <h3 className="mb-2 text-sm font-semibold text-foreground">{mod}</h3>
                  <div className="flex flex-wrap gap-2">
                    {mockTopics.filter((t) => t.module === mod).map((topic) => (
                      <Badge key={topic.id} variant={topic.confidence === "High" ? "default" : topic.confidence === "Medium" ? "secondary" : "outline"}>
                        {topic.name}
                        <span className="ml-1 text-[10px] opacity-70">{topic.confidence}</span>
                      </Badge>
                    ))}
                  </div>
                </div>
              ))}
              <Button onClick={handleContinue} className="mt-4">Configure AI TA Settings <ArrowRight className="ml-2 h-4 w-4" /></Button>
            </CardContent>
          </Card>
        </motion.div>
      )}
    </div>
  );
};

export default CourseCreation;