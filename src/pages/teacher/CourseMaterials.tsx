import { useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FileText, ClipboardList, ArrowLeft, Loader2, BookOpen, Youtube, Trash2, ExternalLink } from "lucide-react";
import FileUploadZone from "@/components/FileUploadZone";
import SetupModuleNav from "@/components/SetupModuleNav";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

const SYLLABUS_ACCEPT = ".pdf,.docx";
const LESSON_PLAN_ACCEPT = ".pdf,.docx,.txt";
const YOUTUBE_LINKS_ACCEPT = ".pdf,.docx,.txt,.csv";
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
  const initialCourseId =
    (location.state as any)?.courseId || localStorage.getItem("currentCourseId");

  const [courseId, setCourseId] = useState<string | null>(initialCourseId);
  const [resolvingCourse, setResolvingCourse] = useState(true);
  const [syllabusFiles, setSyllabusFiles] = useState<UploadedFile[]>([]);
  const [lessonPlanDocFiles, setLessonPlanDocFiles] = useState<UploadedFile[]>([]);
  const [youtubeLinkFiles, setYoutubeLinkFiles] = useState<UploadedFile[]>([]);
  const [lessonPlanFiles, setLessonPlanFiles] = useState<UploadedFile[]>([]);
  const [syllabusParseStatus, setSyllabusParseStatus] = useState<Record<string, "parsing" | "parsed" | "failed">>({});
  const [syllabusJsonInStorage, setSyllabusJsonInStorage] = useState(false);

  // Storage paths are course-scoped, so we must have a course row before any
  // upload is allowed. Resolve (or eagerly create) one on mount.
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      setResolvingCourse(true);

      // 1. Validate any cached course id
      if (courseId) {
        const { data } = await supabase
          .from("courses")
          .select("id")
          .eq("id", courseId)
          .maybeSingle();
        if (cancelled) return;
        if (data?.id) { setResolvingCourse(false); return; }
        localStorage.removeItem("currentCourseId");
        setCourseId(null);
      }

      // 2. Reuse the teacher's most recent owned course
      const { data: existing } = await supabase
        .from("courses")
        .select("id")
        .eq("teacher_id", user.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (cancelled) return;
      if (existing?.id) {
        setCourseId(existing.id);
        localStorage.setItem("currentCourseId", existing.id);
        setResolvingCourse(false);
        return;
      }

      // 3. Create a draft course so uploads have a courseId-scoped folder.
      const { data: profile } = await supabase
        .from("profiles")
        .select("name, department")
        .eq("id", user.id)
        .maybeSingle();
      const draftName = profile?.department
        ? `${profile.department} Course (Draft)`
        : "Untitled Course (Draft)";
      const { data: created, error: createErr } = await supabase
        .from("courses")
        .insert({
          teacher_id: user.id,
          name: draftName,
          term: "First Semester",
        })
        .select("id")
        .single();
      if (cancelled) return;
      if (createErr || !created) {
        console.error("Failed to create draft course:", createErr);
        setResolvingCourse(false);
        return;
      }
      setCourseId(created.id);
      localStorage.setItem("currentCourseId", created.id);
      setResolvingCourse(false);
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  useEffect(() => {
    const fetchFiles = async () => {
      if (!user || !courseId) return;
      const { data } = await supabase
        .from("course_material_files")
        .select("file_name, file_size, storage_path, folder_type")
        .eq("course_id", courseId);
      if (data) {
        const mapFile = (f: { file_name: string; file_size: number; storage_path: string }) => ({
          name: f.file_name, size: f.file_size, path: f.storage_path,
        });
        setSyllabusFiles(data.filter((f) => f.folder_type === "syllabus").map(mapFile));
        setLessonPlanDocFiles(data.filter((f) => f.folder_type === "lesson-plan-docs").map(mapFile));
        setYoutubeLinkFiles(data.filter((f) => f.folder_type === "youtube-links").map(mapFile));
        setLessonPlanFiles(data.filter((f) => f.folder_type === "lesson-plans").map(mapFile));
      }
    };
    fetchFiles();
  }, [user, courseId]);

  // Verify the parsed syllabus JSON exists in storage. Re-runs when parse
  // statuses change so a fresh parse flips the gate without a reload.
  useEffect(() => {
    if (!courseId) { setSyllabusJsonInStorage(false); return; }
    let cancelled = false;
    (async () => {
      const { data } = await supabase.storage
        .from("course-materials")
        .list(`${courseId}/syllabus`, { search: "approved-syllabus.json", limit: 1 });
      if (cancelled) return;
      setSyllabusJsonInStorage(!!data && data.some((f) => f.name === "approved-syllabus.json"));
    })();
    return () => { cancelled = true; };
  }, [courseId, syllabusParseStatus]);

  const handleNext = async () => {
    if (!user || !courseId) return;

    // Background syllabus parser writes JSON to {courseId}/syllabus/approved-syllabus.json
    // and updates courses.syllabus_json_path itself. We only need to flip the
    // boolean flags here for downstream UI; if the parser hasn't finished,
    // fall back to the canonical path so concept extraction still has a target.
    const expectedSyllabusJsonPath =
      syllabusFiles.length > 0 ? `${courseId}/syllabus/approved-syllabus.json` : null;

    const courseFields: {
      syllabus_uploaded: boolean;
      materials_uploaded: boolean;
      syllabus_json_path?: string;
    } = {
      syllabus_uploaded: syllabusFiles.length > 0,
      materials_uploaded: lessonPlanFiles.length > 0,
    };

    if (expectedSyllabusJsonPath) {
      const { data: existing } = await supabase
        .from("courses")
        .select("syllabus_json_path")
        .eq("id", courseId)
        .maybeSingle();
      if (!existing?.syllabus_json_path) {
        courseFields.syllabus_json_path = expectedSyllabusJsonPath;
      }
    }
    await supabase.from("courses").update(courseFields).eq("id", courseId);
  };

  const hasSyllabus = syllabusFiles.length > 0;
  const syllabusStatuses = syllabusFiles.map((f) => syllabusParseStatus[f.path]);
  const anyParsed = syllabusStatuses.some((s) => s === "parsed");
  const allFailed = hasSyllabus && syllabusStatuses.every((s) => s === "failed");
  const canContinue = hasSyllabus && (anyParsed || syllabusJsonInStorage);

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
            {user && courseId ? (
              <FileUploadZone
                folderPath={`${courseId}/syllabus`}
                accept={SYLLABUS_ACCEPT}
                files={syllabusFiles}
                onFilesChange={setSyllabusFiles}
                courseId={courseId}
                teacherId={user.id}
                folderType="syllabus"
                maxFiles={1}
                onParseStatusChange={setSyllabusParseStatus}
              />
            ) : (
              <div className="flex items-center justify-center gap-2 rounded-lg border-2 border-dashed p-6 text-sm text-muted-foreground">
                {resolvingCourse && <Loader2 className="h-4 w-4 animate-spin" />}
                Preparing upload area…
              </div>
            )}
          </CardContent>
        </Card>

        {/* Past Course Materials — Optional but Recommended */}
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
              <li><strong className="text-foreground">Reference material:</strong> reading lists, supplementary articles, sample solutions</li>
            </ul>
            <p className="text-xs text-muted-foreground mb-3">
              <strong>Accepted:</strong> PDF, PPTX, DOCX, TXT, CSV, images.
            </p>
            {user && courseId ? (
              <FileUploadZone
                folderPath={`${courseId}/lesson-plans`}
                accept={MATERIALS_ACCEPT}
                files={lessonPlanFiles}
                onFilesChange={setLessonPlanFiles}
                courseId={courseId}
                teacherId={user.id}
                folderType="lesson-plans"
              />
            ) : (
              <div className="flex items-center justify-center gap-2 rounded-lg border-2 border-dashed p-6 text-sm text-muted-foreground">
                {resolvingCourse && <Loader2 className="h-4 w-4 animate-spin" />}
                Preparing upload area…
              </div>
            )}
          </CardContent>
        </Card>

        {/* Lesson Plans — Optional */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-3">
              <CardTitle className="flex items-center gap-2 text-lg">
                <BookOpen className="h-5 w-5 text-primary" /> Lesson Plans
              </CardTitle>
              <Badge variant="secondary">Optional</Badge>
            </div>
            <CardDescription>
              Upload existing weekly lesson plans or course schedules. The AI will use these to align the generated lesson plan with how you actually teach the course.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground mb-3">
              <strong>Accepted:</strong> PDF, DOCX, TXT
            </p>
            {user && courseId ? (
              <FileUploadZone
                folderPath={`${courseId}/lesson-plan-docs`}
                accept={LESSON_PLAN_ACCEPT}
                files={lessonPlanDocFiles}
                onFilesChange={setLessonPlanDocFiles}
                courseId={courseId}
                teacherId={user.id}
                folderType="lesson-plan-docs"
              />
            ) : (
              <div className="flex items-center justify-center gap-2 rounded-lg border-2 border-dashed p-6 text-sm text-muted-foreground">
                {resolvingCourse && <Loader2 className="h-4 w-4 animate-spin" />}
                Preparing upload area…
              </div>
            )}
          </CardContent>
        </Card>

        {/* YouTube Links — Optional */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-3">
              <CardTitle className="flex items-center gap-2 text-lg">
                <Youtube className="h-5 w-5 text-primary" /> YouTube Links
              </CardTitle>
              <Badge variant="secondary">Optional</Badge>
            </div>
            <CardDescription>
              Upload a document with YouTube links you want students to reference, or links you have referenced in your teaching.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground mb-3">
              <strong>Accepted:</strong> PDF, DOCX, TXT, CSV — one link per line works best.
            </p>
            {user && courseId ? (
              <FileUploadZone
                folderPath={`${courseId}/youtube-links`}
                accept={YOUTUBE_LINKS_ACCEPT}
                files={youtubeLinkFiles}
                onFilesChange={setYoutubeLinkFiles}
                courseId={courseId}
                teacherId={user.id}
                folderType="youtube-links"
              />
            ) : (
              <div className="flex items-center justify-center gap-2 rounded-lg border-2 border-dashed p-6 text-sm text-muted-foreground">
                {resolvingCourse && <Loader2 className="h-4 w-4 animate-spin" />}
                Preparing upload area…
              </div>
            )}
          </CardContent>
        </Card>


        {!hasSyllabus && (
          <p className="text-xs text-destructive text-center">
            Please upload your syllabus to continue.
          </p>
        )}
        {hasSyllabus && !canContinue && !allFailed && (
          <p className="text-xs text-muted-foreground text-center">
            Parsing your syllabus… this usually takes 10–30 seconds. The Next button will enable when it's ready.
          </p>
        )}
        {allFailed && (
          <p className="text-xs text-destructive text-center">
            Syllabus parsing failed. Use Retry on the file above before continuing.
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
