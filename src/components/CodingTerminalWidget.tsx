import { useState, useMemo, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Terminal, Play, RotateCcw, X, Loader2 } from "lucide-react";

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

interface CodingTerminalWidgetProps {
  onClose: () => void;
}

export default function CodingTerminalWidget({ onClose }: CodingTerminalWidgetProps) {
  const [languageId, setLanguageId] = useState<string>(APPROVED_LANGUAGES[0].id);
  const language = useMemo(
    () => APPROVED_LANGUAGES.find((l) => l.id === languageId) ?? APPROVED_LANGUAGES[0],
    [languageId],
  );
  const [code, setCode] = useState<string>(APPROVED_LANGUAGES[0].starter);
  const [output, setOutput] = useState<string>("");
  const [isRunning, setIsRunning] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

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
    setCode(language.starter);
    setOutput("");
  };

  const handleRun = () => {
    // TODO(judge0): replace with real Judge0 submission + polling.
    setIsRunning(true);
    setOutput("");
    setTimeout(() => {
      const lineCount = code.split("\n").length;
      setOutput(
        [
          `[placeholder] Judge0 integration coming soon — your code was not executed.`,
          `Language: ${language.label}`,
          `Lines: ${lineCount}`,
        ].join("\n"),
      );
      setIsRunning(false);
    }, 400);
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
        <Button size="sm" className="h-9 gap-2" onClick={handleRun} disabled={isRunning}>
          {isRunning ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
          {isRunning ? "Running…" : "Run"}
        </Button>
        <Button variant="ghost" size="icon" className="h-9 w-9" onClick={onClose} aria-label="Close terminal">
          <X className="h-5 w-5" />
        </Button>
      </div>

      {/* Body: stacked editor + output */}
      <div className="flex-1 min-h-0 flex flex-col">
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
      </div>
    </div>
  );
}
