import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { BookOpen, AlertTriangle } from "lucide-react";
import CourseAnalyticsView, { type CourseLite } from "@/components/CourseAnalyticsView";
import { supabase } from "@/integrations/supabase/client";

export type { CourseLite };

interface Props {
  course: CourseLite | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const CourseProfileDialog = ({ course, open, onOpenChange }: Props) => {
  const [flagCount, setFlagCount] = useState<number | null>(null);

  useEffect(() => {
    if (!open || !course?.id) {
      setFlagCount(null);
      return;
    }
    let cancelled = false;
    (async () => {
      const { data, error } = await (supabase.rpc as unknown as (
        fn: string,
        args: Record<string, unknown>,
      ) => Promise<{ data: unknown; error: unknown }>)(
        "reasoning_followup_analytics",
        { _course_id: course.id },
      );
      if (cancelled || error) return;
      const payload = data as { per_item?: Array<{ flagged?: boolean }> } | null;
      const n = (payload?.per_item ?? []).filter((r) => r.flagged).length;
      setFlagCount(n);
    })();
    return () => {
      cancelled = true;
    };
  }, [open, course?.id]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <BookOpen className="h-5 w-5" />
            {course?.name || "Course"}
            {course?.course_code && (
              <span className="text-sm font-normal text-muted-foreground">({course.course_code})</span>
            )}
          </DialogTitle>
          <DialogDescription asChild>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs pt-1">
              <span>Term: <span className="text-foreground">{course?.term}</span></span>
              <span>Professor: <span className="text-foreground">{course?.teacher_name}</span></span>
              <span>Code: <code className="bg-muted px-1 py-0.5 rounded text-foreground">{course?.enrollment_code}</code></span>
              <Badge variant={course?.published ? "default" : "secondary"} className="text-[10px]">
                {course?.published ? "Published" : "Draft"}
              </Badge>
              {flagCount !== null && flagCount > 0 && (
                <Badge variant="destructive" className="text-[10px] gap-1">
                  <AlertTriangle className="h-3 w-3" />
                  Follow-up flags: {flagCount}
                </Badge>
              )}
            </div>
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="flex-1 min-h-0 -mx-6 px-6 [&>[data-radix-scroll-area-viewport]]:max-h-[65vh]">
          <CourseAnalyticsView course={open ? course : null} showHeader={false} />
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
};

export default CourseProfileDialog;

