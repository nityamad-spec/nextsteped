import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { BookOpen } from "lucide-react";
import CourseProfileContent from "./CourseProfileContent";

export interface CourseLite {
  id: string;
  name: string;
  course_code: string | null;
  term: string;
  teacher_name: string;
  teacher_email: string | null;
  enrollment_code: string;
  published: boolean;
  enrollment_open: boolean;
}

interface Props {
  course: CourseLite | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const CourseProfileDialog = ({ course, open, onOpenChange }: Props) => {
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
            </div>
          </DialogDescription>
        </DialogHeader>

        {open && course && (
          <CourseProfileContent courseId={course.id} courseName={course.name} variant="dialog" />
        )}
      </DialogContent>
    </Dialog>
  );
};

export default CourseProfileDialog;
