import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { useApp } from "@/contexts/AppContext";
import { useAuth } from "@/contexts/AuthContext";
import { availableDepartments, mockCourse } from "@/data/mockData";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose } from "@/components/ui/dialog";
import { ArrowRight, ArrowLeft, User, FileText, BookOpen, Plus, Info, HelpCircle, X, Lock } from "lucide-react";
import SetupProgressBar from "@/components/SetupProgressBar";
import FileUploadZone from "@/components/FileUploadZone";
import { toast } from "sonner";

const UPLOAD_ACCEPT = ".pdf,.pptx,.docx,.txt,.csv,.png,.jpg,.jpeg,.gif,.bmp,.webp";

const bestPracticeStandards = [
  { format: "Slides (PPTX)", tips: "Use clear headings per slide, limit to 6 bullet points, include visuals/diagrams, add speaker notes for context." },
  { format: "Documents (DOCX/PDF)", tips: "Use structured headings (H1-H3), number sections, include a table of contents for long docs, cite sources." },
  { format: "Exams / Problem Sets", tips: "Clearly state point values, group by topic/difficulty, provide a rubric or answer key, include time estimates." },
  { format: "General", tips: "Use consistent naming conventions, remove personal/sensitive data, ensure accessibility (alt text, readable fonts)." },
];

interface UploadedFile {
  name: string;
  size: number;
  path: string;
}

