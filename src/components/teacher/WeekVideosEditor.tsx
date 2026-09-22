// Videos block inside the lesson-plan week editor (employment pathway).
// Professors attach YouTube/Vimeo links or uploaded files to a week; students
// see them as watch cards in the unit's Study section.

import { useCallback, useEffect, useRef, useState } from "react";
import { Check, Link2, Loader2, Pencil, Play, Trash2, Upload, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import {
  addFileVideo, addLinkVideo, deleteWeekVideo, fetchWeekVideos, formatDuration,
  renameWeekVideo, validateVideoFile, validateVideoUrl, type WeekVideo,
} from "@/lib/weekVideos";

interface WeekVideosEditorProps {
  courseId: string | null;
  weekNumber: number;
}

const WeekVideosEditor = ({ courseId, weekNumber }: WeekVideosEditorProps) => {
  const { toast } = useToast();
  const [videos, setVideos] = useState<WeekVideo[]>([]);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<"none" | "link" | "file">("none");
  const [linkUrl, setLinkUrl] = useState("");
  const [linkTitle, setLinkTitle] = useState("");
  const [fileTitle, setFileTitle] = useState("");
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState("");
  const [deleting, setDeleting] = useState<WeekVideo | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    if (!courseId) return;
    setLoading(true);
    try {
      setVideos(await fetchWeekVideos(courseId, weekNumber));
    } catch (err) {
      console.error("Week videos load error:", err);
    } finally {
      setLoading(false);
    }
  }, [courseId, weekNumber]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleAddLink = async () => {
    if (!courseId) return;
    const check = validateVideoUrl(linkUrl);
    if (!check.valid) {
      toast({ title: "Check the link", description: check.reason, variant: "destructive" });
      return;
    }
    const title = linkTitle.trim();
    if (!title) {
      toast({ title: "Add a title", description: "Students see this as the video's name.", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const video = await addLinkVideo({ courseId, weekNumber, title, url: linkUrl });
      setVideos((prev) => [...prev, video]);
      setLinkUrl("");
      setLinkTitle("");
      setMode("none");
      toast({ title: "Video added", description: `"${title}" is now part of Week ${weekNumber}.` });
    } catch (err) {
      console.error(err);
      toast({ title: "Couldn't add the video", description: "Please try again.", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleFilePicked = async (file: File | null) => {
    if (!courseId || !file) return;
    const check = validateVideoFile(file);
    if (!check.valid) {
      toast({ title: "Unsupported file", description: check.reason, variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const video = await addFileVideo({ courseId, weekNumber, title: fileTitle, file });
      setVideos((prev) => [...prev, video]);
      setFileTitle("");
      setMode("none");
      toast({ title: "Video uploaded", description: `"${video.title}" is now part of Week ${weekNumber}.` });
    } catch (err) {
      console.error(err);
      toast({ title: "Upload failed", description: "Please try again.", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleRename = async (video: WeekVideo) => {
    const title = editingTitle.trim();
    setEditingId(null);
    if (!title || title === video.title) return;
    try {
      await renameWeekVideo(video.id, title);
      setVideos((prev) => prev.map((v) => (v.id === video.id ? { ...v, title } : v)));
    } catch (err) {
      console.error(err);
      toast({ title: "Couldn't rename", description: "Please try again.", variant: "destructive" });
    }
  };

  const handleDelete = async () => {
    if (!deleting) return;
    const video = deleting;
    setDeleting(null);
    try {
      await deleteWeekVideo(video);
      setVideos((prev) => prev.filter((v) => v.id !== video.id));
      toast({ title: "Video removed", description: `"${video.title}" was removed from Week ${weekNumber}.` });
    } catch (err) {
      console.error(err);
      toast({ title: "Couldn't remove the video", description: "Please try again.", variant: "destructive" });
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <div className="h-5 w-1 rounded-full bg-primary" />
        <Label className="text-sm font-semibold">Videos</Label>
        <span className="text-xs text-muted-foreground">shown in this unit's Study section</span>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading videos…
        </div>
      ) : (
        <>
          {videos.length === 0 && mode === "none" && (
            <p className="text-sm text-muted-foreground">No videos yet — add a link or upload a file.</p>
          )}
          <div className="space-y-2">
            {videos.map((video) => (
              <div key={video.id} className="flex items-center gap-2 rounded-lg border bg-muted/10 p-2.5">
                <Play className="h-4 w-4 shrink-0 text-muted-foreground" />
                {editingId === video.id ? (
                  <>
                    <Input
                      autoFocus
                      value={editingTitle}
                      onChange={(e) => setEditingTitle(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") void handleRename(video);
                        if (e.key === "Escape") setEditingId(null);
                      }}
                      className="h-8 flex-1 text-sm"
                    />
                    <Button size="sm" variant="ghost" className="h-8 px-2" onClick={() => void handleRename(video)}>
                      <Check className="h-3.5 w-3.5" />
                    </Button>
                    <Button size="sm" variant="ghost" className="h-8 px-2" onClick={() => setEditingId(null)}>
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </>
                ) : (
                  <>
                    <span className="min-w-0 flex-1 truncate text-sm font-medium">{video.title}</span>
                    {formatDuration(video.duration_seconds) && (
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {formatDuration(video.duration_seconds)}
                      </span>
                    )}
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {video.kind === "link" ? "Link" : "Upload"}
                    </span>
                    <Button
                      size="sm" variant="ghost" className="h-8 px-2"
                      onClick={() => { setEditingId(video.id); setEditingTitle(video.title); }}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      size="sm" variant="ghost"
                      className="h-8 px-2 text-destructive hover:text-destructive"
                      onClick={() => setDeleting(video)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </>
                )}
              </div>
            ))}
          </div>

          {mode === "link" && (
            <div className="space-y-3 rounded-lg border border-dashed bg-muted/10 p-3">
              <div className="space-y-1.5">
                <Label className="text-sm font-medium">Video link</Label>
                <Input
                  value={linkUrl}
                  onChange={(e) => setLinkUrl(e.target.value)}
                  placeholder="https://www.youtube.com/watch?v=… or https://vimeo.com/…"
                  className="h-9 text-sm"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm font-medium">Title</Label>
                <Input
                  value={linkTitle}
                  onChange={(e) => setLinkTitle(e.target.value)}
                  placeholder="What students will see"
                  className="h-9 text-sm"
                />
              </div>
              <div className="flex gap-2">
                <Button size="sm" onClick={() => void handleAddLink()} disabled={saving} className="h-8">
                  {saving ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : null} Add video
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setMode("none")} className="h-8">Cancel</Button>
              </div>
            </div>
          )}

          {mode === "file" && (
            <div className="space-y-3 rounded-lg border border-dashed bg-muted/10 p-3">
              <div className="space-y-1.5">
                <Label className="text-sm font-medium">Title (optional)</Label>
                <Input
                  value={fileTitle}
                  onChange={(e) => setFileTitle(e.target.value)}
                  placeholder="Defaults to the file name"
                  className="h-9 text-sm"
                />
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept="video/mp4,video/webm,video/quicktime"
                className="hidden"
                onChange={(e) => {
                  void handleFilePicked(e.target.files?.[0] ?? null);
                  e.target.value = "";
                }}
              />
              <div className="flex gap-2">
                <Button size="sm" onClick={() => fileInputRef.current?.click()} disabled={saving} className="h-8">
                  {saving ? (
                    <><Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> Uploading…</>
                  ) : (
                    <><Upload className="mr-1 h-3.5 w-3.5" /> Choose file</>
                  )}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setMode("none")} disabled={saving} className="h-8">
                  Cancel
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">MP4, WebM or MOV, up to 500MB.</p>
            </div>
          )}

          {mode === "none" && (
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => setMode("link")} className="h-8 flex-1 border-dashed text-sm">
                <Link2 className="mr-1.5 h-3.5 w-3.5" /> Paste a link
              </Button>
              <Button variant="outline" size="sm" onClick={() => setMode("file")} className="h-8 flex-1 border-dashed text-sm">
                <Upload className="mr-1.5 h-3.5 w-3.5" /> Upload a file
              </Button>
            </div>
          )}
        </>
      )}

      <AlertDialog open={!!deleting} onOpenChange={(open) => !open && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove this video?</AlertDialogTitle>
            <AlertDialogDescription>
              "{deleting?.title}" will be removed from Week {weekNumber}. Students will no longer see it.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep it</AlertDialogCancel>
            <AlertDialogAction onClick={() => void handleDelete()}>Remove video</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default WeekVideosEditor;
