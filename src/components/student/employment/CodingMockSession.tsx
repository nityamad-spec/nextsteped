import { useEffect, useState } from "react";
import { Check, ChevronRight, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import MockReadyScreen from "./MockReadyScreen";
import { cn } from "@/lib/utils";
import { formatElapsedTime, type MockConfig } from "@/lib/codingMock";

interface Props {
  config: MockConfig;
  onExit: () => void;
}

type Stage = "ready" | "live" | "review";

/** Circular progress ring used for the live timer. */
function TimerRing({ elapsed, totalSeconds }: { elapsed: number; totalSeconds: number }) {
  const radius = 52;
  const stroke = 8;
  const normalizedRadius = radius - stroke * 0.5;
  const circumference = normalizedRadius * 2 * Math.PI;
  const progress = Math.min(elapsed / totalSeconds, 1);
  const dashoffset = circumference - progress * circumference;

  return (
    <div className="relative flex h-48 w-48 items-center justify-center">
      <svg height={radius * 2} width={radius * 2} className="-rotate-90">
        <circle
          stroke="currentColor"
          strokeWidth={stroke}
          fill="transparent"
          r={normalizedRadius}
          cx={radius}
          cy={radius}
          className="text-muted/30"
        />
        <circle
          stroke="currentColor"
          strokeWidth={stroke}
          strokeLinecap="round"
          fill="transparent"
          r={normalizedRadius}
          cx={radius}
          cy={radius}
          style={{ strokeDasharray: circumference, strokeDashoffset: dashoffset }}
          className="text-primary transition-all duration-1000 ease-linear"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <p className="font-heading text-4xl font-bold tracking-tight">
          {formatElapsedTime(elapsed)}
        </p>
        <p className="mt-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          of {formatElapsedTime(totalSeconds)}
        </p>
      </div>
    </div>
  );
}

/** Live screen with prompt, timer, and coach checklist. */
function LiveScreen({
  config,
  onEnd,
  onAbort,
}: {
  config: MockConfig;
  onEnd: (elapsed: number, checkedCount: number) => void;
  onAbort: () => void;
}) {
  const totalSeconds = config.minutes * 60;
  const [elapsed, setElapsed] = useState(0);
  const [checked, setChecked] = useState<Set<string>>(new Set());

  useEffect(() => {
    const interval = setInterval(() => {
      setElapsed((prev) => {
        const next = prev + 1;
        if (next >= totalSeconds) {
          clearInterval(interval);
          return totalSeconds;
        }
        return next;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [totalSeconds]);

  useEffect(() => {
    if (elapsed >= totalSeconds) {
      onEnd(elapsed, checked.size);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [elapsed, checked.size]);

  const toggle = (id: string) => {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const shortTitle = config.title.replace(/ mock$/i, "");

  return (
    <div className="space-y-4">
      <Card className="border-l-4 border-l-primary">
        <CardContent className="space-y-3 p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {shortTitle} · Live
            </p>
          </div>
          <h3 className="font-heading text-xl font-semibold sm:text-2xl">
            {config.prompt.question}
          </h3>
          <p className="text-sm text-muted-foreground">
            Follow up: {config.prompt.followUp}
          </p>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardContent className="flex flex-col items-center justify-center space-y-4 p-6">
            <TimerRing elapsed={elapsed} totalSeconds={totalSeconds} />
            <div className="flex flex-wrap items-center justify-center gap-3">
              <Button onClick={() => onEnd(elapsed, checked.size)}>
                <Check className="h-4 w-4" />
                End & review
              </Button>
              <Button variant="outline" onClick={onAbort}>
                <Square className="h-4 w-4" />
                Abort
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="space-y-4 p-5">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Live coach
              </p>
              <p className="text-xs font-medium text-muted-foreground">
                {checked.size}/{config.checklist.length} habits
              </p>
            </div>
            <div className="space-y-2">
              {config.checklist.map((item) => {
                const isChecked = checked.has(item.id);
                return (
                  <button
                    key={item.id}
                    onClick={() => toggle(item.id)}
                    className={cn(
                      "flex w-full items-start gap-3 rounded-lg border p-3 text-left transition-colors",
                      isChecked ? "bg-primary/5 border-primary/30" : "hover:bg-muted/50"
                    )}
                  >
                    <Checkbox
                      checked={isChecked}
                      onCheckedChange={() => toggle(item.id)}
                      className="mt-0.5"
                      aria-label={item.label}
                    />
                    <span className={cn("text-sm", isChecked && "line-through opacity-60")}>
                      {item.label}
                    </span>
                  </button>
                );
              })}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}


/** Three-screen mock interview session driven by a config. */
const CodingMockSession = ({ config, onExit }: Props) => {
  const [stage, setStage] = useState<Stage>("ready");
  const [elapsedAtEnd, setElapsedAtEnd] = useState(0);
  const [checkedAtEnd, setCheckedAtEnd] = useState(0);

  const handleEnd = (elapsed: number, checked: number) => {
    setElapsedAtEnd(elapsed);
    setCheckedAtEnd(checked);
    setStage("review");
  };

  return (
    <div className="space-y-4">
      {stage === "ready" && (
        <MockReadyScreen
          title={config.title.replace(/ mock$/i, "")}
          minutes={config.minutes}
          onBack={onExit}
          onStart={() => setStage("live")}
        />
      )}
      {stage === "live" && (
        <LiveScreen
          config={config}
          onEnd={(elapsed, checked) => handleEnd(elapsed, checked)}
          onAbort={onExit}
        />
      )}
      {stage === "review" && (
        <MockReviewScreen
          config={config}
          elapsed={elapsedAtEnd}
          checkedCount={checkedAtEnd}
          onExit={onExit}
        />
      )}
    </div>
  );
};

export default CodingMockSession;
