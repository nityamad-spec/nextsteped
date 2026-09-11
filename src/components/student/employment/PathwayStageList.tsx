import { useState, type ReactNode } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Target, Trophy } from "lucide-react";
import PathwayStageRow from "./PathwayStageRow";
import type { PathwayStage } from "@/lib/pathwayStages";

interface Props {
  trackLabel: string;
  totalHours: number | null;
  overallPct: number;
  stages: PathwayStage[];
  /** Body rendered inside an expanded stage. */
  renderStage: (stage: PathwayStage) => ReactNode;
  /** Stage opened by default. */
  initialStageIndex?: number;
  onStageOpen?: (stage: PathwayStage) => void;
}

/** Four-stage employment pathway: Foundations → Advanced → Soft Skills → Capstone. */
const PathwayStageList = ({
  trackLabel,
  totalHours,
  overallPct,
  stages,
  renderStage,
  initialStageIndex,
  onStageOpen,
}: Props) => {
  const defaultOpen =
    initialStageIndex ?? stages.find((s) => s.status === "in_progress")?.index ?? stages[0]?.index ?? 1;
  const [openIndex, setOpenIndex] = useState<number>(defaultOpen);
  const allComplete = stages.every((s) => s.status === "complete");

  return (
    <div className="space-y-5">
      <div>
        <h2 className="font-heading text-xl font-semibold">Your Employment Pathway</h2>
        <p className="mt-0.5 text-sm text-muted-foreground">
          {trackLabel}
          {totalHours !== null && ` · ~${totalHours} hours`}
        </p>
      </div>

      <Card className="border-primary/30 bg-primary/5">
        <CardContent className="flex items-center gap-4 p-5">
          <div className="flex h-10 w-10 flex-none items-center justify-center rounded-xl bg-primary/15 text-primary">
            <Target className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold">Goal: become job-ready in tech</p>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Complete all four stages to be ready to apply, interview, and get hired.
            </p>
          </div>
          <div className="flex-none text-right">
            <p className="text-2xl font-bold leading-none text-primary">{overallPct}%</p>
            <p className="mt-1 text-[10px] uppercase tracking-wider text-muted-foreground">of the way</p>
          </div>
        </CardContent>
      </Card>

      <div>
        {stages.map((stage, i) => (
          <PathwayStageRow
            key={stage.kind}
            stage={stage}
            unlocksAfter={i > 0 ? stages[i - 1].title : undefined}
            expanded={openIndex === stage.index}
            showConnector={i < stages.length - 1}
            onToggle={() => {
              const next = openIndex === stage.index ? -1 : stage.index;
              setOpenIndex(next);
              if (next === stage.index) onStageOpen?.(stage);
            }}
          >
            {renderStage(stage)}
          </PathwayStageRow>
        ))}
      </div>

      <Card className={allComplete ? "border-warning/40 bg-warning/10" : "bg-muted/40"}>
        <CardContent className="flex items-center gap-3 p-4">
          <Trophy className="h-5 w-5 flex-none text-amber-500" />
          <div className="min-w-0">
            <p className="text-sm font-semibold">Job-Ready — start applying</p>
            <p className="text-sm text-muted-foreground">
              Finish all four stages to unlock your job-application toolkit and begin interviewing.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default PathwayStageList;
