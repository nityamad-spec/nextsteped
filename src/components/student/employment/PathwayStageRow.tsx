import type { ReactNode } from "react";
import { Check, ChevronDown, ChevronUp, Lock } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { PathwayStage } from "@/lib/pathwayStages";

interface Props {
  stage: PathwayStage;
  /** Title of the stage that must finish first — used in the locked note. */
  unlocksAfter?: string;
  expanded: boolean;
  onToggle: () => void;
  /** Whether a connector line should run below this row. */
  showConnector: boolean;
  children?: ReactNode;
}

const statusWord: Record<PathwayStage["status"], string> = {
  complete: "Completed",
  in_progress: "In progress",
  locked: "Locked",
};

/** One stage in the employment pathway, with its own expandable body. */
const PathwayStageRow = ({ stage, unlocksAfter, expanded, onToggle, showConnector, children }: Props) => {
  const locked = stage.status === "locked";
  const complete = stage.status === "complete";

  return (
    <div className="relative flex gap-4">
      {/* Rail: node + connector */}
      <div className="flex flex-none flex-col items-center">
        <div
          className={[
            "flex h-9 w-9 items-center justify-center rounded-full text-sm font-bold",
            complete
              ? "bg-success text-success-foreground"
              : locked
                ? "bg-muted text-muted-foreground"
                : "bg-primary text-primary-foreground ring-4 ring-primary/15",
          ].join(" ")}
        >
          {complete ? <Check className="h-4 w-4" /> : locked ? <Lock className="h-4 w-4" /> : stage.index}
        </div>
        {showConnector && (
          <div className={`w-px flex-1 ${complete ? "bg-success/60" : "bg-border"}`} />
        )}
      </div>

      {/* Body */}
      <div className="min-w-0 flex-1 pb-6">
        <button type="button" onClick={onToggle} className="flex w-full items-start gap-2 text-left">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className={`text-sm font-semibold ${locked ? "text-muted-foreground" : ""}`}>{stage.title}</h3>
              <Badge variant="secondary" className="text-[10px]">{stage.badge}</Badge>
              {locked && (
                <Badge variant="outline" className="gap-1 text-[10px] text-muted-foreground">
                  <Lock className="h-3 w-3" /> Locked
                </Badge>
              )}
            </div>
            <p className="mt-1 text-sm text-muted-foreground">{stage.description}</p>
            <p className="mt-1 text-sm">
              <span className="font-semibold">
                {stage.completeCount}/{stage.itemCount}
              </span>{" "}
              <span className="text-muted-foreground">{stage.countNoun}</span>
              {stage.hours !== null && (
                <span className="ml-3 font-semibold">~{stage.hours} hrs</span>
              )}
              <span className="ml-3 text-muted-foreground">{statusWord[stage.status]}</span>
              {complete && <Check className="ml-1 inline h-3.5 w-3.5 text-success" />}
            </p>
          </div>
          {expanded ? (
            <ChevronUp className="mt-1 h-4 w-4 flex-none text-muted-foreground" />
          ) : (
            <ChevronDown className="mt-1 h-4 w-4 flex-none text-muted-foreground" />
          )}
        </button>

        {locked && !expanded && unlocksAfter && (
          <div className="mt-3 flex items-center gap-2 rounded-lg bg-muted/50 px-3 py-2 text-sm text-muted-foreground">
            <Lock className="h-3.5 w-3.5" /> Unlocks when you complete {unlocksAfter}.
          </div>
        )}

        {expanded && <div className="mt-4">{children}</div>}
      </div>
    </div>
  );
};

export default PathwayStageRow;
