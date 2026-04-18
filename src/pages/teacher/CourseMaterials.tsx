import { useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ArrowRight, ArrowLeft, BookOpen, ClipboardList, Calendar, FileText, GraduationCap } from "lucide-react";
import SetupProgressBar from "@/components/SetupProgressBar";
import FileUploadZone from "@/components/FileUploadZone";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";

const UPLOAD_ACCEPT =
  ".pdf,.pptx,.docx,.txt,.csv,.png,.jpg,.jpeg,.gif,.bmp,.webp";

interface UploadedFile {
  name: string;
  size: number;
  path: string;
}

const CourseMaterials = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const courseId =
    (location.state as any)?.courseId ||
    localStorage.getItem("currentCourseId");

  const [syllabusFiles, setSyllabusFiles] = useState<UploadedFile[]>([]);
  const [lessonPlanFiles, setLessonPlanFiles] = useState<UploadedFile[]>([]);
  const [materialsFiles, setMaterialsFiles] = useState<UploadedFile[]>([]);
  const [totalWeeks, setTotalWeeks] = useState("16");
  const [sessionsPerWeek, setSessionsPerWeek] = useState("2");
  const [sessionLength, setSessionLength] = useState("60");
  const [midtermWeek, setMidtermWeek] = useState("");
  const [finalWeek, setFinalWeek] = useState("");

  useEffect(() => {
    const fetchData = async () => {
      if (!user) return;

      if (courseId) {
        const { data: course } = await supabase
          .from("courses")
          .select("total_weeks, sessions_per_week, session_length_minutes, midterm_week, final_week")
          .eq("id", courseId)
          .maybeSingle();
        if (course) {
          if (course.total_weeks) setTotalWeeks(String(course.total_weeks));
          if (course.sessions_per_week) setSessionsPerWeek(String(course.sessions_per_week));
          if (course.session_length_minutes) setSessionLength(String(course.session_length_minutes));
          if (course.midterm_week) setMidtermWeek(String(course.midterm_week));
          if (course.final_week) setFinalWeek(String(course.final_week));
        }
      }

      let query = supabase
        .from("course_material_files")
        .select("file_name, file_size, storage_path, folder_type")
        .eq("teacher_id", user.id);
      if (courseId) query = query.eq("course_id", courseId);
      const { data } = await query;
      if (data) {
        const mapFile = (f: { file_name: string; file_size: number; storage_path: string }) => ({
          name: f.file_name,
          size: f.file_size,
          path: f.storage_path,
        });
        setSyllabusFiles(data.filter((f) => f.folder_type === "syllabus").map(mapFile));
        setLessonPlanFiles(data.filter((f) => f.folder_type === "lesson-plans").map(mapFile));
        setMaterialsFiles(data.filter((f) => f.folder_type === "materials").map(mapFile));
      }
    };
    fetchData();
  }, [user, courseId]);

  const handleContinue = async () => {
    if (courseId && user) {
      const weeks = parseInt(totalWeeks) || 16;
      const midParsed = midtermWeek ? parseInt(midtermWeek) : null;
      const finParsed = finalWeek ? parseInt(finalWeek) : null;

      await supabase
        .from("courses")
        .update({
          total_weeks: weeks,
          sessions_per_week: parseInt(sessionsPerWeek) || 2,
          session_length_minutes: parseInt(sessionLength) || 60,
          midterm_week: midParsed && midParsed > 0 && midParsed <= weeks ? midParsed : null,
          final_week: finParsed && finParsed > 0 && finParsed <= weeks ? finParsed : null,
          syllabus_uploaded: syllabusFiles.length > 0,
          materials_uploaded: materialsFiles.length > 0 || lessonPlanFiles.length > 0,
        })
        .eq("id", courseId);

      const allPaths = [
        ...syllabusFiles.map((f) => f.path),
        ...lessonPlanFiles.map((f) => f.path),
        ...materialsFiles.map((f) => f.path),
      ];
      if (allPaths.length > 0) {
        await supabase
          .from("course_material_files")
          .update({ course_id: courseId })
          .in("storage_path", allPaths);
      }
    }

    // Force regeneration on entry to lesson plan page
    localStorage.removeItem("lessonPlanDays");
    localStorage.removeItem("lessonPlanPhase");
    if (user) {
      const draftKey = `lessonPlanDraft:${courseId || user.id}`;
      localStorage.removeItem(draftKey);
      localStorage.removeItem("lessonPlanDraft");
    }

    navigate("/teacher/setup/lesson-plan");
  };

  const totalWeeksNum = parseInt(totalWeeks) || 16;
  const canContinue = syllabusFiles.length > 0 || lessonPlanFiles.length > 0;

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-8">
      <div className="w-full max-w-3xl">
        <SetupProgressBar currentStep={2} />

        <div className="mb-8 text-center">
          <h1 className="font-heading text-3xl font-bold">
            Course <span className="text-primary">Materials</span>
          </h1>
          <p className="mt-2 text-muted-foreground">
            Upload your syllabus, lesson plans, and supporting materials. Set your schedule and exam weeks. The AI will use all of this to generate your lesson plan in the next step.
          </p>
        </div>

        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Calendar className="h-5 w-5 text-primary" /> Course Schedule & Exams
            </CardTitle>
            <CardDescription>
              Define your course structure and when exams happen. This informs the AI-generated lesson plan.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Weeks of Class</Label>
                <Input type="number" min="1" max="52" value={totalWeeks} onChange={(e) => setTotalWeeks(e.target.value)} placeholder="16" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Sessions per Week</Label>
                <Input type="number" min="1" max="7" value={sessionsPerWeek} onChange={(e) => setSessionsPerWeek(e.target.value)} placeholder="2" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Session Length (min)</Label>
                <Input type="number" min="15" max="300" step="15" value={sessionLength} onChange={(e) => setSessionLength(e.target.value)} placeholder="60" />
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2 pt-2 border-t">
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground flex items-center gap-1.5">
                  <GraduationCap className="h-3.5 w-3.5" /> Midterm Exam Week (optional)
                </Label>
                <Input
                  type="number"
                  min="1"
                  max={totalWeeksNum}
                  value={midtermWeek}
                  onChange={(e) => setMidtermWeek(e.target.value)}
                  placeholder={`e.g. ${Math.floor(totalWeeksNum / 2)}`}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground flex items-center gap-1.5">
                  <GraduationCap className="h-3.5 w-3.5" /> Final Exam Week (optional)
                </Label>
                <Input
                  type="number"
                  min="1"
                  max={totalWeeksNum}
                  value={finalWeek}
                  onChange={(e) => setFinalWeek(e.target.value)}
                  placeholder={`e.g. ${totalWeeksNum}`}
                />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <FileText className="h-5 w-5 text-primary" /> Upload Syllabus
            </CardTitle>
            <CardDescription>
              Upload your course syllabus. The AI will use it as the structural skeleton for your lesson plan.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-xs text-muted-foreground">
              <strong>Recommended:</strong> PDF, DOCX, or TXT for best results.
            </p>
            {user ? (
              <FileUploadZone
                folderPath={`${user.id}/syllabus`}
                accept={UPLOAD_ACCEPT}
                files={syllabusFiles}
                onFilesChange={setSyllabusFiles}
                teacherId={user.id}
                folderType="syllabus"
                courseId={courseId}
              />
            ) : (
              <div className="flex items-center justify-center rounded-lg border-2 border-dashed p-6 text-sm text-muted-foreground">
                Preparing upload area…
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <ClipboardList className="h-5 w-5 text-primary" /> Upload Lesson Plans
            </CardTitle>
            <CardDescription>
              These files are the <strong>primary source</strong> for the AI lesson plan. Upload existing weekly schedules, course outlines, or topic breakdowns.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-xs text-muted-foreground">
              <strong>Recommended:</strong> PDF, PPTX, DOCX for best results. Scans/images may reduce accuracy.
            </p>
            {user ? (
              <FileUploadZone
                folderPath={`${user.id}/lesson-plans`}
                accept={UPLOAD_ACCEPT}
                files={lessonPlanFiles}
                onFilesChange={setLessonPlanFiles}
                teacherId={user.id}
                folderType="lesson-plans"
                courseId={courseId}
              />
            ) : (
              <div className="flex items-center justify-center rounded-lg border-2 border-dashed p-6 text-sm text-muted-foreground">
                Preparing upload area…
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <BookOpen className="h-5 w-5 text-primary" /> Upload Course Materials
            </CardTitle>
            <CardDescription>
              Past exams, quizzes, homework, projects, lecture slides, and handouts. Used as supporting context for the AI and to power student exam practice mode.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
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
                courseId={courseId}
              />
            ) : (
              <div className="flex items-center justify-center rounded-lg border-2 border-dashed p-6 text-sm text-muted-foreground">
                Preparing upload area…
              </div>
            )}
          </CardContent>
        </Card>

        <div className="flex justify-center gap-3">
          <Button variant="outline" onClick={() => navigate("/teacher/onboarding")}>
            <ArrowLeft className="mr-2 h-4 w-4" /> Back to Profile
          </Button>
          <Button onClick={handleContinue} disabled={!canContinue} size="lg">
            Generate Lesson Plan <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
};

export default CourseMaterials;
