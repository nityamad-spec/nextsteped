import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { useApp } from "@/contexts/AppContext";
import { availableDepartments, mockCourse } from "@/data/mockData";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose } from "@/components/ui/dialog";
import { ArrowRight, ArrowLeft, User, Upload, FileText, BookOpen, Check, X, Plus, Info, HelpCircle } from "lucide-react";
import SetupProgressBar from "@/components/SetupProgressBar";

const bestPracticeStandards = [
  { format: "Slides (PPTX)", tips: "Use clear headings per slide, limit to 6 bullet points, include visuals/diagrams, add speaker notes for context." },
  { format: "Documents (DOCX/PDF)", tips: "Use structured headings (H1-H3), number sections, include a table of contents for long docs, cite sources." },
  { format: "Exams / Problem Sets", tips: "Clearly state point values, group by topic/difficulty, provide a rubric or answer key, include time estimates." },
  { format: "General", tips: "Use consistent naming conventions, remove personal/sensitive data, ensure accessibility (alt text, readable fonts)." },
];

const TeacherOnboarding = () => {
  const { setTeacherProfile, setCurrentCourse } = useApp();
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [department, setDepartment] = useState("");
  const courseCode = "PY101";
  const courseName = "Intro to Python";
  const [sections, setSections] = useState<string[]>([]);
  const [sectionInput, setSectionInput] = useState("");
  const [term, setTerm] = useState("");
  const [branch, setBranch] = useState("");
  const [studentYear, setStudentYear] = useState("");
  const [objectives, setObjectives] = useState("");
  const [syllabusUploaded, setSyllabusUploaded] = useState(false);
  const [materialsUploaded, setMaterialsUploaded] = useState(false);
  const [showUploadInfo, setShowUploadInfo] = useState(false);
  const [showBestPractice, setShowBestPractice] = useState(false);

  const isValid = name.trim() && department && sections.length > 0 && term && branch.trim() && studentYear && objectives.trim() && syllabusUploaded && materialsUploaded;

  const addSection = () => {
    const trimmed = sectionInput.trim();
    if (trimmed && !sections.includes(trimmed)) {
      setSections((prev) => [...prev, trimmed]);
      setSectionInput("");
    }
  };

  const removeSection = (s: string) => {
    setSections((prev) => prev.filter((sec) => sec !== s));
  };

  const handleContinue = () => {
    setTeacherProfile({
      name,
      department,
      courses: [courseName],
    });
    setCurrentCourse({
      ...mockCourse,
      name: courseName,
      branch,
      term: (term as any) || mockCourse.term,
      sections: sections.length > 0 ? sections : mockCourse.sections,
      objectives: objectives ? objectives.split("\n").filter(Boolean) : mockCourse.objectives,
    });
    navigate("/teacher/setup/quality-check");
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-8">
      <div className="w-full max-w-xl">
        <SetupProgressBar currentStep={1} />
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
                <Select value={courseCode} disabled>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="PY101">PY101 — Intro to Python</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Section(s)</Label>
                <div className="flex gap-2">
                  <Input
                    placeholder="e.g. Section A"
                    value={sectionInput}
                    onChange={(e) => setSectionInput(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addSection(); } }}
                  />
                  <Button type="button" variant="outline" size="icon" onClick={addSection} disabled={!sectionInput.trim()}>
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
                {sections.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {sections.map((s) => (
                      <Badge key={s} variant="secondary" className="gap-1">
                        {s}
                        <button onClick={() => removeSection(s)} className="ml-0.5 hover:text-destructive">
                          <X className="h-3 w-3" />
                        </button>
                      </Badge>
                    ))}
                  </div>
                )}
                <p className="text-[11px] text-muted-foreground">For each section you teach, add them separately.</p>
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
                  <Label>Branch</Label>
                  <Input placeholder="e.g. Computer Science & Engineering" value={branch} onChange={(e) => setBranch(e.target.value)} />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Graduation Year</Label>
                <Select value={studentYear} onValueChange={setStudentYear}>
                  <SelectTrigger><SelectValue placeholder="Select graduation year" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="2027">2027</SelectItem>
                    <SelectItem value="2028">2028</SelectItem>
                    <SelectItem value="2029">2029</SelectItem>
                    <SelectItem value="2030">2030</SelectItem>
                    <SelectItem value="2031">2031</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Learning Objectives <span className="text-destructive">*</span></Label>
                <textarea
                  className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  placeholder="One objective per line..."
                  value={objectives}
                  onChange={(e) => setObjectives(e.target.value)}
                />
              </div>

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

              <div className="space-y-2">
                <Label className="flex items-center gap-2"><BookOpen className="h-4 w-4" /> Upload Course Materials</Label>
                <p className="text-xs text-muted-foreground">
                  <strong>Recommended:</strong> PDF, PPTX, DOCX for best results. Scans/images may reduce accuracy.
                </p>
                <p className="text-xs text-muted-foreground">
                  <strong>Accepted:</strong> PDF, PPTX, DOCX, TXT, CSV, images (and more).
                </p>
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

                <button
                  onClick={() => setShowUploadInfo(true)}
                  className="flex items-center gap-1 text-xs text-primary hover:underline"
                >
                  <HelpCircle className="h-3 w-3" /> What happens to my uploads?
                </button>

                <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 mt-2">
                  <button
                    onClick={() => setShowBestPractice(!showBestPractice)}
                    className="flex items-center gap-2 w-full text-left"
                  >
                    <Info className="h-4 w-4 text-primary shrink-0" />
                    <div className="flex-1">
                      <p className="text-xs font-medium text-foreground">Best Practice Format Standards</p>
                      <p className="text-[11px] text-muted-foreground">Recommended formatting guidelines for your materials</p>
                    </div>
                  </button>
                  {showBestPractice && (
                    <div className="mt-3 space-y-2 border-t pt-3">
                      {bestPracticeStandards.map((bp, i) => (
                        <div key={i} className="rounded-md bg-background p-2.5">
                          <p className="text-xs font-medium text-foreground">{bp.format}</p>
                          <p className="text-[11px] text-muted-foreground mt-0.5">{bp.tips}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div className="flex justify-between pt-2">
                <Button variant="ghost" onClick={() => navigate("/")}>
                  <ArrowLeft className="mr-2 h-4 w-4" /> Back
                </Button>
                <Button onClick={handleContinue} disabled={!isValid}>
                  Continue to Quality Check <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </div>
            </motion.div>
          </CardContent>
        </Card>

        <Dialog open={showUploadInfo} onOpenChange={setShowUploadInfo}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>How uploads are used</DialogTitle>
              <DialogDescription>Your materials help power the AI Teaching Assistant</DialogDescription>
            </DialogHeader>
            <ul className="space-y-3 text-sm">
              <li className="flex items-start gap-2">
                <Check className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                <span>We use your uploads to generate teaching plans and ground the Student TA.</span>
              </li>
              <li className="flex items-start gap-2">
                <Check className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                <span>You can remove files anytime.</span>
              </li>
              <li className="flex items-start gap-2">
                <Check className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                <span>Generated content can include suggestions beyond uploads; those will be labeled.</span>
              </li>
            </ul>
            <DialogFooter>
              <DialogClose asChild>
                <Button>Got it</Button>
              </DialogClose>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
};

export default TeacherOnboarding;
