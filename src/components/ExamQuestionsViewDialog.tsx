import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface ExamQuestionRow {
  id: string;
  question_text: string;
  question_type: string;
  options: string[] | null;
  correct_index: number | null;
  answer: string;
  topic: string;
  difficulty: string;
  bloom_level: number | null;
  explanation: string | null;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  courseId: string | null;
  examId: string | null;
  examLabel: string;
}

export default function ExamQuestionsViewDialog({ open, onOpenChange, courseId, examId, examLabel }: Props) {
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<ExamQuestionRow[]>([]);

  useEffect(() => {
    if (!open || !courseId || !examId) return;
    setLoading(true);
    supabase
      .from("assessment_questions")
      .select("id, question_text, question_type, options, correct_index, answer, topic, difficulty, bloom_level, explanation")
      .eq("course_id", courseId)
      .eq("mode", "exam")
      .eq("exam_id", examId)
      .order("created_at", { ascending: true })
      .then(({ data, error }) => {
        if (error) console.error("ExamQuestionsViewDialog fetch error", error);
        setRows((data as any[] as ExamQuestionRow[]) ?? []);
        setLoading(false);
      });
  }, [open, courseId, examId]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{examLabel} — Generated Questions</DialogTitle>
          <DialogDescription>
            {rows.length} question{rows.length === 1 ? "" : "s"} generated for this exam.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center p-8">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground p-4 text-center">No questions found for this exam.</p>
        ) : (
          <div className="space-y-3">
            {rows.map((q, idx) => (
              <div key={q.id} className="rounded-lg border p-4 space-y-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-bold text-muted-foreground">Q{idx + 1}</span>
                  <Badge variant="outline" className="text-[10px]">{q.question_type}</Badge>
                  <Badge variant="outline" className="text-[10px]">{q.difficulty}</Badge>
                  {q.bloom_level != null && (
                    <Badge variant="outline" className="text-[10px]">Bloom {q.bloom_level}</Badge>
                  )}
                  <span className="text-xs text-muted-foreground">{q.topic}</span>
                </div>
                <p className="text-sm font-medium whitespace-pre-wrap">{q.question_text}</p>
                {q.question_type === "MCQ" && q.options && (
                  <div className="space-y-1 pt-1">
                    {q.options.map((opt, i) => (
                      <p
                        key={i}
                        className={`text-xs ${i === q.correct_index ? "text-mastery-expert font-medium" : "text-muted-foreground"}`}
                      >
                        {String.fromCharCode(65 + i)}. {opt}
                      </p>
                    ))}
                  </div>
                )}
                {q.question_type === "True/False" && (
                  <p className="text-xs">
                    <span className="font-medium text-foreground">Answer:</span>{" "}
                    <span className="text-mastery-expert font-medium">{q.answer}</span>
                  </p>
                )}
                {q.explanation && (
                  <p className="text-xs text-muted-foreground border-t pt-2 mt-2">
                    <span className="font-medium text-foreground">Explanation:</span> {q.explanation}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
