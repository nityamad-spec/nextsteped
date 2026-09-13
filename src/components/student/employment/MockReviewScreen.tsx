import { ChevronRight, Video } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { formatElapsedTime, type MockConfig } from "@/lib/codingMock";

interface Props {
  config: MockConfig;
  /** Seconds spent in the session. */
  elapsed: number;
  /** Coach-checklist habits ticked off. */
  checkedCount: number;
  onExit: () => void;
  /** Heading, e.g. "Session complete" or the mock type for a past session. */
  heading?: string;
  /** Relative date shown for a past session. */
  when?: string;
  /** Demo score out of 10 for a past session. */
  score?: number;
  /** Show the (demo-only) recording panel. */
  showRecording?: boolean;
  exitLabel?: string;
}

/** Review of a mock interview — used live at the end and for past sessions. */
const MockReviewScreen = ({
  config,
  elapsed,
  checkedCount,
  onExit,
  heading = "Session complete",
  when,
  score,
  showRecording = false,
  exitLabel = "Back to mock lab",
}: Props) => {
  const missed = config.checklist.filter((_, i) => i >= checkedCount);

  return (
    <Card>
      <CardContent className="space-y-6 p-6">
        <div className="space-y-1">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {config.title} · Review{when ? ` · ${when}` : ""}
          </p>
          <h2 className="font-heading text-2xl font-bold">{heading}</h2>
        </div>

        <div className={`grid gap-4 sm:grid-cols-2 ${typeof score === "number" ? "lg:grid-cols-3" : ""}`}>
          <div className="rounded-lg border p-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Time used
            </p>
            <p className="mt-1 font-heading text-2xl font-semibold">
              {formatElapsedTime(elapsed)}{" "}
              <span className="text-base font-normal text-muted-foreground">
                / {config.minutes}:00
              </span>
            </p>
          </div>
          <div className="rounded-lg border p-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Coach habits hit
            </p>
            <p className="mt-1 font-heading text-2xl font-semibold">
              {checkedCount}/{config.checklist.length}
            </p>
          </div>
          {typeof score === "number" && (
            <div className="rounded-lg border p-4">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Score
              </p>
              <p className="mt-1 font-heading text-2xl font-semibold">
                {score}
                <span className="text-base font-normal text-muted-foreground">/10</span>
              </p>
            </div>
          )}
        </div>

        {showRecording && (
          <div className="space-y-2">
            <p className="text-sm font-semibold">Session recording</p>
            <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed bg-muted/40 p-8 text-center">
              <Video className="h-6 w-6 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                Recording playback is coming soon. Your notes and feedback are below.
              </p>
            </div>
          </div>
        )}

        {missed.length > 0 && (
          <div className="space-y-2">
            <p className="text-sm font-semibold">Habits to focus on next time</p>
            <ul className="space-y-1.5">
              {missed.map((item) => (
                <li key={item.id} className="flex items-start gap-2 text-sm text-muted-foreground">
                  <ChevronRight className="mt-0.5 h-4 w-4 flex-none text-primary" />
                  {item.label}
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="space-y-2">
          <p className="text-sm font-semibold">Feedback</p>
          <div className="space-y-2">
            {config.reviewNotes.map((note, i) => (
              <p key={i} className="text-sm text-muted-foreground">
                {note.text}
              </p>
            ))}
          </div>
        </div>

        <Button onClick={onExit}>{exitLabel}</Button>
      </CardContent>
    </Card>
  );
};

export default MockReviewScreen;
