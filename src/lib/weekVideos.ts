// Per-week course videos (employment/skilling pathway): professors attach
// uploaded files or YouTube/Vimeo links to a lesson-plan week; students watch
// them from the unit's Study section on the learning path.

import { supabase } from "@/integrations/supabase/client";

export const WEEK_VIDEOS_BUCKET = "course-materials";

export type WeekVideoKind = "file" | "link";
export type VideoProvider = "youtube" | "vimeo" | null;

export interface WeekVideo {
  id: string;
  course_id: string;
  week_number: number;
  title: string;
  kind: WeekVideoKind;
  url: string | null;
  storage_path: string | null;
  duration_seconds: number | null;
  position: number;
}

/** Validate a pasted video link. Only YouTube and Vimeo are supported. */
export const validateVideoUrl = (raw: string): { valid: boolean; reason?: string } => {
  const trimmed = raw.trim();
  if (!trimmed) return { valid: false, reason: "Paste a link first" };
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return { valid: false, reason: "That doesn't look like a URL" };
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    return { valid: false, reason: "Only http(s) links are supported" };
  }
  const host = parsed.hostname.replace(/^www\./, "").replace(/^m\./, "");
  if (host === "youtu.be") {
    return parsed.pathname.length > 1
      ? { valid: true }
      : { valid: false, reason: "Missing video id" };
  }
  if (host === "youtube.com") {
    if (parsed.pathname === "/watch" && parsed.searchParams.get("v")) return { valid: true };
    if (/^\/(shorts|embed|live)\/[^/]+/.test(parsed.pathname)) return { valid: true };
    return { valid: false, reason: "Unsupported YouTube link" };
  }
  if (host === "vimeo.com") {
    return /^\/\d+/.test(parsed.pathname)
      ? { valid: true }
      : { valid: false, reason: "Unsupported Vimeo link" };
  }
  return { valid: false, reason: "Only YouTube and Vimeo links are supported" };
};

/** Identify which provider a link belongs to. */
export const videoProvider = (url: string | null): VideoProvider => {
  if (!url) return null;
  try {
    const host = new URL(url).hostname.replace(/^www\./, "").replace(/^m\./, "");
    if (host === "youtu.be" || host === "youtube.com") return "youtube";
    if (host === "vimeo.com") return "vimeo";
  } catch {
    /* ignore */
  }
  return null;
};

const youtubeId = (url: string): string | null => {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.replace(/^www\./, "").replace(/^m\./, "");
    if (host === "youtu.be") return parsed.pathname.slice(1).split("/")[0] || null;
    if (parsed.pathname === "/watch") return parsed.searchParams.get("v");
    const m = parsed.pathname.match(/^\/(shorts|embed|live)\/([^/]+)/);
    return m ? m[2] : null;
  } catch {
    return null;
  }
};

const vimeoId = (url: string): string | null => {
  try {
    const m = new URL(url).pathname.match(/^\/(\d+)/);
    return m ? m[1] : null;
  } catch {
    return null;
  }
};

/** Embeddable player URL for a linked video (null for uploads / unknown hosts). */
export const videoEmbedUrl = (video: Pick<WeekVideo, "kind" | "url">): string | null => {
  if (video.kind !== "link" || !video.url) return null;
  const provider = videoProvider(video.url);
  if (provider === "youtube") {
    const id = youtubeId(video.url);
    return id ? `https://www.youtube-nocookie.com/embed/${id}` : null;
  }
  if (provider === "vimeo") {
    const id = vimeoId(video.url);
    return id ? `https://player.vimeo.com/video/${id}` : null;
  }
  return null;
};

/** Static thumbnail for a linked video (YouTube only; others get a tile). */
export const videoThumbnailUrl = (video: Pick<WeekVideo, "kind" | "url">): string | null => {
  if (video.kind !== "link" || !video.url) return null;
  if (videoProvider(video.url) !== "youtube") return null;
  const id = youtubeId(video.url);
  return id ? `https://img.youtube.com/vi/${id}/hqdefault.jpg` : null;
};

export const ACCEPTED_VIDEO_TYPES = ["video/mp4", "video/webm", "video/quicktime"];
export const MAX_VIDEO_BYTES = 500 * 1024 * 1024; // 500MB

export const validateVideoFile = (file: File): { valid: boolean; reason?: string } => {
  if (!ACCEPTED_VIDEO_TYPES.includes(file.type)) {
    return { valid: false, reason: "Only MP4, WebM or MOV files are supported" };
  }
  if (file.size > MAX_VIDEO_BYTES) {
    return { valid: false, reason: "Files up to 500MB are supported" };
  }
  return { valid: true };
};

/** Fetch all videos for a week, ordered by position. */
export const fetchWeekVideos = async (courseId: string, weekNumber: number): Promise<WeekVideo[]> => {
  const { data, error } = await supabase
    .from("course_week_videos")
    .select("id, course_id, week_number, title, kind, url, storage_path, duration_seconds, position")
    .eq("course_id", courseId)
    .eq("week_number", weekNumber)
    .order("position", { ascending: true });
  if (error) throw error;
  return (data ?? []) as WeekVideo[];
};

