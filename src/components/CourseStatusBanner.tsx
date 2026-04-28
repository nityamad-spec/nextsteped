import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useTeacherCourseId } from "@/hooks/useTeacherCourseId";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Globe,
  Lock,
  AlertTriangle,
  HelpCircle,
  Copy,
  Check,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";

interface CourseRow {
  id: string;
  published: boolean;
  enrollment_open: boolean;
  enrollment_code: string | null;
  teacher_id: string;
}

const CourseStatusBanner = () => {
  const { user } = useAuth();
  const courseId = useTeacherCourseId();
  const [course, setCourse] = useState<CourseRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!courseId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data } = await supabase
        .from("courses")
        .select("id, published, enrollment_open, enrollment_code, teacher_id")
        .eq("id", courseId)
        .maybeSingle();
      if (cancelled) return;
      setCourse(data as CourseRow | null);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [courseId]);

  if (loading || !course) return null;

  const isOwner = user?.id === course.teacher_id;

  const update = async (patch: Partial<Pick<CourseRow, "published" | "enrollment_open">>, successMsg: string) => {
    if (!isOwner) {
      toast.error("Only the course owner can change publish or enrollment settings.");
      return;
    }
    setBusy(true);
    const { error } = await supabase.from("courses").update(patch).eq("id", course.id);
    if (error) {
      toast.error(error.message);
    } else {
      setCourse({ ...course, ...patch });
      toast.success(successMsg);
    }
    setBusy(false);
  };

  const copyCode = () => {
    if (!course.enrollment_code) return;
    navigator.clipboard.writeText(course.enrollment_code);
    setCopied(true);
    toast.success("Enrollment code copied");
    setTimeout(() => setCopied(false), 2000);
  };

  // Determine state
  const isDraft = !course.published;
  const isLiveOpen = course.published && course.enrollment_open;
  const isLiveClosed = course.published && !course.enrollment_open;

  // Tone tokens
  const tone = isDraft
    ? {
        wrap: "border-2 border-amber-500/40 bg-amber-500/5",
        icon: "text-amber-600",
        Icon: AlertTriangle,
      }
    : isLiveOpen
      ? {
          wrap: "border-2 border-emerald-500/40 bg-emerald-500/5",
          icon: "text-emerald-600",
          Icon: Globe,
        }
      : {
          wrap: "border-2 border-sky-500/40 bg-sky-500/5",
          icon: "text-sky-600",
          Icon: Lock,
        };

  return (
    <div className={`mb-6 rounded-lg px-5 py-4 ${tone.wrap}`}>
      <div className="flex items-start gap-3">
        <tone.Icon className={`h-5 w-5 mt-0.5 shrink-0 ${tone.icon}`} />
        <div className="flex-1 min-w-0">
          {/* Status pills */}
          <div className="flex items-center gap-2 flex-wrap">
            <Badge
              variant="outline"
              className={
                course.published
                  ? "border-emerald-500/50 text-emerald-700 bg-emerald-500/10"
                  : "border-amber-500/50 text-amber-700 bg-amber-500/10"
              }
            >
              {course.published ? "Published" : "Draft"}
            </Badge>
            <Badge
              variant="outline"
              className={
                course.enrollment_open
                  ? "border-emerald-500/50 text-emerald-700 bg-emerald-500/10"
                  : "border-muted-foreground/40 text-muted-foreground"
              }
            >
              {course.enrollment_open ? "Enrollment Open" : "Enrollment Closed"}
            </Badge>

            <Popover>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                >
                  <HelpCircle className="h-3.5 w-3.5" />
                  What's the difference?
                </button>
              </PopoverTrigger>
              <PopoverContent className="w-80 text-xs space-y-2">
                <p>
                  <strong>Publish</strong> makes the course visible to students and turns on
                  the AI Teaching Assistant. Until you publish, no student can find or join
                  the course.
                </p>
                <p>
                  <strong>Enrollment Open</strong> controls whether new students can join the
                  published course using the enrollment code. Closing enrollment does not
                  affect students who already joined.
                </p>
              </PopoverContent>
            </Popover>
          </div>

          {/* Headline + body */}
          <p className="text-sm font-semibold text-foreground mt-2">
            {isDraft && "Course is in Draft"}
            {isLiveOpen && "Course is Live · accepting new students"}
            {isLiveClosed && "Course is Live · enrollment closed"}
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            {isDraft &&
              "Students cannot see or join this course yet. Publish to make it live and let students enroll with the code."}
            {isLiveOpen && (
              <>
                Students can join with code{" "}
                <code className="px-1.5 py-0.5 rounded bg-background border font-mono text-[11px]">
                  {course.enrollment_code}
                </code>
                . Existing students keep access if you close enrollment.
              </>
            )}
            {isLiveClosed &&
              "New students can no longer join. Existing students keep full access. Reopen to accept new enrollments."}
          </p>

          {/* Actions */}
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {isDraft && (
              <Button
                size="sm"
                disabled={busy || !isOwner}
                onClick={() =>
                  update(
                    { published: true, enrollment_open: true },
                    "Course published. Students can now enroll.",
                  )
                }
              >
                {busy ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Globe className="h-4 w-4 mr-2" />}
                Publish course
              </Button>
            )}
            {isLiveOpen && (
              <>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={copyCode}
                  disabled={!course.enrollment_code}
                >
                  {copied ? <Check className="h-4 w-4 mr-2" /> : <Copy className="h-4 w-4 mr-2" />}
                  Copy code
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busy || !isOwner}
                  onClick={() =>
                    update({ enrollment_open: false }, "Enrollment closed for new students.")
                  }
                >
                  {busy ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Lock className="h-4 w-4 mr-2" />}
                  Close enrollment
                </Button>
              </>
            )}
            {isLiveClosed && (
              <Button
                size="sm"
                disabled={busy || !isOwner}
                onClick={() =>
                  update({ enrollment_open: true }, "Enrollment reopened.")
                }
              >
                {busy ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Globe className="h-4 w-4 mr-2" />}
                Reopen enrollment
              </Button>
            )}
            {!isOwner && (
              <span className="text-[11px] text-muted-foreground italic">
                Only the course owner can change these settings.
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default CourseStatusBanner;
