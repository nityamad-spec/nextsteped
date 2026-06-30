import { useApp } from "@/contexts/AppContext";
import { useTeacherCourseId } from "@/hooks/useTeacherCourseId";
import CourseProfileContent from "@/components/admin/CourseProfileContent";
import { BarChart3 } from "lucide-react";

const CourseAnalytics = () => {
  const courseId = useTeacherCourseId();
  const { currentCourse } = useApp();

  return (
    <div className="container mx-auto max-w-5xl space-y-4 p-4 sm:p-6">
      <header className="space-y-1">
        <h1 className="flex items-center gap-2 font-heading text-2xl font-bold">
          <BarChart3 className="h-6 w-6 text-primary" />
          Course Analytics
        </h1>
        <p className="text-sm text-muted-foreground">
          {currentCourse?.name
            ? `Enrollment, mastery, completion, and assessment activity for ${currentCourse.name}.`
            : "Enrollment, mastery, completion, and assessment activity for this course."}
        </p>
      </header>

      {courseId ? (
        <CourseProfileContent
          courseId={courseId}
          courseName={currentCourse?.name ?? null}
          variant="page"
        />
      ) : (
        <div className="rounded-lg border bg-card p-8 text-center text-sm text-muted-foreground">
          No course selected yet.
        </div>
      )}
    </div>
  );
};

export default CourseAnalytics;
