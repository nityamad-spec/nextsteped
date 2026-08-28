import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { BookOpen, Code2, Loader2, Briefcase } from "lucide-react";
import { toast } from "sonner";
import CourseAnalyticsView, { type CourseLite } from "@/components/CourseAnalyticsView";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export type { CourseLite };

type CodingStatus = "none" | "pending" | "approved" | "rejected";

interface Props {
  course: CourseLite | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called after the admin changes coding access so the list can refresh badges. */
  onChanged?: () => void;
}

const CourseProfileDialog = ({ course, open, onOpenChange, onChanged }: Props) => {
  const { user } = useAuth();
  const [codingStatus, setCodingStatus] = useState<CodingStatus>("none");
  const [codingRequestedAt, setCodingRequestedAt] = useState<string | null>(null);
  const [codingReviewedAt, setCodingReviewedAt] = useState<string | null>(null);
  const [reviewing, setReviewing] = useState(false);
  const [courseType, setCourseType] = useState<"academic" | "employment">("academic");
  const [savingType, setSavingType] = useState(false);

  // Fetch the latest coding-access state each time the dialog opens (the list
  // row may be stale after a prior review).
  useEffect(() => {
    if (!open || !course?.id) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("courses")
        .select("coding_access_status, coding_requested_at, coding_reviewed_at, course_type")
        .eq("id", course.id)
        .maybeSingle();
      if (cancelled || !data) return;
      const s = data.coding_access_status;
      setCodingStatus(s === "pending" || s === "approved" || s === "rejected" ? s : "none");
      setCodingRequestedAt(data.coding_requested_at);
      setCodingReviewedAt(data.coding_reviewed_at);
      setCourseType(data.course_type === "employment" ? "employment" : "academic");
    })();
    return () => {
      cancelled = true;
    };
  }, [open, course?.id]);

  // Course type is locked for professors; admins may still correct it here.
  const changeCourseType = async (next: "academic" | "employment") => {
    if (!course?.id || next === courseType || savingType) return;
    setSavingType(true);
    const { error } = await supabase.from("courses").update({ course_type: next }).eq("id", course.id);
    setSavingType(false);
    if (error) {
      toast.error(`Failed to update course type: ${error.message}`);
      return;
    }
    setCourseType(next);
    toast.success(next === "employment" ? "Switched to employment pathway" : "Switched to academic course");
    onChanged?.();
  };

  const reviewCoding = async (decision: CodingStatus) => {
    if (!course?.id || !user || reviewing) return;
    setReviewing(true);
    const { error } = await supabase
      .from("courses")
      .update({
        coding_access_status: decision,
        coding_reviewed_at: new Date().toISOString(),
        coding_reviewed_by: user.id,
      })
      .eq("id", course.id);
    setReviewing(false);
    if (error) {
      toast.error(`Failed to update coding access: ${error.message}`);
      return;
    }
    setCodingStatus(decision);
    setCodingReviewedAt(new Date().toISOString());
    toast.success(
      decision === "approved"
        ? "Coding access approved"
        : decision === "rejected"
          ? "Coding access denied"
          : "Coding access revoked",
    );
    onChanged?.();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[85vh] p-0 overflow-hidden">
        <DialogHeader className="px-6 pt-6 pb-2">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
              <BookOpen className="h-5 w-5 text-primary" />
            </div>
            <div className="min-w-0">
              <DialogTitle className="text-xl truncate">{course?.name ?? "Course"}</DialogTitle>
              <DialogDescription>Course analytics and teaching insights</DialogDescription>
            </div>
          </div>
        </DialogHeader>
        <ScrollArea className="max-h-[calc(85vh-88px)] px-6 pb-6">
          {/* Course type — admin-only override (professors cannot change it) */}
          <div className="mb-4 rounded-lg border p-4">
            <div className="flex flex-wrap items-center gap-2">
              <Briefcase className="h-4 w-4 text-primary" />
              <h3 className="text-sm font-semibold">Course type</h3>
              <Badge variant="outline" className="text-[10px]">
                {courseType === "employment" ? "Employment pathway" : "Academic course"}
              </Badge>
            </div>
            <p className="mt-1.5 text-xs text-muted-foreground">
              Employment pathway courses use a workplace-readiness diagnostic and expose the Soft
              Skills module to professors and students.
            </p>
            <div className="mt-3 flex items-center gap-2">
              <Select value={courseType} onValueChange={(v) => changeCourseType(v as any)} disabled={savingType}>
                <SelectTrigger className="h-8 w-56 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="academic">Academic course</SelectItem>
                  <SelectItem value="employment">Employment pathway</SelectItem>
                </SelectContent>
              </Select>
              {savingType && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
            </div>
          </div>

          {/* Coding access review — approve/deny professor requests */}
          <div className="mb-4 rounded-lg border p-4">
            <div className="flex items-center gap-2 flex-wrap">
              <Code2 className="h-4 w-4 text-primary" />
              <h3 className="text-sm font-semibold">Coding access</h3>
              {codingStatus === "approved" ? (
                <Badge variant="outline" className="text-[10px] border-primary/40 text-primary bg-primary/5">Approved</Badge>
              ) : codingStatus === "pending" ? (
                <Badge variant="outline" className="text-[10px] border-warning/40 text-warning bg-warning/5">Pending review</Badge>
              ) : codingStatus === "rejected" ? (
                <Badge variant="outline" className="text-[10px] border-destructive/40 text-destructive bg-destructive/5">Denied</Badge>
              ) : (
                <Badge variant="secondary" className="text-[10px]">Not requested</Badge>
              )}
            </div>
            <p className="mt-1.5 text-xs text-muted-foreground">
              {codingStatus === "pending"
                ? `Requested${codingRequestedAt ? ` on ${new Date(codingRequestedAt).toLocaleDateString()}` : ""}. Approving unlocks the student code terminal and coding-specific lesson-plan content for this course.`
                : codingStatus === "approved"
                  ? `Approved${codingReviewedAt ? ` on ${new Date(codingReviewedAt).toLocaleDateString()}` : ""}. Revoking hides the code terminal and coding content again.`
                  : codingStatus === "rejected"
                    ? "Denied. The professor can submit a new request from Course Setup."
                    : "The professor has not requested coding exercises for this course."}
            </p>
            {codingStatus === "pending" && (
              <div className="mt-3 flex gap-2">
                <Button size="sm" onClick={() => reviewCoding("approved")} disabled={reviewing}>
                  {reviewing && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}
                  Approve
                </Button>
                <Button size="sm" variant="outline" onClick={() => reviewCoding("rejected")} disabled={reviewing}>
                  Deny
                </Button>
              </div>
            )}
            {codingStatus === "approved" && (
              <div className="mt-3">
                <Button size="sm" variant="outline" onClick={() => reviewCoding("none")} disabled={reviewing}>
                  {reviewing && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}
                  Revoke access
                </Button>
              </div>
            )}
          </div>
          <CourseAnalyticsView course={open ? course : null} showHeader={false} />
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
};

export default CourseProfileDialog;