const nextPosition = async (courseId: string, weekNumber: number): Promise<number> => {
  const { data } = await supabase
    .from("course_week_videos")
    .select("position")
    .eq("course_id", courseId)
    .eq("week_number", weekNumber)
    .order("position", { ascending: false })
    .limit(1);
  return ((data?.[0]?.position as number | undefined) ?? -1) + 1;
};

/** Add a YouTube/Vimeo link video to a week. */
export const addLinkVideo = async (args: {
  courseId: string;
  weekNumber: number;
  title: string;
  url: string;
}): Promise<WeekVideo> => {
  const position = await nextPosition(args.courseId, args.weekNumber);
  const { data, error } = await supabase
    .from("course_week_videos")
    .insert({
      course_id: args.courseId,
      week_number: args.weekNumber,
      title: args.title.trim(),
      kind: "link",
      url: args.url.trim(),
      position,
    })
    .select("id, course_id, week_number, title, kind, url, storage_path, duration_seconds, position")
    .single();
  if (error) throw error;
  return data as WeekVideo;
};

const sanitizeFileName = (name: string) => name.replace(/[^a-zA-Z0-9._-]+/g, "-").slice(-80);

/** Probe a video file's duration client-side (null when it can't be read). */
export const probeVideoDuration = (file: File): Promise<number | null> =>
  new Promise((resolve) => {
    try {
      const url = URL.createObjectURL(file);
      const el = document.createElement("video");
      el.preload = "metadata";
      el.onloadedmetadata = () => {
        URL.revokeObjectURL(url);
        resolve(Number.isFinite(el.duration) ? Math.round(el.duration) : null);
      };
      el.onerror = () => {
        URL.revokeObjectURL(url);
        resolve(null);
      };
      el.src = url;
    } catch {
      resolve(null);
    }
  });

/** Upload a video file to storage and register it on the week. */
export const addFileVideo = async (args: {
  courseId: string;
  weekNumber: number;
  title: string;
  file: File;
}): Promise<WeekVideo> => {
  const storagePath = `${args.courseId}/videos/week-${args.weekNumber}/${crypto.randomUUID()}-${sanitizeFileName(args.file.name)}`;
  const { error: uploadError } = await supabase.storage
    .from(WEEK_VIDEOS_BUCKET)
    .upload(storagePath, args.file, { contentType: args.file.type });
  if (uploadError) throw uploadError;
  const duration = await probeVideoDuration(args.file);
  const position = await nextPosition(args.courseId, args.weekNumber);
  const { data, error } = await supabase
    .from("course_week_videos")
    .insert({
      course_id: args.courseId,
      week_number: args.weekNumber,
      title: args.title.trim() || args.file.name.replace(/\.[^.]+$/, ""),
      kind: "file",
      storage_path: storagePath,
      duration_seconds: duration,
      position,
    })
    .select("id, course_id, week_number, title, kind, url, storage_path, duration_seconds, position")
    .single();
  if (error) {
    await supabase.storage.from(WEEK_VIDEOS_BUCKET).remove([storagePath]);
    throw error;
  }
  return data as WeekVideo;
};

export const renameWeekVideo = async (id: string, title: string): Promise<void> => {
  const { error } = await supabase.from("course_week_videos").update({ title: title.trim() }).eq("id", id);
  if (error) throw error;
};

/** Delete a video row, removing the stored file when there is one. */
export const deleteWeekVideo = async (video: WeekVideo): Promise<void> => {
  const { error } = await supabase.from("course_week_videos").delete().eq("id", video.id);
  if (error) throw error;
  if (video.storage_path) {
    await supabase.storage.from(WEEK_VIDEOS_BUCKET).remove([video.storage_path]);
  }
};

/** Resolve an uploaded video to a playable object URL (private bucket). */
export const downloadVideoObjectUrl = async (storagePath: string): Promise<string> => {
  const { data, error } = await supabase.storage.from(WEEK_VIDEOS_BUCKET).download(storagePath);
  if (error) throw error;
  return URL.createObjectURL(data);
};

/** Record that a student watched a video. Idempotent (one row per student+video). */
export const markVideoWatched = async (args: {
  videoId: string;
  courseId: string;
  studentId: string;
}): Promise<void> => {
  const { error } = await supabase.from("student_video_watches").upsert(
    { video_id: args.videoId, course_id: args.courseId, student_id: args.studentId },
    { onConflict: "video_id,student_id" },
  );
  if (error) throw error;
};

/** Fetch the ids of the given videos the student has watched. */
export const fetchWatchedVideoIds = async (studentId: string, videoIds: string[]): Promise<Set<string>> => {
  if (videoIds.length === 0) return new Set();
  const { data, error } = await supabase
    .from("student_video_watches")
    .select("video_id")
    .eq("student_id", studentId)
    .in("video_id", videoIds);
  if (error) throw error;
  return new Set((data ?? []).map((r) => r.video_id as string));
};

/** True when the week has at least one video and every one is watched. */
export const allVideosWatched = (videos: WeekVideo[], watchedIds: ReadonlySet<string>): boolean =>
  videos.length > 0 && videos.every((v) => watchedIds.has(v.id));

export const formatDuration = (seconds: number | null): string | null => {
  if (seconds == null || !Number.isFinite(seconds) || seconds <= 0) return null;
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}:${String(s).padStart(2, "0")}`;
};
