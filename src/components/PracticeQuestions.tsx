import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { CheckCircle, XCircle, Lightbulb, ChevronDown, ChevronUp } from "lucide-react";

export interface PracticeQuestion {
  question: string;
  type: "mcq" | "true_false" | "short_answer" | "code";
  options?: string[];
  answer: string;
  explanation?: string;
  topic?: string;
}

interface PracticeQuestionsProps {
  questions: PracticeQuestion[];
}

const PracticeQuestions = ({ questions }: PracticeQuestionsProps) => {
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [submitted, setSubmitted] = useState(false);
  const [expandedExplanations, setExpandedExplanations] = useState<Set<number>>(new Set());

  const handleAnswer = (index: number, value: string) => {
    if (submitted) return;
    setAnswers(prev => ({ ...prev, [index]: value }));
  };

  const handleSubmit = () => {
    setSubmitted(true);
    // Auto-expand wrong answers
    const wrong = new Set<number>();
    questions.forEach((q, i) => {
      const userAns = (answers[i] || "").trim().toLowerCase();
      const correct = q.answer.trim().toLowerCase();
      if (userAns !== correct) wrong.add(i);
    });
    setExpandedExplanations(wrong);
  };

  const handleReset = () => {
    setAnswers({});
    setSubmitted(false);
    setExpandedExplanations(new Set());
  };

  const toggleExplanation = (index: number) => {
    setExpandedExplanations(prev => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  };

  const isCorrect = (index: number): boolean => {
    const userAns = (answers[index] || "").trim().toLowerCase();
    const correct = questions[index].answer.trim().toLowerCase();
    return userAns === correct;
  };

  const answeredCount = Object.keys(answers).length;
  const correctCount = submitted ? questions.filter((_, i) => isCorrect(i)).length : 0;

  return (
    <div className="space-y-4 w-full">
      {/* Score summary when submitted */}
      {submitted && (
        <div className="rounded-lg border bg-muted/30 p-3 text-center">
          <p className="text-sm font-medium">
            Score: <span className="text-primary font-bold">{correctCount}/{questions.length}</span>
            {" "}({Math.round((correctCount / questions.length) * 100)}%)
          </p>
        </div>
      )}

      {questions.map((q, i) => {
        const userCorrect = submitted ? isCorrect(i) : null;
        const showExplanation = expandedExplanations.has(i);

        return (
          <Card key={i} className={`${submitted ? (userCorrect ? "border-primary/30" : "border-destructive/30") : answers[i] ? "border-primary/20" : ""}`}>
            <CardContent className="p-4 space-y-3">
              {/* Question header */}
              <div className="flex items-start gap-2">
                {submitted && (
                  userCorrect
                    ? <CheckCircle className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                    : <XCircle className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
                )}
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-semibold text-muted-foreground">Q{i + 1}</span>
                    {q.topic && <Badge variant="outline" className="text-[10px]">{q.topic}</Badge>}
                  </div>
                  <p className="text-sm whitespace-pre-wrap">{q.question}</p>
                </div>
              </div>

              {/* MCQ options */}
              {q.type === "mcq" && q.options && (
                <RadioGroup
                  value={answers[i] || ""}
                  onValueChange={(v) => handleAnswer(i, v)}
                  className="space-y-1.5"
                  disabled={submitted}
                >
                  {q.options.map((opt, oi) => (
                    <Label
                      key={oi}
                      htmlFor={`pq${i}-opt-${oi}`}
                      className={`flex items-center gap-3 rounded-lg border p-2.5 cursor-pointer transition-colors text-sm ${
                        submitted
                          ? opt.trim().toLowerCase() === q.answer.trim().toLowerCase()
                            ? "border-primary bg-primary/5"
                            : answers[i] === opt && !isCorrect(i)
                            ? "border-destructive bg-destructive/5"
                            : ""
                          : answers[i] === opt
                          ? "border-primary bg-primary/5"
                          : "hover:bg-muted/50"
                      }`}
                    >
                      <RadioGroupItem value={opt} id={`pq${i}-opt-${oi}`} disabled={submitted} />
                      <span>{opt}</span>
                    </Label>
                  ))}
                </RadioGroup>
              )}

              {/* True/False */}
              {q.type === "true_false" && (
                <div className="flex gap-2">
                  {["True", "False"].map((opt) => (
                    <Button
                      key={opt}
                      type="button"
                      variant={answers[i] === opt ? "default" : "outline"}
                      className={`flex-1 h-10 ${
                        submitted && opt.toLowerCase() === q.answer.trim().toLowerCase()
                          ? "border-primary bg-primary/10"
                          : ""
                      }`}
                      onClick={() => handleAnswer(i, opt)}
                      disabled={submitted}
                    >
                      {opt}
                    </Button>
                  ))}
                </div>
              )}

              {/* Short answer */}
              {q.type === "short_answer" && (
                <div className="space-y-1">
                  <Textarea
                    placeholder="Type your answer…"
                    value={answers[i] || ""}
                    onChange={(e) => handleAnswer(i, e.target.value)}
                    className="min-h-[80px]"
                    disabled={submitted}
                  />
                  {submitted && !isCorrect(i) && (
                    <p className="text-xs">
                      <span className="text-muted-foreground">Correct: </span>
                      <span className="text-primary font-medium">{q.answer}</span>
                    </p>
                  )}
                </div>
              )}

              {/* Code */}
              {q.type === "code" && (
                <div className="space-y-1">
                  <Textarea
                    placeholder="Write your code here…"
                    value={answers[i] || ""}
                    onChange={(e) => handleAnswer(i, e.target.value)}
                    className="min-h-[120px] font-mono text-sm"
                    disabled={submitted}
                  />
                  {submitted && !isCorrect(i) && (
                    <p className="text-xs">
                      <span className="text-muted-foreground">Expected: </span>
                      <code className="text-primary font-mono text-xs">{q.answer}</code>
                    </p>
                  )}
                </div>
              )}

              {/* Explanation toggle */}
              {submitted && q.explanation && (
                <button
                  onClick={() => toggleExplanation(i)}
                  className="flex items-center gap-1.5 text-xs text-primary hover:underline"
                >
                  <Lightbulb className="h-3 w-3" />
                  {showExplanation ? "Hide" : "Show"} explanation
                  {showExplanation ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                </button>
              )}

              {showExplanation && q.explanation && (
                <div className="rounded-lg border bg-muted/30 p-2.5 text-xs text-muted-foreground">
                  {q.explanation}
                </div>
              )}
            </CardContent>
          </Card>
        );
      })}

      {/* Actions */}
      <div className="flex justify-center gap-2 pt-2">
        {!submitted ? (
          <Button onClick={handleSubmit} disabled={answeredCount === 0} className="gap-2">
            <CheckCircle className="h-4 w-4" />
            Check Answers ({answeredCount}/{questions.length})
          </Button>
        ) : (
          <Button variant="outline" onClick={handleReset} className="gap-2">
            Try Again
          </Button>
        )}
      </div>
    </div>
  );
};

export default PracticeQuestions;
