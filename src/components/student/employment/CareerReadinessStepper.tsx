import { Card, CardContent } from "@/components/ui/card";
import { ChevronRight } from "lucide-react";
import {
  CAREER_READINESS_STEPS,
  type CareerReadinessStep,
} from "@/lib/careerReadiness";

interface Props {
  /** Currently selected step; null renders all steps unselected. */
  active: CareerReadinessStep | null;
  onSelect: (step: CareerReadinessStep) => void;
  /** Practice stays unavailable until the student completes Prepare. */
  practiceLocked?: boolean;
}

/** The Understand → Prepare → Practice stepper card (visual only; no content). */
const CareerReadinessStepper = ({ active, onSelect, practiceLocked = false }: Props) => (
  <Card>
    <CardContent className="flex flex-wrap items-center gap-1 p-2">
      {CAREER_READINESS_STEPS.map((step, i) => {
        const selected = active === step.key;
        const locked = step.key === "practice" && practiceLocked;
        return (
          <div key={step.key} className="flex items-center">
            <button
              type="button"
              onClick={() => onSelect(step.key)}
              disabled={locked}
              aria-label={locked ? "Practice locked until five STAR stories are saved" : undefined}
              className={[
                "flex items-center gap-3 rounded-lg px-4 py-2.5 text-left transition-colors",
                selected ? "bg-primary/10" : "hover:bg-muted/60",
                locked ? "cursor-not-allowed opacity-50 hover:bg-transparent" : "",
              ].join(" ")}
            >
              <span
                className={[
                  "flex h-7 w-7 flex-none items-center justify-center rounded-full text-xs font-bold",
                  selected
                    ? "bg-primary text-primary-foreground"
                    : "border border-border text-muted-foreground",
                ].join(" ")}
              >
                {step.index}
              </span>
              <span className="min-w-0">
                <span
                  className={`block text-sm font-semibold ${selected ? "" : "text-muted-foreground"}`}
                >
                  {step.title}
                </span>
                <span
                  className={`block text-xs ${selected ? "text-primary" : "text-muted-foreground"}`}
                >
                  {step.subtitle}
                </span>
              </span>
            </button>
            {i < CAREER_READINESS_STEPS.length - 1 && (
              <ChevronRight className="mx-1 h-4 w-4 flex-none text-muted-foreground/60" />
            )}
          </div>
        );
      })}
    </CardContent>
  </Card>
);

export default CareerReadinessStepper;
