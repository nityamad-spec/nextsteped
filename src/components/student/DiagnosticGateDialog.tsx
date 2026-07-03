import { useNavigate } from "react-router-dom";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Brain } from "lucide-react";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  courseId: string | null | undefined;
  /** Optional short description of what the student was trying to do. */
  context?: string;
}

/**
 * Blocking dialog shown when a student attempts an assessment-scored surface
 * (weekly quiz, exam prep, practice) without having completed the diagnostic.
 */
export default function DiagnosticGateDialog({ open, onOpenChange, courseId, context }: Props) {
  const navigate = useNavigate();
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <Brain className="h-5 w-5 text-primary" />
            Complete the diagnostic first
          </AlertDialogTitle>
          <AlertDialogDescription>
            {context ? `${context} ` : ""}
            The diagnostic quiz calibrates the Teaching Assistant to your current level.
            You'll be able to access quizzes, practice exams, and exam prep as soon as you finish it.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Not now</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => {
              onOpenChange(false);
              navigate(`/student/diagnostic${courseId ? `?course=${courseId}` : ""}`);
            }}
          >
            Take the diagnostic
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
