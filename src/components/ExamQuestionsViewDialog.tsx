import { useEffect, useState, useCallback } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2, Pencil } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

export interface ExamQuestionRow {
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
  difficulty_estimate: number | null;
  bloom_justification: string | null;
  difficulty_justification: string | null;
  exam_id: string | null;
  model_answer: string | null;
  answer_max_words: number | null;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  courseId: string | null;
  examId: string | null;
  examLabel: string;
  onEditQuestion?: (q: ExamQuestionRow) => void;
  refreshToken?: number;
}

export default function ExamQuestionsViewDialog({
  open, onOpenChange, courseId, examId, examLabel, onEditQuestion, refreshToken,
}: Props) {
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<ExamQuestionRow[]>([]);

  const load = useCallback(() => {
    if (!courseId || !examId) return;
    setLoading(true);
    supabase
      .from("assessment_questions")
      .select("id, question_text, question_type, options, correct_index, answer, topic, difficulty, bloom_level, explanation, difficulty_estimate, bloom_justification, difficulty_justification, exam_id, model_answer, answer_max_words")
      .eq("course_id", courseId)
      .eq("mode", "exam")
      .eq("exam_id", examId)
      .order("created_at", { ascending: true })
      .then(({ data, error }) => {
        if (error) console.error("ExamQuestionsViewDialog fetch error", error);
        setRows((data as any[] as ExamQuestionRow[]) ?? []);
        setLoading(false);
      });
  }, [courseId, examId]);

  useEffect(() => {
    if (!open) return;
    load();
  }, [open, load, refreshToken]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{examLabel} — Generated Questions</DialogTitle>
          <DialogDescription>
            {rows.length} question{rows.length === 1 ? "" : "s"} generated for this exam.
            {rows.length > 0 && (() => {
              const mcq = rows.filter(r => r.question_type === "MCQ").length;
              const sa = rows.filter(r => r.question_type === "Short Answer").length;
              const tf = rows.filter(r => r.question_type === "True/False").length;
              return ` ${mcq} MCQ, ${sa} short answer, ${tf} true/false.`;
            })()}
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
                  {onEditQuestion && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="ml-auto h-7 px-2 text-xs"
                      onClick={() => onEditQuestion(q)}
                    >
                      <Pencil className="mr-1 h-3 w-3" /> Edit
                    </Button>
                  )}
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
                {q.question_type === "Short Answer" && (
                  <div className="space-y-1 pt-1">
                    <p className="text-xs">
                      <span className="font-medium text-foreground">Reference answer:</span>{" "}
                      <span className="text-muted-foreground">{q.answer}</span>
                    </p>
                    {q.model_answer && (
                      <p className="text-xs whitespace-pre-wrap">
                        <span className="font-medium text-foreground">Model answer:</span>{" "}
                        <span className="text-muted-foreground">{q.model_answer}</span>
                      </p>
                    )}
                    {q.answer_max_words != null && (
                      <p className="text-xs text-muted-foreground">Suggested length: ~{q.answer_max_words} words</p>
                    )}
                  </div>
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