const TeacherOnboarding = () => {
  const { setTeacherProfile, setCurrentCourse } = useApp();
  const { user } = useAuth();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
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
  const [syllabusFiles, setSyllabusFiles] = useState<UploadedFile[]>([]);
  const [materialsFiles, setMaterialsFiles] = useState<UploadedFile[]>([]);
  const [lessonPlanFiles, setLessonPlanFiles] = useState<UploadedFile[]>([]);
  const [showUploadInfo, setShowUploadInfo] = useState(false);
  const [showBestPractice, setShowBestPractice] = useState(false);

  useEffect(() => {
    if (!user) return;
    const fetchExistingData = async () => {
      setLoading(true);
      const [profileRes, courseRes, filesRes] = await Promise.all([
        supabase.from("profiles").select("name, department, graduation_year").eq("id", user.id).maybeSingle(),
        supabase.from("courses").select("branch, term, sections, objectives").eq("teacher_id", user.id).order("created_at", { ascending: false }).limit(1).maybeSingle(),
        supabase.from("course_material_files").select("file_name, file_size, storage_path, folder_type").eq("teacher_id", user.id),
      ]);

      if (profileRes.data) {
        if (profileRes.data.name) setName(profileRes.data.name);
        if (profileRes.data.department) setDepartment(profileRes.data.department);
        if (profileRes.data.graduation_year) setStudentYear(profileRes.data.graduation_year);
      }

      if (courseRes.data) {
        if (courseRes.data.branch) setBranch(courseRes.data.branch);
        if (courseRes.data.term) setTerm(courseRes.data.term);
        if (courseRes.data.sections) setSections(courseRes.data.sections as string[]);
        if (courseRes.data.objectives) setObjectives((courseRes.data.objectives as string[]).join("\n"));
      }

      if (filesRes.data) {
        const mapFile = (f: { file_name: string; file_size: number; storage_path: string }) => ({
          name: f.file_name,
          size: f.file_size,
          path: f.storage_path,
        });
        setSyllabusFiles(filesRes.data.filter((f) => f.folder_type === "syllabus").map(mapFile));
        setMaterialsFiles(filesRes.data.filter((f) => f.folder_type === "materials").map(mapFile));
        setLessonPlanFiles(filesRes.data.filter((f) => f.folder_type === "lesson-plans").map(mapFile));
      }

      setLoading(false);
    };
    fetchExistingData();
  }, [user]);

  const isValid =
    name.trim() &&
    department &&
    sections.length > 0 &&
    term &&
    branch.trim() &&
    studentYear &&
    objectives.trim() &&
    syllabusFiles.length > 0;

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

  const handleContinue = async () => {
    if (!user) return;

    // Ensure teacher profile exists before creating course
    const { data: existingProfile } = await supabase
      .from("profiles")
      .select("id")
      .eq("id", user.id)
      .maybeSingle();

    if (!existingProfile) {
      const { error: profileError } = await supabase.from("profiles").insert({
        id: user.id,
        name,
        role: "teacher",
        department,
      });
      if (profileError) {
        toast.error("Failed to save profile: " + profileError.message);
        return;
      }
    }

    // Create the course record in the database
    const { data: courseData, error } = await supabase.from("courses").insert({
      teacher_id: user.id,
      name: courseName,
      branch,
      term,
      sections,
      objectives: objectives.split("\n").filter(Boolean),
      syllabus_uploaded: syllabusFiles.length > 0,
      materials_uploaded: materialsFiles.length > 0,
    }).select("id").single();

    if (error || !courseData) {
      toast.error("Failed to save course: " + (error?.message ?? "Unknown error"));
      return;
    }

    // Backfill course_id on all uploaded file metadata rows
    const allPaths = [
      ...syllabusFiles.map((f) => f.path),
      ...materialsFiles.map((f) => f.path),
      ...lessonPlanFiles.map((f) => f.path),
    ];
    if (allPaths.length > 0) {
      await supabase
        .from("course_material_files")
        .update({ course_id: courseData.id })
        .in("storage_path", allPaths);
    }

    setTeacherProfile({ name, department, courses: [courseName] });
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
                <Label>Learning Objectives</Label>
                <textarea
                  className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  placeholder="One objective per line..."
                  value={objectives}
                  onChange={(e) => setObjectives(e.target.value)}
                />
              </div>

              {/* Syllabus Upload */}
              <div className="space-y-2">
                <Label className="flex items-center gap-2"><FileText className="h-4 w-4" /> Upload Syllabus & Guidelines</Label>
                <p className="text-xs text-muted-foreground">Upload your course syllabus and AICTE guidelines.</p>
                <p className="text-xs text-muted-foreground">
                  <strong>Recommended:</strong> PDF, PPTX, DOCX for best results. Scans/images may reduce accuracy.
                </p>
                <p className="text-xs text-muted-foreground">
                  <strong>Accepted:</strong> PDF, PPTX, DOCX, TXT, CSV, images (PNG, JPG, JPEG, GIF, BMP, WEBP).
                </p>
                {user ? (
                  <FileUploadZone
                    folderPath={`${user.id}/syllabus`}
                    accept={UPLOAD_ACCEPT}
                    files={syllabusFiles}
                    onFilesChange={setSyllabusFiles}
                    teacherId={user.id}
                    folderType="syllabus"
                  />
                ) : (
                  <div className="flex items-center justify-center rounded-lg border-2 border-dashed p-6 text-sm text-muted-foreground">
                    Preparing upload area…
                  </div>
                )}
              </div>

              {/* Student-Facing Materials Upload */}
              <div className="space-y-2">
                <Label className="flex items-center gap-2"><BookOpen className="h-4 w-4" /> Upload Course Materials <span className="text-[10px] font-normal text-muted-foreground">(Student-Facing · Optional)</span></Label>
                <p className="text-xs text-muted-foreground">
                  These materials will be used to understand the curriculum and power the AI Teaching Assistant for students.
                </p>
                <p className="text-xs text-muted-foreground">
                  <strong>Recommended:</strong> PDF, PPTX, DOCX for best results. Scans/images may reduce accuracy.
                </p>
                <p className="text-xs text-muted-foreground">
                  <strong>Accepted:</strong> PDF, PPTX, DOCX, TXT, CSV, images (PNG, JPG, JPEG, GIF, BMP, WEBP).
                </p>
                {user ? (
                  <FileUploadZone
                    folderPath={`${user.id}/materials`}
                    accept={UPLOAD_ACCEPT}
                    files={materialsFiles}
                    onFilesChange={setMaterialsFiles}
                    teacherId={user.id}
                    folderType="materials"
                  />
                ) : (
                  <div className="flex items-center justify-center rounded-lg border-2 border-dashed p-6 text-sm text-muted-foreground">
                    Preparing upload area…
                  </div>
                )}

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

              {/* Teacher Lesson Plans Upload (Internal) */}
              <div className="space-y-2">
                <Label className="flex items-center gap-2"><Lock className="h-4 w-4" /> Upload Lesson Plans <span className="text-[10px] font-normal text-muted-foreground">(Internal · Optional)</span></Label>
                <p className="text-xs text-muted-foreground">
                  These files help us understand the structure of your course's topics over the semester and each class or weekly topic covered, guiding your instruction plan.
                </p>
                <p className="text-xs text-muted-foreground">
                  <strong>Recommended:</strong> PDF, PPTX, DOCX for best results. Scans/images may reduce accuracy.
                </p>
                <p className="text-xs text-muted-foreground">
                  <strong>Accepted:</strong> PDF, PPTX, DOCX, TXT, CSV, images (PNG, JPG, JPEG, GIF, BMP, WEBP).
                </p>
                {user ? (
                  <FileUploadZone
                    folderPath={`${user.id}/lesson-plans`}
                    accept={UPLOAD_ACCEPT}
                    files={lessonPlanFiles}
                    onFilesChange={setLessonPlanFiles}
                    teacherId={user.id}
                    folderType="lesson-plans"
                  />
                ) : (
                  <div className="flex items-center justify-center rounded-lg border-2 border-dashed p-6 text-sm text-muted-foreground">
                    Preparing upload area…
                  </div>
                )}
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
                <span className="mt-0.5 shrink-0 text-primary">✓</span>
                <span>We use your uploads to generate teaching plans and ground the Student TA.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-0.5 shrink-0 text-primary">✓</span>
                <span>You can remove files anytime.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-0.5 shrink-0 text-primary">✓</span>
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
