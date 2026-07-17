import { useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { FileText, ClipboardList, ArrowLeft, Loader2, BookOpen, Youtube, Trash2, ExternalLink, AlertTriangle } from "lucide-react";
import FileUploadZone from "@/components/FileUploadZone";
import SetupModuleNav from "@/components/SetupModuleNav";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

const SYLLABUS_ACCEPT = ".pdf,.docx";
const LESSON_PLAN_ACCEPT = ".pdf,.docx,.txt";
const YOUTUBE_LINKS_ACCEPT = ".pdf,.docx,.txt,.csv";
const TEXTBOOKS_ACCEPT = ".pdf";
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
  const [textbookFiles, setTextbookFiles] = useState<UploadedFile[]>([]);
  const [syllabusParseStatus, setSyllabusParseStatus] = useState<Record<string, "parsing" | "parsed" | "failed">>({});
  const [syllabusJsonInStorage, setSyllabusJsonInStorage] = useState(false);
  const [extractedLinks, setExtractedLinks] = useState<Array<{ id: string; url: string; kind: string }>>([]);
  const [extractingLinks, setExtractingLinks] = useState(false);
  const [savingLinks, setSavingLinks] = useState(false);
  // Pending review queue: links extracted from a freshly uploaded file, awaiting teacher approval.
  const [reviewItems, setReviewItems] = useState<Array<{
    url: string; kind: string; video_id: string | null;
    already_saved: boolean; selected: boolean;
    invalid: boolean; invalidReason?: string;
    sourceFileId: string | null; sourceFileName: string;
  }>>([]);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [duplicatesSkipped, setDuplicatesSkipped] = useState(0);

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

  // Load already-extracted YouTube links for this course.
  const refreshLinks = async () => {
    if (!courseId) return;
    const { data } = await supabase
      .from("course_youtube_links")
      .select("id, url, kind")
      .eq("course_id", courseId)
      .order("created_at", { ascending: false });
    setExtractedLinks(data ?? []);
  };
  useEffect(() => { void refreshLinks(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [courseId]);

  // Validate a candidate YouTube URL. Returns { valid, reason } so we can show
  // why the link is rejected. We accept watch?v=, youtu.be/, shorts/, playlist,
  // channel, and @handle URLs only — anything else is flagged.
  const validateYoutubeUrl = (raw: string): { valid: boolean; reason?: string } => {
    if (!raw || typeof raw !== "string") return { valid: false, reason: "Empty URL" };
    let u: URL;
    try {
      u = new URL(raw.trim());
    } catch {
      return { valid: false, reason: "Not a valid URL" };
    }
    if (u.protocol !== "http:" && u.protocol !== "https:") {
      return { valid: false, reason: "Unsupported protocol" };
    }
    const host = u.hostname.replace(/^www\.|^m\./, "").toLowerCase();
    if (host === "youtu.be") {
      const id = u.pathname.slice(1).split("/")[0];
      if (!/^[A-Za-z0-9_-]{11}$/.test(id)) return { valid: false, reason: "Invalid video ID" };
      return { valid: true };
    }
    if (host === "youtube.com") {
      const p = u.pathname;
      if (p === "/watch") {
        const v = u.searchParams.get("v") || "";
        if (!/^[A-Za-z0-9_-]{11}$/.test(v)) return { valid: false, reason: "Missing/invalid video ID" };
        return { valid: true };
      }
      if (p.startsWith("/shorts/")) {
        const id = p.slice("/shorts/".length).split("/")[0];
        if (!/^[A-Za-z0-9_-]{11}$/.test(id)) return { valid: false, reason: "Invalid shorts ID" };
        return { valid: true };
      }
      if (p === "/playlist") {
        const list = u.searchParams.get("list") || "";
        if (!/^[A-Za-z0-9_-]{10,}$/.test(list)) return { valid: false, reason: "Invalid playlist ID" };
        return { valid: true };
      }
      if (p.startsWith("/channel/") || p.startsWith("/@") || p.startsWith("/c/") || p.startsWith("/user/")) {
        return { valid: true };
      }
      return { valid: false, reason: "Unsupported YouTube path" };
    }
    return { valid: false, reason: "Not a YouTube domain" };
  };

  // Extract links from any freshly uploaded YouTube-links file and queue them
  // for teacher review. Nothing is written to the DB until the teacher confirms.
  const handleYoutubeUploadComplete = async (newFiles: UploadedFile[]) => {
    if (!courseId || newFiles.length === 0) return;
    setExtractingLinks(true);
    const collected: typeof reviewItems = [];
    const seen = new Set<string>();
    let skippedDupes = 0;
    try {
      for (const f of newFiles) {
        const { data: meta } = await supabase
          .from("course_material_files")
          .select("id")
          .eq("storage_path", f.path)
          .maybeSingle();
        const { data, error } = await supabase.functions.invoke("extract-youtube-links", {
          body: {
            courseId,
            fileId: meta?.id ?? null,
            storagePath: f.path,
            fileName: f.name,
            mode: "extract",
          },
        });
        if (error) {
          toast.error(`Extraction failed for ${f.name}: ${error.message}`);
          continue;
        }
        const links = ((data as any)?.links ?? []) as Array<{
          url: string; kind: string; video_id: string | null; already_saved: boolean;
        }>;
        for (const l of links) {
          // Dedupe across multiple files in the same batch.
          if (seen.has(l.url)) { skippedDupes += 1; continue; }
          seen.add(l.url);
          const { valid, reason } = validateYoutubeUrl(l.url);
          collected.push({
            ...l,
            invalid: !valid,
            invalidReason: reason,
            // Invalid + already-saved links should never be pre-selected.
            selected: valid && !l.already_saved,
            sourceFileId: meta?.id ?? null,
            sourceFileName: f.name,
          });
        }
      }
      setDuplicatesSkipped(skippedDupes);
      if (collected.length === 0) {
        toast.info(
          skippedDupes > 0
            ? `No new YouTube links detected (${skippedDupes} duplicate(s) skipped).`
            : "No YouTube links detected in that file.",
        );
      } else {
        setReviewItems(collected);
        setReviewOpen(true);
      }
    } finally {
      setExtractingLinks(false);
    }
  };

  const toggleReviewItem = (url: string) => {
    setReviewItems((prev) =>
      prev.map((i) =>
        i.url === url && !i.invalid && !i.already_saved
          ? { ...i, selected: !i.selected }
          : i,
      ),
    );
  };

  const toggleAllReview = (checked: boolean) => {
    setReviewItems((prev) =>
      prev.map((i) =>
        i.already_saved || i.invalid ? i : { ...i, selected: checked },
      ),
    );
  };

  const confirmSaveReviewed = async () => {
    if (!courseId) return;
    // Defense-in-depth: never save invalid or already-saved rows even if a
    // selected flag slipped through.
    const toSave = reviewItems.filter(
      (i) => i.selected && !i.already_saved && !i.invalid,
    );
    if (toSave.length === 0) {
      setReviewOpen(false);
      setReviewItems([]);
      setDuplicatesSkipped(0);
      return;
    }
    setSavingLinks(true);
    try {
      // Group by source file so source_file_id stays accurate per row.
      const groups = new Map<string, typeof toSave>();
      for (const item of toSave) {
        const key = item.sourceFileId ?? "none";
        const arr = groups.get(key) ?? [];
        arr.push(item);
        groups.set(key, arr);
      }
      let totalInserted = 0;
      for (const [fileId, items] of groups) {
        const { data, error } = await supabase.functions.invoke("extract-youtube-links", {
          body: {
            courseId,
            fileId: fileId === "none" ? null : fileId,
            mode: "save",
            links: items.map((i) => ({ url: i.url, kind: i.kind, video_id: i.video_id })),
          },
        });
        if (error) {
          toast.error(`Save failed: ${error.message}`);
          continue;
        }
        totalInserted += (data as any)?.inserted ?? 0;
      }
      toast.success(`Saved ${totalInserted} link(s).`);
      setReviewOpen(false);
      setReviewItems([]);
      setDuplicatesSkipped(0);
      await refreshLinks();
    } finally {
      setSavingLinks(false);
    }
  };

  const cancelReview = () => {
    setReviewOpen(false);
    setReviewItems([]);
    setDuplicatesSkipped(0);
  };

  const removeLink = async (id: string) => {
    const { error } = await supabase.from("course_youtube_links").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    setExtractedLinks((prev) => prev.filter((l) => l.id !== id));
  };


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
                onUploadComplete={async () => {
                  const toastId = toast.loading("Extracting lesson plan structure…");
                  const { data, error } = await supabase.functions.invoke(
                    "extract-lesson-plan",
                    { body: { courseId } },
                  );
                  if (error || (data as any)?.error) {
                    toast.error(
                      (error?.message || (data as any)?.error) ??
                        "Couldn't extract a structured plan from the uploaded files.",
                      { id: toastId },
                    );
                    return;
                  }
                  const weeks = (data as any)?.weekCount ?? 0;
                  toast.success(
                    `Saved uploaded-lesson-plan.json (${weeks} week${weeks === 1 ? "" : "s"}).`,
                    { id: toastId },
                  );
                }}
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
                onUploadComplete={handleYoutubeUploadComplete}
              />
            ) : (
              <div className="flex items-center justify-center gap-2 rounded-lg border-2 border-dashed p-6 text-sm text-muted-foreground">
                {resolvingCourse && <Loader2 className="h-4 w-4 animate-spin" />}
                Preparing upload area…
              </div>
            )}

            {extractingLinks && (
              <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Extracting YouTube links…
              </div>
            )}

            {extractedLinks.length > 0 && (
              <div className="mt-4">
                <p className="text-xs font-semibold text-foreground mb-2">
                  Extracted links ({extractedLinks.length})
                </p>
                <ul className="space-y-1.5 max-h-64 overflow-y-auto">
                  {extractedLinks.map((l) => (
                    <li
                      key={l.id}
                      className="flex items-center justify-between gap-2 rounded-md border bg-muted/30 px-3 py-1.5 text-xs"
                    >
                      <a
                        href={l.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex min-w-0 items-center gap-1.5 text-primary hover:underline"
                      >
                        <ExternalLink className="h-3 w-3 shrink-0" />
                        <span className="truncate">{l.url}</span>
                      </a>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive"
                        onClick={() => removeLink(l.id)}
                        aria-label="Remove link"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </li>
                  ))}
                </ul>
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

      {/* Review extracted YouTube links before saving */}
      <Dialog
        open={reviewOpen}
        onOpenChange={(open) => {
          if (!open && !savingLinks) cancelReview();
        }}
      >
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Review extracted YouTube links</DialogTitle>
            <DialogDescription>
              We found {reviewItems.length} link{reviewItems.length === 1 ? "" : "s"}.
              Uncheck any you don't want saved. Invalid and already-saved links are disabled.
            </DialogDescription>
          </DialogHeader>

          {(() => {
            const invalidCount = reviewItems.filter((i) => i.invalid).length;
            const alreadyCount = reviewItems.filter((i) => i.already_saved).length;
            const saveable = reviewItems.filter(
              (i) => i.selected && !i.already_saved && !i.invalid,
            ).length;
            const warnings: string[] = [];
            if (invalidCount > 0) warnings.push(`${invalidCount} malformed`);
            if (alreadyCount > 0) warnings.push(`${alreadyCount} already saved`);
            if (duplicatesSkipped > 0) warnings.push(`${duplicatesSkipped} duplicate(s) skipped`);
            return (
              <>
                {warnings.length > 0 && (
                  <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                    <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                    <span>{warnings.join(" · ")}. These won't be saved.</span>
                  </div>
                )}

                {reviewItems.length > 0 && (
                  <div className="flex items-center justify-between border-b pb-2 text-xs text-muted-foreground">
                    <span>{saveable} selected to save</span>
                    <div className="flex gap-2">
                      <Button variant="ghost" size="sm" onClick={() => toggleAllReview(true)}>
                        Select all
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => toggleAllReview(false)}>
                        Deselect all
                      </Button>
                    </div>
                  </div>
                )}

                <ul className="max-h-[55vh] overflow-y-auto space-y-1.5">
                  {reviewItems.map((item) => (
                    <li
                      key={item.url}
                      className={
                        "flex items-start gap-3 rounded-md border px-3 py-2 text-sm " +
                        (item.invalid
                          ? "border-destructive/40 bg-destructive/5"
                          : "bg-muted/20")
                      }
                    >
                      <Checkbox
                        checked={item.selected}
                        disabled={item.already_saved || item.invalid}
                        onCheckedChange={() => toggleReviewItem(item.url)}
                        className="mt-1"
                      />
                      <div className="min-w-0 flex-1">
                        {item.invalid ? (
                          <div className="flex items-center gap-1.5 text-muted-foreground">
                            <span className="truncate line-through">{item.url}</span>
                          </div>
                        ) : (
                          <a
                            href={item.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-1.5 text-primary hover:underline"
                          >
                            <ExternalLink className="h-3 w-3 shrink-0" />
                            <span className="truncate">{item.url}</span>
                          </a>
                        )}
                        <p className="mt-0.5 flex flex-wrap items-center gap-x-1 text-xs text-muted-foreground">
                          {item.invalid ? (
                            <span className="inline-flex items-center gap-1 font-medium text-destructive">
                              <AlertTriangle className="h-3 w-3" />
                              Invalid{item.invalidReason ? `: ${item.invalidReason}` : ""}
                            </span>
                          ) : (
                            <span>{item.kind}</span>
                          )}
                          {item.already_saved && <span>· already saved</span>}
                          <span>· from {item.sourceFileName}</span>
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>

                <DialogFooter>
                  <Button variant="outline" onClick={cancelReview} disabled={savingLinks}>
                    Cancel
                  </Button>
                  <Button
                    onClick={confirmSaveReviewed}
                    disabled={savingLinks || saveable === 0}
                  >
                    {savingLinks && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Save {saveable > 0 ? `${saveable} link${saveable === 1 ? "" : "s"}` : "selected"}
                  </Button>
                </DialogFooter>
              </>
            );
          })()}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default CourseMaterials;
