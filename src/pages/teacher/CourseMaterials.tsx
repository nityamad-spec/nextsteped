import { useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { ArrowRight, ArrowLeft, BookOpen, ClipboardList } from "lucide-react";
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

  const [lessonPlanFiles, setLessonPlanFiles] = useState<UploadedFile[]>([]);
  const [materialsFiles, setMaterialsFiles] = useState<UploadedFile[]>([]);

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
        const mapFile = (f: {
          file_name: string;
          file_size: number;
          storage_path: string;
        }) => ({
          name: f.file_name,
          size: f.file_size,
          path: f.storage_path,
        });
        setLessonPlanFiles(
          data.filter((f) => f.folder_type === "lesson-plans").map(mapFile)
        );
        setMaterialsFiles(
          data.filter((f) => f.folder_type === "materials").map(mapFile)
        );
      }
    };
    fetchFiles();
  }, [user, courseId]);

  const handleContinue = async () => {
    if (courseId && user) {
      const allPaths = [
        ...lessonPlanFiles.map((f) => f.path),
        ...materialsFiles.map((f) => f.path),
      ];
      if (allPaths.length > 0) {
        await supabase
          .from("course_material_files")
          .update({ course_id: courseId })
          .in("storage_path", allPaths);
      }
      await supabase
        .from("courses")
        .update({ materials_uploaded: materialsFiles.length > 0 } as any)
        .eq("id", courseId);
    }
    navigate("/teacher/setup/lesson-plan");
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-8">
      <div className="w-full max-w-3xl">
        <SetupProgressBar currentStep={4} />

        <div className="mb-8 text-center">
          <h1 className="font-heading text-3xl font-bold">
            Course <span className="text-primary">Materials</span>
          </h1>
          <p className="mt-2 text-muted-foreground">
            Upload your lesson plans and course materials. These help the AI
            generate a tailored lesson plan in the next step.
          </p>
        </div>

        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <ClipboardList className="h-5 w-5 text-primary" /> Upload Lesson
              Plans
            </CardTitle>
            <CardDescription>
              These files help us understand the structure of your course's
              topics over the semester and each class or weekly topic covered,
              guiding your instruction plan.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-xs text-muted-foreground">
              <strong>Recommended:</strong> PDF, PPTX, DOCX for best results.
              Scans/images may reduce accuracy.
            </p>
            <p className="text-xs text-muted-foreground">
              <strong>Accepted:</strong> PDF, PPTX, DOCX, TXT, CSV, images
              (PNG, JPG, JPEG, GIF, BMP, WEBP).
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
              <BookOpen className="h-5 w-5 text-primary" /> Upload Course
              Materials
            </CardTitle>
            <CardDescription>
              Upload materials used in your course — including past exams,
              quizzes, homework assignments, projects, lecture slides, and
              handouts. Past assessments are especially valuable as they help
              power the AI-driven exam practice mode for students.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-xs text-muted-foreground">
              <strong>Recommended:</strong> PDF, PPTX, DOCX for best results.
              Scans/images may reduce accuracy.
            </p>
            <p className="text-xs text-muted-foreground">
              <strong>Accepted:</strong> PDF, PPTX, DOCX, TXT, CSV, images
              (PNG, JPG, JPEG, GIF, BMP, WEBP).
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
          <Button
            variant="outline"
            onClick={() => navigate("/teacher/setup/concepts")}
          >
            <ArrowLeft className="mr-2 h-4 w-4" /> Back to Concepts
          </Button>
          <Button
            onClick={handleContinue}
            disabled={lessonPlanFiles.length === 0}
            size="lg"
          >
            Continue to Lesson Plan <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
};

export default CourseMaterials;
