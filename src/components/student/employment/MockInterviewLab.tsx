import { useState } from "react";
import { Brain, Code2, Network, Sparkles, Star } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import {
  MOCK_INTERVIEW_TYPES,
  MOCK_PER_TYPE_TARGET,
  MOCK_TOTAL_COMPLETED,
  MOCK_TOTAL_TARGET,
  RECENT_MOCKS,
  type MockInterviewAccent,
  type MockInterviewIcon,
} from "@/lib/mockInterviews";
import {
  AGENT_DESIGN_MOCK_CONFIG,
  BEHAVIOURAL_MOCK_CONFIG,
  CODING_MOCK_CONFIG,
  ML_DEPTH_MOCK_CONFIG,
  SYSTEM_DESIGN_MOCK_CONFIG,
} from "@/lib/codingMock";
import CodingMockSession from "./CodingMockSession";
import MockReadyScreen from "./MockReadyScreen";

const ICONS: Record<MockInterviewIcon, typeof Code2> = {
  code: Code2,
  network: Network,
  brain: Brain,
  star: Star,
  sparkles: Sparkles,
};

const ACCENT_TILE: Record<MockInterviewAccent, string> = {
  blue: "bg-[#E8F0FE] text-[#1A56DB]",
  purple: "bg-[#F1EBFE] text-[#6B34C9]",
  orange: "bg-[#FEF0E3] text-[#B5540B]",
  green: "bg-[#E6F6EC] text-[#12793F]",
  pink: "bg-[#FDE9F2] text-[#B4266E]",
};

const ACCENT_TEXT: Record<MockInterviewAccent, string> = {
  blue: "text-[#1A56DB]",
  purple: "text-[#6B34C9]",
  orange: "text-[#B5540B]",
  green: "text-[#12793F]",
  pink: "text-[#B4266E]",
};

/** Career Readiness "Practice" step: demo-only Mock Interview Lab. */
const MockInterviewLab = () => {
  const [activeMock, setActiveMock] = useState<string | null>(null);

  if (activeMock === "coding") {
    return <CodingMockSession config={CODING_MOCK_CONFIG} onExit={() => setActiveMock(null)} />;
  }

  if (activeMock === "system-design") {
    return (
      <CodingMockSession config={SYSTEM_DESIGN_MOCK_CONFIG} onExit={() => setActiveMock(null)} />
    );
  }

  if (activeMock === "ml-depth") {
    return <CodingMockSession config={ML_DEPTH_MOCK_CONFIG} onExit={() => setActiveMock(null)} />;
  }

  if (activeMock === "behavioural") {
    return (
      <CodingMockSession config={BEHAVIOURAL_MOCK_CONFIG} onExit={() => setActiveMock(null)} />
    );
  }

  if (activeMock === "agent-design") {
    return (
      <CodingMockSession config={AGENT_DESIGN_MOCK_CONFIG} onExit={() => setActiveMock(null)} />
    );
  }


  const selectedMock = MOCK_INTERVIEW_TYPES.find((mock) => mock.id === activeMock);
  if (selectedMock) {
    return (
      <MockReadyScreen
        title={selectedMock.title}
        minutes={selectedMock.minutes}
        onBack={() => setActiveMock(null)}
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wider text-black dark:text-white">
            Mock interview lab
          </p>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Aim for 8–10 mocks on each interview type before onsites. Record
            yourself. Review body language, filler words, and clarity.
          </p>
        </div>
        <div className="flex-none text-right">
          <p className="text-xs font-semibold uppercase tracking-wider text-black dark:text-white">
            Total completed
          </p>
          <p className="text-lg font-semibold text-black dark:text-white">
            <span className="text-primary">{MOCK_TOTAL_COMPLETED}</span>
            <span>/{MOCK_TOTAL_TARGET}</span>
          </p>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {MOCK_INTERVIEW_TYPES.map((m) => {
          const Icon = ICONS[m.icon];
          return (
            <Card
              key={m.id}
              className="cursor-pointer transition-shadow hover:shadow-md"
              onClick={() => setActiveMock(m.id)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  setActiveMock(m.id);
                }
              }}
            >
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
};

export default MockInterviewLab;
