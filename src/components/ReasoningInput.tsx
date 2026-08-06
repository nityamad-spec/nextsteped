import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Lightbulb } from "lucide-react";
import {
  REASONING_MIN_CHARS,
  REASONING_MAX_CHARS,
  isReasoningComplete,
} from "@/lib/reasoning";

interface ReasoningInputProps {
  questionId: string;
  value: string;
  onChange: (questionId: string, text: string) => void;
  /** Show the "required" error state (e.g. after a blocked Next/Submit). */
  showError?: boolean;
  disabled?: boolean;
}

/**
 * Mandatory rationale capture for Bloom 3+ questions. Rendered directly beneath
 * the answer input on every testing surface.
 */
const ReasoningInput = ({ questionId, value, onChange, showError, disabled }: ReasoningInputProps) => {
  const trimmedLength = (value ?? "").trim().length;
  const complete = isReasoningComplete(value);
  const invalid = Boolean(showError) && !complete;

  return (
    <div className="space-y-2 rounded-lg border border-primary/25 bg-primary/[0.03] p-3">
      <Label
        htmlFor={`reasoning-${questionId}`}
        className="flex items-center gap-2 text-xs font-semibold"
      >
        <Lightbulb className="h-3.5 w-3.5 text-primary" />
        Explain your reasoning
        <span className="font-normal text-muted-foreground">(required)</span>
      </Label>
      <Textarea
        id={`reasoning-${questionId}`}
        value={value ?? ""}
        disabled={disabled}
        maxLength={REASONING_MAX_CHARS}
        onChange={(e) => onChange(questionId, e.target.value)}
        placeholder="Why did you choose this answer? Explain your thinking in a sentence or two."
        className={`min-h-[84px] text-sm ${invalid ? "border-destructive focus-visible:ring-destructive" : ""}`}
      />
      <div className="flex items-center justify-between text-[11px]">
        <span className={invalid ? "text-destructive" : "text-muted-foreground"}>
          {complete
            ? "Looks good."
            : `At least ${REASONING_MIN_CHARS} characters required.`}
        </span>
        <span className="text-muted-foreground">
          {trimmedLength}/{REASONING_MIN_CHARS}
        </span>
      </div>
    </div>
  );
};

export default ReasoningInput;
