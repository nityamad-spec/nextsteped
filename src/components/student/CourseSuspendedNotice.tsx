import { ShieldOff } from "lucide-react";

interface Props {
  courseName?: string | null;
}

const CourseSuspendedNotice = ({ courseName }: Props) => (
  <div className="flex min-h-[60vh] items-center justify-center p-6">
    <div className="max-w-md rounded-xl border bg-card p-8 text-center shadow-sm">
      <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10">
        <ShieldOff className="h-6 w-6 text-destructive" />
      </div>
      <h2 className="font-heading text-lg font-semibold">Access suspended</h2>
      <p className="mt-2 text-sm text-muted-foreground">
        Your access to{" "}
        <span className="font-medium text-foreground">{courseName || "this course"}</span>{" "}
        has been suspended. Your work is preserved. Please contact your professor or
        administrator to restore access.
      </p>
      <p className="mt-4 text-xs text-muted-foreground">
        If you are enrolled in other courses, switch to one using the course picker.
      </p>
    </div>
  </div>
);

export default CourseSuspendedNotice;
