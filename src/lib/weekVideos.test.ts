import { describe, expect, it } from "vitest";
import {
  allVideosWatched, formatDuration, validateVideoFile, validateVideoUrl,
  videoEmbedUrl, videoProvider, videoThumbnailUrl, type WeekVideo,
} from "./weekVideos";

const link = (url: string): Pick<WeekVideo, "kind" | "url"> => ({ kind: "link", url });
const file = (storagePath: string): Pick<WeekVideo, "kind" | "url"> => ({ kind: "file", url: null });

describe("validateVideoUrl", () => {
  it("accepts standard YouTube watch links", () => {
    expect(validateVideoUrl("https://www.youtube.com/watch?v=abc123").valid).toBe(true);
  });
  it("accepts youtu.be short links", () => {
    expect(validateVideoUrl("https://youtu.be/abc123").valid).toBe(true);
  });
  it("accepts YouTube shorts links", () => {
    expect(validateVideoUrl("https://www.youtube.com/shorts/abc123").valid).toBe(true);
  });
  it("accepts Vimeo links", () => {
    expect(validateVideoUrl("https://vimeo.com/123456789").valid).toBe(true);
  });
  it("rejects empty input", () => {
    expect(validateVideoUrl("  ").valid).toBe(false);
  });
  it("rejects non-URLs", () => {
    expect(validateVideoUrl("not a link").valid).toBe(false);
  });
  it("rejects unsupported hosts", () => {
    expect(validateVideoUrl("https://example.com/video").valid).toBe(false);
  });
  it("rejects YouTube links without a video id", () => {
    expect(validateVideoUrl("https://www.youtube.com/feed/home").valid).toBe(false);
  });
  it("rejects non-http protocols", () => {
    expect(validateVideoUrl("ftp://youtube.com/watch?v=abc").valid).toBe(false);
  });
});

describe("videoProvider", () => {
  it("detects youtube and vimeo", () => {
    expect(videoProvider("https://youtu.be/abc123")).toBe("youtube");
    expect(videoProvider("https://vimeo.com/123")).toBe("vimeo");
  });
  it("returns null for missing or unknown urls", () => {
    expect(videoProvider(null)).toBeNull();
    expect(videoProvider("https://example.com")).toBeNull();
  });
});

describe("videoEmbedUrl", () => {
  it("builds a youtube-nocookie embed from a watch link", () => {
    expect(videoEmbedUrl(link("https://www.youtube.com/watch?v=abc123")))
      .toBe("https://www.youtube-nocookie.com/embed/abc123");
  });
  it("builds a youtube-nocookie embed from a short link", () => {
    expect(videoEmbedUrl(link("https://youtu.be/abc123")))
      .toBe("https://www.youtube-nocookie.com/embed/abc123");
  });
  it("builds a vimeo player embed", () => {
    expect(videoEmbedUrl(link("https://vimeo.com/123456789")))
      .toBe("https://player.vimeo.com/video/123456789");
  });
  it("returns null for uploaded files", () => {
    expect(videoEmbedUrl(file("course/videos/week-1/x.mp4"))).toBeNull();
  });
});

describe("videoThumbnailUrl", () => {
  it("builds a thumbnail for youtube links", () => {
    expect(videoThumbnailUrl(link("https://youtu.be/abc123")))
      .toBe("https://img.youtube.com/vi/abc123/hqdefault.jpg");
  });
  it("returns null for vimeo and uploads", () => {
    expect(videoThumbnailUrl(link("https://vimeo.com/123"))).toBeNull();
    expect(videoThumbnailUrl(file("x.mp4"))).toBeNull();
  });
});

describe("validateVideoFile", () => {
  it("accepts mp4, webm and mov", () => {
    for (const type of ["video/mp4", "video/webm", "video/quicktime"]) {
      expect(validateVideoFile(new File(["x"], "v.mp4", { type })).valid).toBe(true);
    }
  });
  it("rejects other types", () => {
    expect(validateVideoFile(new File(["x"], "v.avi", { type: "video/avi" })).valid).toBe(false);
  });
});

describe("allVideosWatched", () => {
  const v = (id: string) => ({ id }) as WeekVideo;
  it("is false when there are no videos", () => {
    expect(allVideosWatched([], new Set())).toBe(false);
  });
  it("is true only when every video is watched", () => {
    const videos = [v("a"), v("b")];
    expect(allVideosWatched(videos, new Set(["a"]))).toBe(false);
    expect(allVideosWatched(videos, new Set(["a", "b"]))).toBe(true);
  });
});

describe("formatDuration", () => {
  it("formats minutes and seconds", () => {
    expect(formatDuration(83)).toBe("1:23");
    expect(formatDuration(599)).toBe("9:59");
  });
  it("formats hours", () => {
    expect(formatDuration(3661)).toBe("1h 1m");
  });
  it("returns null for missing durations", () => {
    expect(formatDuration(null)).toBeNull();
    expect(formatDuration(0)).toBeNull();
  });
});
