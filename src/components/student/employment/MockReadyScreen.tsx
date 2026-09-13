import { ArrowLeft, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { CODING_PREP_STEPS } from "@/lib/codingMock";

interface Props {
  title: string;
  minutes: number;
  onBack: () => void;
  onStart?: () => void;
}

/** Shared preparation screen for every mock interview type. */
const MockReadyScreen = ({ title, minutes, onBack, onStart }: Props) => (
  <Card>
    <CardContent className="space-y-6 p-6">
      <div className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {title} mock · {minutes} min
        </p>
        <h2 className="font-heading text-3xl font-bold">Ready?</h2>
        <p className="text-sm text-muted-foreground">Before you start:</p>
      </div>

      <div className="space-y-3">
        {CODING_PREP_STEPS.map((step) => (
          <div key={step.number} className="flex items-center gap-4 rounded-lg border p-4">
            <div className="flex h-8 w-8 flex-none items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
              {step.number}
            </div>
            <p className="text-sm font-medium">{step.text}</p>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={onStart} disabled={!onStart}>
          <Play className="h-4 w-4" />
          Start timer
        </Button>
        <Button variant="outline" onClick={onBack}>
          <ArrowLeft className="h-4 w-4" />
          Back
        </Button>
      </div>
    </CardContent>
  </Card>
);

export default MockReadyScreen;