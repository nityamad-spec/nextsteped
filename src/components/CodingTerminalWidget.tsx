import { useState, useMemo, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Terminal, Play, RotateCcw, X, Loader2, ChevronDown, ChevronUp, FileCode2, Bot, CheckCircle2, XCircle, ListChecks } from "lucide-react";
import TerminalAssistantPanel from "@/components/student/TerminalAssistantPanel";
import { supabase } from "@/integrations/supabase/client";
import type { CodingTestCase } from "@/lib/codingExercises";
import {
  runCodeAgainstTestCases,
  type TestRunCase,
  type TestRunResult,
} from "@/lib/codingExerciseTestRun";
import { useToast } from "@/hooks/use-toast";

// TODO(judge0): This approved-languages list will later be sourced from a
// professor-controlled setting (likely course_ta_settings) so each course
// only exposes languages the instructor has approved. Hardcoded for the
// UI placeholder pass.
const APPROVED_LANGUAGES: { id: string; label: string; starter: string }[] = [
  { id: "python", label: "Python 3", starter: `print("Hello, world!")\n` },
  { id: "cpp", label: "C++", starter: `#include <iostream>\nusing namespace std;\n\nint main() {\n  cout << "Hello, world!" << endl;\n  return 0;\n}\n` },
  { id: "java", label: "Java", starter: `public class Main {\n  public static void main(String[] args) {\n    System.out.println("Hello, world!");\n  }\n}\n` },
  { id: "javascript", label: "JavaScript (Node)", starter: `console.log("Hello, world!");\n` },
];

/** Map a course exercise language to a terminal-supported language id. */
function toTerminalLanguage(lang?: string | null): string {
  const normalized = (lang ?? "").toLowerCase();
  if (APPROVED_LANGUAGES.some((l) => l.id === normalized)) return normalized;
  if (normalized === "typescript") return "javascript";
  return APPROVED_LANGUAGES[0].id;
}

interface CodingTerminalWidgetProps {
  onClose: () => void;
  /** Pre-filled skeleton code for the exercise (overrides the default starter). */
  initialCode?: string | null;
  /** Exercise language — mapped to the closest supported terminal language. */
  initialLanguage?: string | null;
  /** When set, a collapsible problem-statement panel is shown above the editor. */
  exerciseTitle?: string | null;
  exerciseStatement?: string | null;
  /** Freeform practice only: enables the Socratic coding-assistant side panel. */
  assistantEnabled?: boolean;
  /** Course the terminal session belongs to (required when assistantEnabled). */
  courseId?: string | null;
  /** Resume a previous terminal-help conversation. */
  assistantSessionId?: string | null;
  /** Unit label for new assistant session titles (e.g. "Unit 4"). */
  unitLabel?: string | null;
  /** Concept names covered by this practice session (assistant context). */
  concepts?: string[];
  /**
   * Enables the graded submit panel: the student's code runs against the
   * exercise's visible test cases, each attempt is recorded, and a full pass
   * marks the exercise solved.
   */
  submission?: {
    exerciseId: string;
    courseId: string;
    studentId: string;
    testCases: CodingTestCase[];
    /** "daily" = Daily DSA bank: attempts recorded in daily_dsa_attempts, and a
     *  passing attempt is what marks the question solved (no progress row). */
    bank?: "daily";
    /**
     * Daily-bank mastery context: a first full pass on a concept-tagged
     * question nudges mastery at practice strength. Pass through from the
     * question row; omitted/untagged questions are mastery-neutral.
     */
    mastery?: { conceptId: string | null; bloomLevel?: number | null };
    onSolved?: () => void;
  } | null;
}

