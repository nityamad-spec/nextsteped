import { Brain, Code2, Network, Sparkles, Star } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import {
  MOCK_COMPLETED_COUNT,
  MOCK_INTERVIEW_TYPES,
  MOCK_TARGET_COUNT,
  RECENT_MOCKS,
  type MockInterviewIcon,
} from "@/lib/mockInterviews";

const ICONS: Record<MockInterviewIcon, typeof Code2> = {
  code: Code2,
  network: Network,
  brain: Brain,
  star: Star,
  sparkles: Sparkles,
};

/** Career Readiness "Practice" step: demo-only Mock Interview Lab. */
const MockInterviewLab = () => (
  <div className="space-y-4">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Mock interview lab
        </p>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          Aim for 8–10 mocks before onsites. Record yourself. Review body
          language, filler words, and clarity.
        </p>
      </div>
      <div className="flex-none text-right">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Completed
        </p>
        <p className="text-lg font-semibold">
          <span className="text-primary">{MOCK_COMPLETED_COUNT}</span>
          <span className="text-muted-foreground">/{MOCK_TARGET_COUNT}</span>
        </p>
      </div>
    </div>

    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {MOCK_INTERVIEW_TYPES.map((m) => {
        const Icon = ICONS[m.icon];
        return (
          <Card key={m.id}>
            <CardContent className="space-y-2 p-4">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Icon className="h-4.5 w-4.5" />
              </div>
              <div>
                <p className="text-sm font-semibold">{m.title}</p>
                <p className="text-xs font-semibold uppercase tracking-wider text-primary">
                  {m.minutes} min
                </p>
              </div>
              <p className="text-xs text-muted-foreground">{m.description}</p>
            </CardContent>
          </Card>
        );
      })}
    </div>

    <Card>
      <CardContent className="space-y-2 p-4">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Recent mocks
        </p>
        <div className="space-y-2">
          {RECENT_MOCKS.map((r) => (
            <div
              key={r.id}
              className="flex flex-wrap items-start justify-between gap-3 rounded-lg border p-3"
            >
              <div className="flex min-w-0 items-start gap-3">
                <div className="flex h-7 w-7 flex-none items-center justify-center rounded-md bg-primary/10 text-xs font-semibold text-primary">
                  {r.type.charAt(0)}
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold">{r.type}</p>
                  <p className="text-xs text-muted-foreground">{r.note}</p>
                </div>
              </div>
              <div className="flex-none text-right">
                <p className="text-sm font-semibold">
                  {r.score}
                  <span className="text-muted-foreground">/10</span>
                </p>
                <p className="text-xs text-muted-foreground">{r.when}</p>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  </div>
);

export default MockInterviewLab;
