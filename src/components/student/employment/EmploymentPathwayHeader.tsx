import { Card, CardContent } from "@/components/ui/card";
import { Target } from "lucide-react";

interface Props {
  /** Professor-set target role, e.g. "AI Engineer". Falls back to the course name. */
  trackLabel: string;
  /** Overall course mastery as a 0-1 value, or null when not available yet. */
  progress: number | null;
}

const EmploymentPathwayHeader = ({ trackLabel, progress }: Props) => {
  const pct = progress !== null ? Math.round(progress * 100) : null;

  return (
    <Card className="h-full border-primary/30 bg-primary/5">
      <CardContent className="flex h-full items-center gap-4 p-5">
        <div className="flex h-12 w-12 flex-none items-center justify-center rounded-xl bg-primary/15 text-primary">
          <Target className="h-6 w-6" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-primary">{trackLabel}</p>
          <p className="mt-0.5 text-lg font-heading font-semibold leading-snug">
            You're on your way to job-ready
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            Complete every stage to unlock interviews and start applying.
          </p>
        </div>
        <div className="flex-none text-right">
          <p className="text-3xl font-bold leading-none text-primary">
            {pct !== null ? `${pct}%` : "—"}
          </p>
          <p className="mt-1 text-[10px] uppercase tracking-wider text-muted-foreground">
            of the way
          </p>
        </div>
      </CardContent>
    </Card>
  );
};

export default EmploymentPathwayHeader;
