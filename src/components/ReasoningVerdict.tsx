import { CheckCircle2, Info, Loader2, Sparkles } from "lucide-react";
import type { ReasoningEvaluation } from "@/lib/reasoning";

interface ReasoningVerdictProps {
  evaluation: ReasoningEvaluation | undefined;
}

/**
 * Formative feedback panel shown under a Bloom 3+ question once the student has
 * moved past it. Carries no score — it exists purely as a teaching moment.
 */
const ReasoningVerdict = ({ evaluation }: ReasoningVerdictProps) => {
  if (!evaluation || evaluation.status === "idle") return null;

  if (evaluation.status === "pending") {
    return (
      <div className="flex items-center gap-2 rounded-lg border bg-muted/40 p-3 text-xs text-muted-foreground">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        Checking your reasoning…
      </div>
    );
  }

  if (evaluation.status === "unevaluated" || !evaluation.verdict) {
    return (
      <div className="flex items-center gap-2 rounded-lg border bg-muted/40 p-3 text-xs text-muted-foreground">
        <Info className="h-3.5 w-3.5" />
        We couldn't review your reasoning this time — it's still saved with your attempt.
      </div>
    );
  }

  const accepted = evaluation.verdict === "accepted";

  return (
    <div
      className={`space-y-2 rounded-lg border p-3 text-xs ${
        accepted
          ? "border-primary/30 bg-primary/[0.04]"
          : "border-amber-500/30 bg-amber-500/[0.06]"
      }`}
    >
      <div className="flex items-center gap-2 text-sm font-semibold">
        {accepted ? (
          <CheckCircle2 className="h-4 w-4 text-primary" />
        ) : (
          <Sparkles className="h-4 w-4 text-amber-600" />
        )}
        {accepted ? "Reasoning accepted" : "Reasoning needs work"}
      </div>
      {evaluation.feedback && (
        <p className="leading-relaxed text-muted-foreground">{evaluation.feedback}</p>
      )}
      {evaluation.modelReasoning && (
        <div className="rounded-md bg-background/60 p-2">
          <p className="mb-1 font-semibold text-foreground">Stronger reasoning</p>
          <p className="leading-relaxed text-muted-foreground">
            {evaluation.modelReasoning}
          </p>
        </div>
      )}
    </div>
  );
};

export default ReasoningVerdict;
