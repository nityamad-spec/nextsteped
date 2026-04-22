import { useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FileText, ClipboardList, ArrowLeft } from "lucide-react";
import FileUploadZone from "@/components/FileUploadZone";
import SetupModuleNav from "@/components/SetupModuleNav";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";

const SYLLABUS_ACCEPT = ".pdf,.docx";
const MATERIALS_ACCEPT =
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
    (location.state as any)?.courseId || localStorage.getItem("currentCourseId");

  const [syllabusFiles, setSyllabusFiles] = useState<UploadedFile[]>([]);
  const [lessonPlanFiles, setLessonPlanFiles] = useState<UploadedFile[]>([]);

  useEffect(() => {
    const fetchFiles = async () => {
      if (!user) return;
      let query = supabase
        .from("course_material_files")
        .select("file_name, file_size, storage_path, folder_type")
        .eq("teacher_id", user.id);
      if (courseId) query = query.eq("course_id", courseId);
      const { data } = await query;
      if (data) {
        const mapFile = (f: { file_name: string; file_size: number; storage_path: string }) => ({
          name: f.file_name, size: f.file_size, path: f.storage_path,
        });
        setSyllabusFiles(data.filter((f) => f.folder_type === "syllabus").map(mapFile));
        setLessonPlanFiles(data.filter((f) => f.folder_type === "lesson-plans").map(mapFile));
      }
    };
    fetchFiles();
  }, [user, courseId]);

  const handleNext = async () => {
    if (!user) return;
    let activeCourseId = courseId;

    // If a syllabus has been uploaded, the background parser writes JSON to
    // {uid}/syllabus/approved-syllabus.json. Back-fill courses.syllabus_json_path
    // for lazily-created courses so downstream concept extraction can read it.
    const expectedSyllabusJsonPath =
      syllabusFiles.length > 0 ? `${user.id}/syllabus/approved-syllabus.json` : null;

    const courseFields: Record<string, unknown> = {
      syllabus_uploaded: syllabusFiles.length > 0,
      materials_uploaded: lessonPlanFiles.length > 0,
    };

    if (activeCourseId) {
      // Only set syllabus_json_path if not already set by the background parser
      // (the parser already updates this field when it resolves a course id).
      if (expectedSyllabusJsonPath) {
        const { data: existing } = await supabase
          .from("courses")
          .select("syllabus_json_path")
          .eq("id", activeCourseId)
          .maybeSingle();
        if (!existing?.syllabus_json_path) {
          courseFields.syllabus_json_path = expectedSyllabusJsonPath;
        }
      }
      await supabase.from("courses").update(courseFields).eq("id", activeCourseId);
    } else {
      const { data: profile } = await supabase
        .from("profiles")
        .select("name, department")
        .eq("id", user.id)
        .maybeSingle();

      const draftName = profile?.department
        ? `${profile.department} Course (Draft)`
        : "Untitled Course (Draft)";

      if (expectedSyllabusJsonPath) {
        courseFields.syllabus_json_path = expectedSyllabusJsonPath;
      }

      const { data: created, error: createErr } = await supabase
        .from("courses")
        .insert({
          teacher_id: user.id,
          name: draftName,
          term: "First Semester",
          ...courseFields,
        })
        .select("id")
        .single();

      if (createErr || !created) {
        console.error("Failed to create draft course:", createErr);
        return;
      }
      activeCourseId = created.id;
      localStorage.setItem("currentCourseId", activeCourseId);
    }

    const allPaths = [
      ...syllabusFiles.map((f) => f.path),
      ...lessonPlanFiles.map((f) => f.path),
    ];
    if (allPaths.length > 0) {
      await supabase
        .from("course_material_files")
        .update({ course_id: activeCourseId })
        .in("storage_path", allPaths);
    }
  };

  const canContinue = syllabusFiles.length > 0;

  return (
    <div className="min-h-screen bg-background p-6 md:p-8">
      <div className="mx-auto max-w-3xl space-y-6">
        <div>
          <Button variant="outline" size="sm" onClick={() => navigate("/teacher/setup")} className="gap-2 mb-4">
            <ArrowLeft className="h-4 w-4" /> Back to Course Setup
          </Button>
          <h1 className="font-heading text-3xl font-bold">Upload Course Materials</h1>
          <p className="text-muted-foreground mt-1">
            Upload your syllabus and any supporting teaching materials.
          </p>
        </div>

        {/* Syllabus — Required */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-3">
              <CardTitle className="flex items-center gap-2 text-lg">
                <FileText className="h-5 w-5 text-primary" /> Syllabus
              </CardTitle>
              <Badge className="bg-destructive text-destructive-foreground hover:bg-destructive">Required</Badge>
            </div>
            <CardDescription>
              This is required to unlock Lesson Plan generation and align the AI TA to your course.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground mb-3">
              <strong>Accepted:</strong> PDF, DOCX
            </p>
            {user ? (
              <FileUploadZone
                folderPath={`${user.id}/syllabus`}
                accept={SYLLABUS_ACCEPT}
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

        {/* Optional Lesson Plans */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-3">
              <CardTitle className="flex items-center gap-2 text-lg">
                <ClipboardList className="h-5 w-5 text-primary" /> Past Course Materials & Teaching Resources
              </CardTitle>
              <Badge variant="secondary">Optional but Recommended</Badge>
            </div>
            <CardDescription>
              Upload anything from previous iterations of this course or related teaching that helps the AI understand how you teach. The more context you give it, the better it can support your students.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="list-disc list-inside mb-3 space-y-1 text-xs text-muted-foreground">
              <li><strong className="text-foreground">Past assessments:</strong> previous exams, quizzes, assignments, projects, problem sets</li>
              <li><strong className="text-foreground">Lecture materials:</strong> slide decks, lecture notes, handouts</li>
              <li><strong className="text-foreground">Lesson plans:</strong> existing weekly plans or schedules</li>
              <li><strong className="text-foreground">Reference material:</strong> reading lists, supplementary articles, sample solutions</li>
            </ul>
            <p className="text-xs text-muted-foreground mb-3">
              <strong>Accepted:</strong> PDF, PPTX, DOCX, TXT, CSV, images.
            </p>
            {user ? (
              <FileUploadZone
                folderPath={`${user.id}/lesson-plans`}
                accept={MATERIALS_ACCEPT}
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

        {!canContinue && (
          <p className="text-xs text-destructive text-center">
            Please upload your syllabus to continue.
          </p>
        )}

        <SetupModuleNav
          nextPath="/teacher/setup/concept-review"
          nextLabel="Next: Review Concepts"
          onNext={handleNext}
          nextDisabled={!canContinue}
        />
      </div>
    </div>
  );
};

export default CourseMaterials;
