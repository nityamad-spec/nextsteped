import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Brain } from "lucide-react";

type MasteryLevel = "not_explored" | "beginner" | "developing" | "proficient" | "expert";

const getMasteryLevel = (attempted: number, score: number): MasteryLevel => {
  if (attempted === 0) return "not_explored";
  if (score <= 0.25) return "beginner";
  if (score <= 0.5) return "developing";
  if (score <= 0.75) return "proficient";
  return "expert";
};

const MASTERY_LABEL: Record<MasteryLevel, string> = {
  not_explored: "Not explored",
  beginner: "Beginner",
  developing: "Developing",
  proficient: "Proficient",
  expert: "Expert",
};

const MASTERY_TILE_CLASS: Record<MasteryLevel, string> = {
  not_explored: "bg-background border text-muted-foreground",
  beginner: "bg-destructive/15 text-foreground border border-destructive/30",
  developing: "bg-amber-500/15 text-foreground border border-amber-500/30",
  proficient: "bg-primary/25 text-foreground",
  expert: "bg-primary text-primary-foreground",
};

const MASTERY_SWATCH_CLASS: Record<MasteryLevel, string> = {
  not_explored: "bg-background border",
  beginner: "bg-destructive/30",
  developing: "bg-amber-500/40",
  proficient: "bg-primary/25",
  expert: "bg-primary",
};

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  concepts: { id: string; name: string }[];
  conceptMastery: Record<string, { score: number; attempted: number }>;
  courseMastery: number | null;
}

const ConceptMasteryDialog = ({ open, onOpenChange, concepts, conceptMastery, courseMastery }: Props) => {
  const overallPct = courseMastery !== null ? Math.round(courseMastery * 100) : 0;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Brain className="h-4 w-4 text-primary" /> Concept mastery map
          </DialogTitle>
          <DialogDescription>
            Your mastery per concept — grows as you work with the AI tutor, complete quizzes and exams. Separate from lesson completion.
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center justify-between gap-4 mt-2">
          <Progress value={overallPct} className="h-2 flex-1" />
          <div className="text-right shrink-0">
            <p className="text-2xl font-bold text-primary leading-none">{courseMastery !== null ? `${overallPct}%` : "—"}</p>
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground mt-1">Overall</p>
          </div>
        </div>

        <div className="mt-4">
          {concepts.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">
              Concepts will appear here once your professor sets them up.
            </p>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {concepts.map((concept) => {
                const m = conceptMastery[concept.id];
                const attempted = m?.attempted ?? 0;
                const score = m?.score ?? 0;
                const level = getMasteryLevel(attempted, score);
                const pct = attempted > 0 ? Math.floor(score * 100) : null;
                return (
                  <Tooltip key={concept.id}>
                    <TooltipTrigger asChild>
                      <div className={`rounded-lg p-3 text-center cursor-default transition-colors ${MASTERY_TILE_CLASS[level]}`}>
                        <p className="text-xs font-medium truncate">{concept.name}</p>
                        <p className="text-sm font-semibold mt-1">{MASTERY_LABEL[level]}</p>
                        {pct !== null && <p className="text-[10px] opacity-80 mt-0.5">{pct}%</p>}
                      </div>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>
                        {concept.name}: {MASTERY_LABEL[level]}
                        {pct !== null ? ` (${pct}% mastery)` : ""}
                      </p>
                    </TooltipContent>
                  </Tooltip>
                );
              })}
            </div>
          )}
        </div>

        <div className="flex items-center justify-center gap-3 mt-4 flex-wrap">
          {(["not_explored", "beginner", "developing", "proficient", "expert"] as MasteryLevel[]).map((lvl) => (
            <div key={lvl} className="flex items-center gap-1.5">
              <div className={`h-3 w-3 rounded ${MASTERY_SWATCH_CLASS[lvl]}`} />
              <span className="text-[10px] text-muted-foreground">{MASTERY_LABEL[lvl]}</span>
            </div>
          ))}
        </div>
        <p className="text-xs text-muted-foreground text-center mt-2">
          The more you engage with the Teaching Assistant, the more accurate your exploration and mastery insights become.
        </p>
      </DialogContent>
    </Dialog>
  );
};

export default ConceptMasteryDialog;