export default function CodingTerminalWidget({
  onClose,
  initialCode,
  initialLanguage,
  exerciseTitle,
  exerciseStatement,
  assistantEnabled = false,
  courseId,
  assistantSessionId,
  unitLabel,
  concepts,
  submission,
}: CodingTerminalWidgetProps) {
  const { toast } = useToast();
  const initialLangId = toTerminalLanguage(initialLanguage);
  const [languageId, setLanguageId] = useState<string>(initialLangId);
  const language = useMemo(
    () => APPROVED_LANGUAGES.find((l) => l.id === languageId) ?? APPROVED_LANGUAGES[0],
    [languageId],
  );
  const hasExercise = !!(exerciseTitle || exerciseStatement);
  const initialStarter =
    initialCode?.trim() && languageId === initialLangId
      ? initialCode
      : (APPROVED_LANGUAGES.find((l) => l.id === initialLangId)?.starter ?? APPROVED_LANGUAGES[0].starter);
  const [code, setCode] = useState<string>(initialStarter);
  const [output, setOutput] = useState<string>("");
  const [isRunning, setIsRunning] = useState(false);
  const [showStatement, setShowStatement] = useState(hasExercise);
  const [showAssistant, setShowAssistant] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [testResults, setTestResults] = useState<TestRunResult[] | null>(null);
  const [solved, setSolved] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  // Latest values for the assistant's per-send context snapshot.
  const codeRef = useRef(code);
  codeRef.current = code;
  const outputRef = useRef(output);
  outputRef.current = output;

  const canSubmit = !!submission && submission.testCases.length > 0;

  const handleSubmit = async () => {
    if (!submission || isSubmitting) return;
    setIsSubmitting(true);
    setTestResults(null);
    const cases: TestRunCase[] = submission.testCases.map((t, i) => ({
      kind: "standard" as const,
      index: i + 1,
      input: t.input ?? "",
      expected: t.expected_output ?? "",
    }));
    try {
      const results = await runCodeAgainstTestCases(languageId, code, cases);
      setTestResults(results);
      const passedCount = results.filter((r) => r.passed).length;
      const allPassed = passedCount === results.length && results.length > 0;
      setSolved(allPassed);

      const attemptPayload = {
        student_id: submission.studentId,
        course_id: submission.courseId,
        submitted_code: code,
        language: languageId,
        passed: allPassed,
        cases_passed: passedCount,
        cases_total: results.length,
        results: results.map((r) => ({
          index: r.index,
          passed: r.passed,
          status: r.status,
        })) as any,
      };
      const { error: attemptError } =
        submission.bank === "daily"
          ? await supabase
              .from("daily_dsa_attempts")
              .insert({ ...attemptPayload, question_id: submission.exerciseId })
          : await supabase
              .from("coding_attempts")
              .insert({ ...attemptPayload, exercise_id: submission.exerciseId });
      if (attemptError) console.error("[terminal] attempt log failed", attemptError);

      if (allPassed) {
        // Daily-bank questions are marked solved by the passing attempt itself;
        // weekly exercises still record a progress row.
        if (submission.bank !== "daily") {
          const { error: progressError } = await supabase
            .from("coding_exercise_progress")
            .upsert(
              {
                student_id: submission.studentId,
                exercise_id: submission.exerciseId,
                course_id: submission.courseId,
                source: "daily_pass",
              },
              { onConflict: "student_id,exercise_id", ignoreDuplicates: true },
            );
          if (progressError) console.error("[terminal] progress log failed", progressError);
        } else if (submission.mastery?.conceptId) {
          // Concept-tagged daily question: first full pass nudges mastery at
          // practice strength (the update-mastery function caps practice
          // evidence at Proficient). Re-solves never re-nudge.
          try {
            const { count: priorPasses } = await supabase
              .from("daily_dsa_attempts")
              .select("id", { count: "exact", head: true })
              .eq("question_id", submission.exerciseId)
              .eq("student_id", submission.studentId)
              .eq("passed", true);
            if ((priorPasses ?? 0) <= 1) {
              const { error: masteryError } = await supabase.functions.invoke("update-mastery", {
                body: {
                  course_id: submission.courseId,
                  source: "practice",
                  per_question: [
                    {
                      concept_id: submission.mastery.conceptId,
                      difficulty: 0.5,
                      bloom: submission.mastery.bloomLevel ?? 3,
                      is_correct: true,
                    },
                  ],
                },
              });
              if (masteryError) console.error("[terminal] mastery update failed", masteryError);
            }
          } catch (e) {
            console.error("[terminal] mastery update failed", e);
          }
        }
        submission.onSolved?.();
        toast({
          title: "Solved!",
          description: "All test cases passed — today's problem is done.",
        });
      } else {
        toast({
          title: `${passedCount} of ${results.length} test cases passed`,
          description: "Fix the failing cases and submit again.",
          variant: "destructive",
        });
      }
    } catch (e) {
      toast({
        title: "Couldn't run your submission",
        description: e instanceof Error ? e.message : "Please try again in a moment.",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleLanguageChange = (id: string) => {
    const next = APPROVED_LANGUAGES.find((l) => l.id === id);
    if (!next) return;
    setLanguageId(id);
    // If the editor still holds the previous language's starter (or is empty),
    // swap in the new starter. Otherwise leave student code intact.
    const currentIsStarter = APPROVED_LANGUAGES.some((l) => l.starter === code);
    if (currentIsStarter || code.trim() === "") {
      setCode(next.starter);
    }
  };

  const handleReset = () => {
    // Reset to the exercise starter when we're on its language, else the default.
    setCode(languageId === initialLangId && initialCode?.trim() ? initialCode : language.starter);
    setOutput("");
  };

  const handleRun = async () => {
    setIsRunning(true);
    setOutput("");
    try {
      const { data, error } = await supabase.functions.invoke("run-code", {
        body: { language: languageId, code },
      });
      if (error) {
        const status = (error as { context?: { status?: number } })?.context?.status;
        setOutput(
          status === 503
            ? "Code execution isn't set up yet. Please contact your instructor."
            : `Could not run your code. ${error.message ?? ""}`.trim(),
        );
        return;
      }
      if (data?.error) {
        setOutput(String(data.error));
        return;
      }
      const parts: string[] = [];
      if (data?.compileOutput) parts.push(String(data.compileOutput).trimEnd());
      if (data?.stdout) parts.push(String(data.stdout).trimEnd());
      if (data?.stderr) parts.push(String(data.stderr).trimEnd());
      if (data?.message) parts.push(String(data.message).trimEnd());
      if (parts.length === 0) parts.push(`(no output) — ${data?.status ?? "Finished"}`);
      if (data?.time) parts.push(`\n[${data.status} · ${data.time}s]`);
      setOutput(parts.join("\n"));
    } catch (e) {
      setOutput(`Could not run your code. ${e instanceof Error ? e.message : ""}`.trim());
    } finally {
      setIsRunning(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Tab") {
      e.preventDefault();
      const el = e.currentTarget;
      const start = el.selectionStart;
      const end = el.selectionEnd;
      const next = code.substring(0, start) + "  " + code.substring(end);
      setCode(next);
      // Restore caret after React re-render
      requestAnimationFrame(() => {
        if (textareaRef.current) {
          textareaRef.current.selectionStart = textareaRef.current.selectionEnd = start + 2;
        }
      });
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-background flex flex-col">
      {/* Header */}
      <div className="border-b px-4 sm:px-6 py-3 flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2 mr-auto">
          <Terminal className="h-5 w-5 text-primary" />
          <h2 className="text-base sm:text-lg font-semibold">Code Terminal</h2>
        </div>

        <Select value={languageId} onValueChange={handleLanguageChange}>
          <SelectTrigger className="h-9 w-[180px] text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {APPROVED_LANGUAGES.map((l) => (
              <SelectItem key={l.id} value={l.id}>
                {l.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Button variant="outline" size="sm" className="h-9 gap-2" onClick={handleReset} disabled={isRunning}>
          <RotateCcw className="h-4 w-4" /> <span className="hidden sm:inline">Reset</span>
        </Button>
        <Button variant={canSubmit ? "outline" : "default"} size="sm" className="h-9 gap-2" onClick={handleRun} disabled={isRunning || isSubmitting}>
          {isRunning ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
          {isRunning ? "Running…" : "Run"}
        </Button>
        {canSubmit && (
          <Button size="sm" className="h-9 gap-2" onClick={handleSubmit} disabled={isRunning || isSubmitting}>
            {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <ListChecks className="h-4 w-4" />}
            {isSubmitting ? "Checking…" : "Submit solution"}
          </Button>
        )}
        {assistantEnabled && courseId && (
          <Button
            variant={showAssistant ? "secondary" : "outline"}
            size="sm"
            className="h-9 gap-2"
            onClick={() => setShowAssistant((v) => !v)}
            aria-pressed={showAssistant}
          >
            <Bot className="h-4 w-4" /> <span className="hidden sm:inline">Assistant</span>
          </Button>
        )}
        <Button variant="ghost" size="icon" className="h-9 w-9" onClick={onClose} aria-label="Close terminal">
          <X className="h-5 w-5" />
        </Button>
      </div>

      {/* Body: editor + output, with optional assistant side panel */}
      <div className="flex-1 min-h-0 flex flex-col md:flex-row">
      <div className="flex-1 min-h-0 min-w-0 flex flex-col">
        {/* Exercise problem statement (collapsible) */}
        {hasExercise && (
          <div className="border-b bg-muted/20">
            <button
              type="button"
              onClick={() => setShowStatement((v) => !v)}
              className="flex w-full items-center gap-2 px-4 sm:px-6 py-2 text-left text-xs uppercase tracking-wide text-muted-foreground hover:bg-muted/40"
            >
              <FileCode2 className="h-3.5 w-3.5 text-primary" />
              <span className="font-semibold normal-case tracking-normal text-sm text-foreground">
                {exerciseTitle || "Coding exercise"}
              </span>
              {showStatement ? (
                <ChevronUp className="ml-auto h-4 w-4" />
              ) : (
                <ChevronDown className="ml-auto h-4 w-4" />
              )}
            </button>
            {showStatement && exerciseStatement && (
              <div className="max-h-48 overflow-auto px-4 sm:px-6 pb-3">
                <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">
                  {exerciseStatement}
                </p>
              </div>
            )}
          </div>
        )}

        {/* Editor pane */}
        <div className="flex-[3] min-h-0 flex flex-col border-b">
          <div className="px-4 sm:px-6 py-2 text-xs uppercase tracking-wide text-muted-foreground border-b bg-muted/40">
            Editor
          </div>
          <textarea
            ref={textareaRef}
            value={code}
            onChange={(e) => setCode(e.target.value)}
            onKeyDown={handleKeyDown}
            spellCheck={false}
            className="flex-1 w-full resize-none bg-background text-foreground font-mono text-sm leading-6 px-4 sm:px-6 py-3 outline-none focus:ring-0 whitespace-pre"
            placeholder={`Write your ${language.label} code here…`}
          />
        </div>

        {/* Output pane */}
        <div className="flex-[2] min-h-0 flex flex-col">
          <div className="px-4 sm:px-6 py-2 text-xs uppercase tracking-wide text-muted-foreground border-b bg-muted/40 flex items-center justify-between">
            <span>Output</span>
            {isRunning && (
              <span className="flex items-center gap-1 text-xs normal-case tracking-normal">
                <Loader2 className="h-3 w-3 animate-spin" /> Running…
              </span>
            )}
          </div>
          <div className="flex-1 overflow-auto bg-muted/30">
            <pre className="font-mono text-sm leading-6 px-4 sm:px-6 py-3 whitespace-pre-wrap text-foreground min-h-full">
              {output || (
                <span className="text-muted-foreground">Run your code to see output here.</span>
              )}
            </pre>
          </div>
        </div>

        {/* Test-case results (graded submissions only) */}
        {canSubmit && (
          <div className="border-t bg-background">
            <div className="px-4 sm:px-6 py-2 text-xs uppercase tracking-wide text-muted-foreground border-b bg-muted/40 flex items-center justify-between">
              <span>Test cases ({submission!.testCases.length})</span>
              {solved && (
                <span className="flex items-center gap-1 text-xs normal-case tracking-normal text-primary">
                  <CheckCircle2 className="h-3.5 w-3.5" /> Solved
                </span>
              )}
            </div>
            <div className="max-h-40 overflow-auto px-4 sm:px-6 py-2">
              {!testResults && (
                <p className="py-1 text-sm text-muted-foreground">
                  Submit your solution to check it against every test case.
                </p>
              )}
              {testResults?.map((r) => (
                <div key={r.index} className="flex items-start gap-2 py-1 text-sm">
                  {r.passed ? (
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                  ) : (
                    <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
                  )}
                  <span className="font-medium">Case {r.index}</span>
                  {!r.passed && (
                    <span className="min-w-0 flex-1 truncate font-mono text-xs text-muted-foreground">
                      expected “{r.expected.trim()}” · got “{(r.message || r.actual).trim()}”
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>


      {/* Assistant side panel (freeform practice only) */}
      {assistantEnabled && courseId && showAssistant && (
        <div className="h-[45%] md:h-auto md:w-[380px] shrink-0 border-t md:border-t-0 md:border-l flex flex-col min-h-0">
          <TerminalAssistantPanel
            courseId={courseId}
            resumeSessionId={assistantSessionId}
            unitLabel={unitLabel}
            getCodeContext={() => ({
              language: language.label,
              code: codeRef.current,
              output: outputRef.current,
              concepts: concepts ?? [],
            })}
          />
        </div>
      )}
      </div>
    </div>
  );
}
