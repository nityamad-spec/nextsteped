import { useState } from "react";
import { Brain, ChevronRight, Code2, Network, Sparkles, Star } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import {
  RECENT_MOCKS,
  type MockInterviewAccent,
  type MockInterviewIcon,
} from "@/lib/mockInterviews";
import {
  CODING_COACH_CHECKLIST,
  CODING_REVIEW_NOTES,
  MOCK_CONFIG_BY_ID,
  type MockConfig,
} from "@/lib/codingMock";
import {
  CAREER_READINESS_EMPTY_NOTICE,
  type CrMockType,
} from "@/lib/careerReadinessContent";
import CodingMockSession from "./CodingMockSession";
import MockReadyScreen from "./MockReadyScreen";
import MockReviewScreen from "./MockReviewScreen";

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

interface Props {
  /** Professor-set mock types; empty means the section isn't set up yet. */
  mockTypes: CrMockType[];
}

/** Build a full session config from the professor's mock type. */
const toConfig = (m: CrMockType): MockConfig => {
  const fallback = MOCK_CONFIG_BY_ID[m.id];
  return {
    title: `${m.title} mock`,
    minutes: m.minutes,
    prompt: {
      question: m.prompt.question || fallback?.prompt.question || "",
      followUp: m.prompt.followUp || fallback?.prompt.followUp || "",
    },
    checklist: fallback?.checklist ?? CODING_COACH_CHECKLIST,
    reviewNotes: fallback?.reviewNotes ?? CODING_REVIEW_NOTES,
  };
};

/** Career Readiness "Practice" step: Mock Interview Lab. */
const MockInterviewLab = ({ mockTypes }: Props) => {
  const [activeMock, setActiveMock] = useState<string | null>(null);
  const [reviewMockId, setReviewMockId] = useState<string | null>(null);

  const completedFor = (typeId: string) =>
    RECENT_MOCKS.filter((r) => r.typeId === typeId).length;
  const totalTarget = mockTypes.reduce((sum, m) => sum + m.target, 0);
  const totalCompleted = mockTypes.reduce((sum, m) => sum + completedFor(m.id), 0);
  const recent = RECENT_MOCKS.filter((r) => mockTypes.some((m) => m.id === r.typeId));

  const reviewMock = recent.find((r) => r.id === reviewMockId);
  const reviewType = reviewMock ? mockTypes.find((m) => m.id === reviewMock.typeId) : undefined;
  if (reviewMock && reviewType) {
    return (
      <MockReviewScreen
        config={toConfig(reviewType)}
        elapsed={reviewMock.elapsedSeconds}
        checkedCount={reviewMock.habitsHit}
        heading={`${reviewMock.type} mock review`}
        when={reviewMock.when}
        score={reviewMock.score}
        showRecording
        onExit={() => setReviewMockId(null)}
      />
    );
  }

  const selectedMock = mockTypes.find((m) => m.id === activeMock);
  if (selectedMock) {
    return selectedMock.prompt.question ? (
      <CodingMockSession config={toConfig(selectedMock)} onExit={() => setActiveMock(null)} />
    ) : (
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
            Hit the target on each interview type before onsites. Record yourself.
            Review body language, filler words, and clarity.
          </p>
        </div>
        {mockTypes.length > 0 && (
          <div className="flex-none text-right">
            <p className="text-xs font-semibold uppercase tracking-wider text-black dark:text-white">
              Total completed
            </p>
            <p className="text-lg font-semibold text-black dark:text-white">
              <span className="text-primary">{totalCompleted}</span>
              <span>/{totalTarget}</span>
            </p>
          </div>
        )}
      </div>

      {mockTypes.length === 0 ? (
        <Card>
          <CardContent className="py-6 text-center text-sm text-muted-foreground">
            {CAREER_READINESS_EMPTY_NOTICE}
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {mockTypes.map((m) => {
            const Icon = ICONS[m.icon];
            return (
              <Card
                key={m.id}
                className="cursor-pointer transition-shadow hover:shadow-md"
                onClick={() => setActiveMock(m.id)}
                role="button"
                aria-label={`Start ${m.title} mock`}
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    setActiveMock(m.id);
                  }
                }}
              >
                <CardContent className="space-y-2 p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div
                      className={`flex h-9 w-9 items-center justify-center rounded-lg ${ACCENT_TILE[m.accent]}`}
                    >
                      <Icon className="h-4.5 w-4.5" />
                    </div>
                    <p className={`text-xs font-semibold ${ACCENT_TEXT[m.accent]}`}>
                      {completedFor(m.id)}/{m.target}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm font-semibold">{m.title}</p>
                    <p
                      className={`text-xs font-semibold uppercase tracking-wider ${ACCENT_TEXT[m.accent]}`}
                    >
                      {m.minutes} min
                    </p>
                  </div>
                  <p className="text-xs text-muted-foreground">{m.description}</p>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {recent.length > 0 && (
        <Card className="border-[#DFE3FB] bg-[#F3F5FE]">
          <CardContent className="space-y-2 p-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Recent mocks
            </p>
            <div className="space-y-2">
              {recent.map((r) => {
                const Icon = ICONS[r.icon];
                return (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => setReviewMockId(r.id)}
                    aria-label={`Review ${r.type} mock from ${r.when}`}
                    className="flex w-full flex-wrap items-start justify-between gap-3 rounded-lg border border-[#DFE3FB] bg-background p-3 text-left transition-shadow hover:shadow-md"
                  >
                    <div className="flex min-w-0 items-start gap-3">
                      <Icon className={`mt-0.5 h-4.5 w-4.5 flex-none ${ACCENT_TEXT[r.accent]}`} />
                      <div className="min-w-0">
                        <p className="text-sm font-semibold">{r.type}</p>
                        <p className="text-xs text-muted-foreground">{r.note}</p>
                      </div>
                    </div>
                    <div className="flex flex-none items-center gap-2 text-right">
                      <p className="text-xs text-muted-foreground">{r.when}</p>
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    </div>
                  </button>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default MockInterviewLab;
