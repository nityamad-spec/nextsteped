// Static sample question bank has been removed. All quiz and exam questions
// are now sourced exclusively from `assessment_questions` (professor-authored
// or AI-generated for the course). This module is kept only as the canonical
// home of the `Question` type used by the assessment UI.

export interface Question {
  id: string;
  text: string;
  type: "mcq" | "short_answer" | "true_false" | "problem_solving";
  options?: string[];
  correctAnswer: string;
  topic: string;
  difficulty: "Easy" | "Medium" | "Hard";
  day: number;
}
