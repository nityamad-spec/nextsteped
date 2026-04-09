import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { FileText, Download, Upload, Trash2, Loader2, BookOpen, Presentation, FolderOpen } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useTeacherCourseId } from "@/hooks/useTeacherCourseId";
import FileUploadZone from "@/components/FileUploadZone";
import { toast } from "sonner";
import TeachingPlan from "@/pages/teacher/TeachingPlan";

interface StoredFile {
  id: string;
  file_name: string;
  file_size: number;
  folder_type: string;
  storage_path: string;
  created_at: string;
}

const UPLOAD_ACCEPT = ".pdf,.pptx,.docx,.txt,.csv,.png,.jpg,.jpeg,.gif,.bmp,.webp";

const formatSize = (bytes: number) => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const ContentLibrary = () => {
  const { user } = useAuth();
  const courseId = useTeacherCourseId();
  const [files, setFiles] = useState<StoredFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploadingFolder, setUploadingFolder] = useState<string | null>(null);

  const fetchFiles = async () => {
    if (!user) return;
    setLoading(true);
    let query = supabase
      .from("course_material_files")
      .select("*")
      .eq("teacher_id", user.id)
      .order("created_at", { ascending: false });
    if (courseId) query = query.eq("course_id", courseId);
    const { data, error } = await query;
    if (error) console.error("Error fetching files:", error);
    else setFiles(data || []);
    setLoading(false);
  };


  useEffect(() => {
    fetchFiles();
  }, [user, courseId]);

  const handleDownload = async (file: StoredFile) => {
    const { data, error } = await supabase.storage.from("course-materials").download(file.storage_path);
    if (error || !data) { toast.error("Failed to download file"); return; }
    const url = URL.createObjectURL(data);
    const a = document.createElement("a");
    a.href = url; a.download = file.file_name; a.click();
    URL.revokeObjectURL(url);
  };

  const handleDelete = async (file: StoredFile) => {
    if (!confirm(`Delete "${file.file_name}"?`)) return;
    const { error: storageErr } = await supabase.storage.from("course-materials").remove([file.storage_path]);
    if (storageErr) { toast.error("Failed to delete file from storage"); return; }
    const { error: dbErr } = await supabase.from("course_material_files").delete().eq("id", file.id);
    if (dbErr) { toast.error("Failed to delete file record"); return; }
    setFiles((prev) => prev.filter((f) => f.id !== file.id));
    toast.success("File deleted");
  };

  const handleDownloadSyllabus = async () => {
    if (!user) return;
    const { data, error } = await supabase.storage.from("course-materials").download(`${user.id}/syllabus/approved-syllabus.json`);
    if (error || !data) { toast.error("No approved syllabus found to download"); return; }
    const text = await data.text();
    const blob = new Blob([text], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "approved-syllabus.json"; a.click();
    URL.revokeObjectURL(url);
    toast.success("Syllabus downloaded");
  };

  const toggleWeek = (week: number) => {
    setExpandedWeeks(prev => prev.includes(week) ? prev.filter(w => w !== week) : [...prev, week]);
  };

  const renderFileList = (folderType: string, label: string, Icon: typeof FileText) => {
    const folderFiles = files.filter(f => f.folder_type === folderType);
    const isUploading = uploadingFolder === folderType;

    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Icon className="h-5 w-5 text-primary" />
            <div>
              <p className="text-sm font-medium">{label}</p>
              <p className="text-xs text-muted-foreground">{folderFiles.length} file{folderFiles.length !== 1 ? "s" : ""}</p>
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={() => setUploadingFolder(isUploading ? null : folderType)}>
            <Upload className="mr-2 h-4 w-4" /> {isUploading ? "Cancel" : "Upload"}
          </Button>
        </div>

        {isUploading && user && (
          <FileUploadZone
            folderPath={`${user.id}/${folderType}`}
            accept={UPLOAD_ACCEPT}
            files={folderFiles.map(f => ({ name: f.file_name, size: f.file_size, path: f.storage_path }))}
            onFilesChange={() => { fetchFiles(); setUploadingFolder(null); }}
            teacherId={user.id}
            folderType={folderType}
            courseId={courseId}
          />
        )}

        {folderFiles.length === 0 && !isUploading && (
          <div className="rounded-lg border border-dashed p-6 text-center">
            <FolderOpen className="mx-auto h-8 w-8 text-muted-foreground/30 mb-2" />
            <p className="text-sm text-muted-foreground">No files uploaded yet</p>
          </div>
        )}

        {folderFiles.map(file => (
          <div key={file.id} className="flex items-center gap-3 rounded-lg border p-3 hover:bg-muted/50 transition-colors">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <FileText className="h-5 w-5" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{file.file_name}</p>
              <p className="text-xs text-muted-foreground">
                {formatSize(file.file_size)} • Uploaded {new Date(file.created_at).toLocaleDateString()}
              </p>
            </div>
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="sm" className="h-8" onClick={() => handleDownload(file)} title="Download">
                <Download className="h-3.5 w-3.5" />
              </Button>
              <Button variant="ghost" size="sm" className="h-8 text-destructive hover:text-destructive" onClick={() => handleDelete(file)} title="Delete">
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        ))}
      </div>
    );
  };

  const renderLessonPlanWeek = (dp: any) => {
    const isExpanded = expandedWeeks.includes(dp.day);
    const desc = dp.description || "";
    const outcomesMatch = desc.match(/Learning Outcomes:\s*([\s\S]*?)(?=Concepts:|Teaching Strategies:|$)/i);
    const strategiesMatch = desc.match(/Teaching Strategies:\s*([\s\S]*?)$/i);
    const outcomes = outcomesMatch?.[1]?.trim().replace(/\*\*/g, "") || "";
    const strategies = strategiesMatch?.[1]?.trim().replace(/\*\*/g, "") || "";
    const parseList = (text: string) =>
      text.split("\n").map(l => l.replace(/^[-•]\s*/, "").trim()).filter(Boolean);

    const conceptGroups = dp.resources ? groupResourcesByConcept(dp.resources) : new Map();

    return (
      <Card key={dp.id || dp.day} className={isExpanded ? "border-primary/20" : ""}>
        <div
          className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-muted/30 transition-colors"
          onClick={() => toggleWeek(dp.day)}
        >
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <Badge variant="outline" className="shrink-0 text-xs w-20 justify-center">
              Week {dp.day}
            </Badge>
            <span className="text-sm font-medium truncate">{dp.topic}</span>
          </div>
          <div className="flex items-center gap-1.5 ml-2 shrink-0">
            {dp.locked && <Lock className="h-3.5 w-3.5 text-muted-foreground" />}
            {isExpanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
          </div>
        </div>

        {isExpanded && (
          <CardContent className="pt-0 pb-4 space-y-4">
            {dp.locked && (
              <div className="flex items-center gap-2 rounded-lg border border-dashed bg-muted/20 px-3 py-2">
                <Lock className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                <p className="text-xs text-muted-foreground">This week is locked for students — content shown here for your reference.</p>
              </div>
            )}

                {/* Learning Outcomes */}
                {outcomes && (
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">Learning Outcomes</p>
                    <ul className="space-y-1">
                      {parseList(outcomes).map((item, i) => (
                        <li key={i} className="text-sm text-muted-foreground flex items-start gap-2">
                          <Check className="h-3.5 w-3.5 text-primary mt-0.5 shrink-0" />
                          <span>{item}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Concepts → Activities (hierarchical) */}
                {conceptGroups.size > 0 && (
                  <div className="space-y-3">
                    {Array.from(conceptGroups.entries()).map(([concept, activities]) => {
                      const inClass = activities.filter((r: any) => !["textbook", "article", "case-study", "news"].includes(r.type));
                      const preClass = activities.filter((r: any) => ["textbook", "article", "case-study", "news"].includes(r.type));
                      return (
                        <div key={concept} className="rounded-lg border bg-card/50 overflow-hidden">
                          <div className="flex items-center gap-2 px-4 py-2.5 bg-muted/30 border-b">
                            <div className="h-5 w-1 rounded-full bg-primary" />
                            <p className="text-sm font-semibold text-foreground">{concept}</p>
                          </div>
                          <div className="px-4 py-3 space-y-3">
                            {inClass.length > 0 && (
                              <div>
                                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1.5">In Class</p>
                                <div className="space-y-1.5">
                                  {inClass.map((r: any, i: number) => (
                                    <div key={r.id || i} className="flex items-start gap-2.5 rounded-md px-3 py-2">
                                      <span className="text-sm shrink-0 mt-0.5">
                                        {r.type === "exercise" ? "🏋️" : r.type === "lab" ? "🧪" : r.type === "video" ? "🎬" : r.type === "tool" ? "🔧" : "📄"}
                                      </span>
                                      <div className="min-w-0 flex-1">
                                        <p className="text-sm font-medium">{r.title}</p>
                                        <p className="text-xs text-muted-foreground">{r.action}</p>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                            {preClass.length > 0 && (
                              <div>
                                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1.5">Readings & Preparation</p>
                                <div className="space-y-1.5">
                                  {preClass.map((r: any, i: number) => (
                                    <div key={r.id || i} className="flex items-start gap-2.5 rounded-md px-3 py-2">
                                      <span className="text-sm shrink-0 mt-0.5">
                                        {r.type === "textbook" ? "📖" : r.type === "article" ? "📰" : r.type === "case-study" ? "📋" : "📰"}
                                      </span>
                                      <div className="min-w-0 flex-1">
                                        <p className="text-sm font-medium">{r.title}</p>
                                        <p className="text-xs text-muted-foreground">{r.action}</p>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
          </CardContent>
        )}
      </Card>
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="font-heading text-3xl font-bold">Lesson Plan & Resources</h1>
        <p className="text-muted-foreground">Your living lesson plan and all course materials in one place</p>
      </div>

      <Tabs defaultValue="lesson-plan" className="space-y-6">
        <TabsList>
          <TabsTrigger value="lesson-plan" className="gap-2"><BookOpen className="h-4 w-4" /> Lesson Plan</TabsTrigger>
          <TabsTrigger value="materials" className="gap-2"><Presentation className="h-4 w-4" /> Teaching Materials</TabsTrigger>
          <TabsTrigger value="syllabus" className="gap-2"><FileText className="h-4 w-4" /> Syllabus</TabsTrigger>
        </TabsList>

        {/* Syllabus Tab */}
        <TabsContent value="syllabus" className="space-y-6">
          {/* Quick action: Download approved syllabus */}
          <Card>
            <CardContent className="flex items-center justify-between p-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <FileText className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-sm font-medium">Approved Syllabus</p>
                  <p className="text-xs text-muted-foreground">Download the latest approved and reviewed syllabus</p>
                </div>
              </div>
              <Button variant="outline" size="sm" onClick={handleDownloadSyllabus}>
                <Download className="mr-2 h-4 w-4" /> Download
              </Button>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-6">
              {renderFileList("syllabus", "Syllabus Files", FileText)}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Teaching Materials Tab */}
        <TabsContent value="materials" className="space-y-6">
          <Card>
            <CardContent className="p-6">
              {renderFileList("materials", "Teaching Materials", Presentation)}
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-6">
              {renderFileList("lesson-plans", "Lesson Plan Files", BookOpen)}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Lesson Plan Tab */}
        <TabsContent value="lesson-plan" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <BookOpen className="h-5 w-5 text-primary" /> Weekly Lesson Plan
              </CardTitle>
              <CardDescription>
                Structured weekly plan with overview, learning outcomes, and activities
              </CardDescription>
            </CardHeader>
          </Card>
          {planLoading ? (
            <div className="flex items-center justify-center p-8">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : (
            <div className="space-y-3">
              {lessonPlan.map(renderLessonPlanWeek)}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default ContentLibrary;
