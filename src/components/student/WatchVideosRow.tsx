// Watch cards for a unit's week videos plus the inline player dialog.
// Rendered inside the unit's Study section on the learning path.

import { useEffect, useRef, useState } from "react";
import { Check, Play } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  downloadVideoObjectUrl, formatDuration, videoEmbedUrl, videoProvider,
  videoThumbnailUrl, type WeekVideo,
} from "@/lib/weekVideos";

interface WatchVideosRowProps {
  videos: WeekVideo[];
  watchedIds: ReadonlySet<string>;
  onMarkWatched: (videoId: string) => void;
  locked?: boolean;
}

const VideoCard = ({
  video, watched, locked, onOpen,
}: {
  video: WeekVideo;
  watched: boolean;
  locked: boolean;
  onOpen: () => void;
}) => {
  const thumb = videoThumbnailUrl(video);
  const duration = formatDuration(video.duration_seconds);
  return (
    <button
      type="button"
      onClick={onOpen}
      disabled={locked}
      className="group w-44 shrink-0 overflow-hidden rounded-xl border bg-card text-left transition-colors hover:bg-muted/40 disabled:cursor-not-allowed disabled:opacity-60"
    >
      <div className="relative aspect-video w-full bg-muted">
        {thumb ? (
          <img src={thumb} alt="" className="h-full w-full object-cover" loading="lazy" />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-primary/10">
            <Play className="h-8 w-8 text-primary/60" />
          </div>
        )}
        <span className="absolute inset-0 flex items-center justify-center bg-black/0 transition-colors group-hover:bg-black/20">
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-black/60 text-white opacity-0 transition-opacity group-hover:opacity-100">
            <Play className="h-4 w-4" />
          </span>
        </span>
        {duration && (
          <span className="absolute bottom-1.5 right-1.5 rounded bg-black/70 px-1.5 py-0.5 text-[10px] font-medium text-white">
            {duration}
          </span>
        )}
        {watched && (
          <span className="absolute left-1.5 top-1.5 flex items-center gap-1 rounded bg-emerald-500 px-1.5 py-0.5 text-[10px] font-semibold text-white">
            <Check className="h-2.5 w-2.5" strokeWidth={3} /> Watched
          </span>
        )}
      </div>
      <p className="truncate px-2.5 py-2 text-xs font-medium">{video.title}</p>
    </button>
  );
};

const PlayerDialog = ({
  video, watched, onMarkWatched, onClose,
}: {
  video: WeekVideo;
  watched: boolean;
  onMarkWatched: (videoId: string) => void;
  onClose: () => void;
}) => {
  const embed = videoEmbedUrl(video);
  const provider = videoProvider(video.url);
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [loadError, setLoadError] = useState(false);
  const markedRef = useRef(watched);

  useEffect(() => {
    markedRef.current = watched;
  }, [watched]);

  // Uploaded files stream from the private bucket as an object URL.
  useEffect(() => {
    if (video.kind !== "file" || !video.storage_path) return;
    let revoked: string | null = null;
    let cancelled = false;
    (async () => {
      try {
        const url = await downloadVideoObjectUrl(video.storage_path as string);
        if (cancelled) {
          URL.revokeObjectURL(url);
          return;
        }
        revoked = url;
        setObjectUrl(url);
      } catch (err) {
        console.error("Video download error:", err);
        if (!cancelled) setLoadError(true);
      }
    })();
    return () => {
      cancelled = true;
      if (revoked) URL.revokeObjectURL(revoked);
    };
  }, [video]);

  const markOnce = () => {
    if (!markedRef.current) onMarkWatched(video.id);
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle className="pr-6 text-base">{video.title}</DialogTitle>
        </DialogHeader>
        <div className="aspect-video w-full overflow-hidden rounded-lg bg-black">
          {embed ? (
            <iframe
              src={embed}
              title={video.title}
              className="h-full w-full"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
            />
          ) : video.kind === "file" ? (
            loadError ? (
              <div className="flex h-full items-center justify-center text-sm text-white/80">
                This video couldn't be loaded. Please try again later.
              </div>
            ) : objectUrl ? (
              <video
                src={objectUrl}
                controls
                autoPlay
                className="h-full w-full"
                onEnded={markOnce}
                onTimeUpdate={(e) => {
                  const el = e.currentTarget;
                  if (el.duration > 0 && el.currentTime / el.duration >= 0.9) markOnce();
                }}
              />
            ) : (
              <div className="flex h-full items-center justify-center text-sm text-white/80">
                Loading video…
              </div>
            )
          ) : (
            <div className="flex h-full items-center justify-center text-sm text-white/80">
              This link can't be played here.
            </div>
          )}
        </div>
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs text-muted-foreground">
            {watched
              ? "Marked as watched."
              : embed
                ? `${provider === "youtube" ? "YouTube" : "Vimeo"} videos can't be auto-tracked — mark it when you're done.`
                : "Watched is marked automatically when the video finishes."}
          </p>
          {!watched && (
            <Button size="sm" variant="outline" onClick={() => onMarkWatched(video.id)}>
              <Check className="mr-1.5 h-3.5 w-3.5" /> Mark as watched
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

const WatchVideosRow = ({ videos, watchedIds, onMarkWatched, locked = false }: WatchVideosRowProps) => {
  const [openId, setOpenId] = useState<string | null>(null);
  if (videos.length === 0) return null;
  const openVideo = videos.find((v) => v.id === openId) ?? null;
  const watchedCount = videos.filter((v) => watchedIds.has(v.id)).length;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Watch</p>
        <p className="text-xs text-muted-foreground">
          {watchedCount} of {videos.length} watched
        </p>
      </div>
      <div className="flex gap-3 overflow-x-auto pb-1">
        {videos.map((video) => (
          <VideoCard
            key={video.id}
            video={video}
            watched={watchedIds.has(video.id)}
            locked={locked}
            onOpen={() => setOpenId(video.id)}
          />
        ))}
      </div>
      {openVideo && (
        <PlayerDialog
          video={openVideo}
          watched={watchedIds.has(openVideo.id)}
          onMarkWatched={onMarkWatched}
          onClose={() => setOpenId(null)}
        />
      )}
    </div>
  );
};

export default WatchVideosRow;
