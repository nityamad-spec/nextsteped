import { useState, useEffect, useRef } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { FileText, Download, Upload, Trash2, Loader2, BookOpen, Library, FolderOpen, RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useTeacherCourseId } from "@/hooks/useTeacherCourseId";
import FileUploadZone from "@/components/FileUploadZone";
import { toast } from "sonner";
import CourseCreation from "@/pages/teacher/CourseCreation";
import CourseStatusBanner from "@/components/CourseStatusBanner";
import { replaceCourseMaterialFile, type MaterialFolderType } from "@/lib/courseMaterialFiles";

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
  const [replacingId, setReplacingId] = useState<string | null>(null);
  const replaceInputRef = useRef<HTMLInputElement | null>(null);
  const replaceTargetRef = useRef<StoredFile | null>(null);

  const fetchFiles = async () => {
    if (!user || !courseId) { setLoading(false); return; }
    setLoading(true);
    const { data, error } = await supabase
      .from("course_material_files")
      .select("*")
      .eq("course_id", courseId)
      .order("created_at", { ascending: false });
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

  const openReplacePicker = (file: StoredFile) => {
    replaceTargetRef.current = file;
    replaceInputRef.current?.click();
  };

  const handleReplaceFileSelected = async (
    e: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const picked = e.target.files?.[0];
    // Clear the input immediately so re-selecting the same file re-triggers.
    if (replaceInputRef.current) replaceInputRef.current.value = "";
    const target = replaceTargetRef.current;
    replaceTargetRef.current = null;
    if (!picked || !target || !user || !courseId) return;

    setReplacingId(target.id);
    try {
      const stamp = Date.now();
      const newPath = `${courseId}/${target.folder_type}/${stamp}-${picked.name}`;

      const { error: upErr } = await supabase.storage
        .from("course-materials")
        .upload(newPath, picked, { upsert: false, contentType: picked.type || undefined });
      if (upErr) {
        toast.error(`Upload failed: ${upErr.message}`);
        return;
      }

      const res = await replaceCourseMaterialFile({
        old_file_id: target.id,
        new_upload: {
          course_id: courseId,
          teacher_id: user.id,
          storage_path: newPath,
          file_name: picked.name,
          file_size: picked.size,
          folder_type: target.folder_type as MaterialFolderType,
        },
      });
      if (!res) {
        toast.error("Failed to register replacement");
        return;
      }
      toast.success("Replacement uploaded — re-indexing in the background");
      await fetchFiles();
    } catch (err) {
      console.error(err);
      toast.error("Replace failed");
    } finally {
      setReplacingId(null);
    }
  };



  const handleDownloadSyllabus = async () => {
    if (!courseId) return;
    const { data, error } = await supabase.storage.from("course-materials").download(`${courseId}/syllabus/approved-syllabus.json`);
    if (error || !data) { toast.error("No approved syllabus found to download"); return; }
    const text = await data.text();
    const blob = new Blob([text], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "approved-syllabus.json"; a.click();
    URL.revokeObjectURL(url);
    toast.success("Syllabus downloaded");
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

        {isUploading && user && courseId && (
          <FileUploadZone
            folderPath={`${courseId}/${folderType}`}
            accept={UPLOAD_ACCEPT}
            files={folderFiles.map(f => ({ name: f.file_name, size: f.file_size, path: f.storage_path }))}
            onFilesChange={() => { fetchFiles(); setUploadingFolder(null); }}
            courseId={courseId}
            teacherId={user.id}
            folderType={folderType}
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
              <Button
                variant="ghost"
                size="sm"
                className="h-8"
                onClick={() => openReplacePicker(file)}
                disabled={replacingId === file.id}
                title="Replace with new version"
              >
                {replacingId === file.id
                  ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  : <RefreshCw className="h-3.5 w-3.5" />}
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
        <p className="text-muted-foreground">Your published lesson plan and all course materials in one place. Edits here go live to students and the AI Teaching Assistant when you re-publish.</p>
      </div>

      <CourseStatusBanner />

      <Tabs defaultValue="lesson-plan" className="space-y-6">
        <TabsList>
          <TabsTrigger value="lesson-plan" className="gap-2"><BookOpen className="h-4 w-4" /> Lesson Plan</TabsTrigger>
          <TabsTrigger value="content-library" className="gap-2"><Library className="h-4 w-4" /> Content Library</TabsTrigger>
          <TabsTrigger value="syllabus" className="gap-2"><FileText className="h-4 w-4" /> Syllabus</TabsTrigger>
        </TabsList>

        {/* Syllabus Tab */}
        <TabsContent value="syllabus" className="space-y-6">
          <Card>
            <CardContent className="p-6">
              {renderFileList("syllabus", "Syllabus Files", FileText)}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Content Library Tab — every resource uploaded in Course Setup Step 1 surfaces here */}
        <TabsContent value="content-library" className="space-y-6">
          <Card>
            <CardContent className="p-6">
              {renderFileList("materials", "Past Course Materials & Teaching Resources", Library)}
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-6">
              {renderFileList("lesson-plans", "Existing Lesson Plan Documents", BookOpen)}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Lesson Plan Tab — embeds the same publishable lesson plan from Course Setup */}
        <TabsContent value="lesson-plan">
          <CourseCreation embedded />
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default ContentLibrary;
