import { ArrowRight, BookOpen } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  CAREER_READINESS_EMPTY_NOTICE,
  type CrInterviewRound,
  type CrQaPair,
} from "@/lib/careerReadinessContent";

interface Props {
  targetRole: string;
  onGoToPrepare: () => void;
  /** Professor-set rounds; empty means the section isn't set up yet. */
  rounds: CrInterviewRound[];
  testedQuestions: CrQaPair[];
  testedSkills: string[];
}

/**
 * Role briefing for the Career Readiness "Understand" step. Rounds, tested
 * questions and skills come from the professor's Soft Skills setup.
 */
const article = (word: string) => (/^[aeiou]/i.test(word) ? "an" : "a");

const ROUND_STYLES = [
  "border-career-round-1 text-career-round-1-foreground",
  "border-career-round-2 text-career-round-2-foreground",
  "border-career-round-3 text-career-round-3-foreground",
  "border-career-round-4 text-career-round-4-foreground",
] as const;

const ROUND_CIRCLE_STYLES = [
  "border-career-round-1-border bg-career-round-1",
  "border-career-round-2-border bg-career-round-2",
  "border-career-round-3-border bg-career-round-3",
  "border-career-round-4-border bg-career-round-4",
] as const;

const Notice = () => (
  <p className="text-sm text-muted-foreground">{CAREER_READINESS_EMPTY_NOTICE}</p>
);

const UnderstandBriefing = ({
  targetRole,
  onGoToPrepare,
  rounds,
  testedQuestions,
  testedSkills,
}: Props) => (
  <div className="space-y-4">
    <p className="text-xs font-semibold uppercase tracking-wider text-black dark:text-white">
      Step 1 · Understand — what {article(targetRole)} {targetRole} interview looks like
    </p>

    <Card>
      <CardContent className="space-y-3 p-5">
        <div>
          <p className="text-sm font-semibold">The rounds you'll face</p>
          <p className="mt-0.5 text-sm text-black dark:text-white">
            A typical {targetRole} loop, and how much each round weighs. Practice the
            heavy ones most.
          </p>
        </div>
        {rounds.length === 0 ? (
          <Notice />
        ) : (
          <div className="relative space-y-3 before:absolute before:bottom-[3.75rem] before:left-[1.1875rem] before:top-6 before:w-px before:bg-career-round-4-border">
            {rounds.map((round, i) => (
              <div key={`${round.title}-${i}`} className="relative flex items-start gap-3 sm:gap-4">
                <span
                  className={`relative z-10 mt-4 flex h-10 w-10 flex-none items-center justify-center rounded-full border-2 text-sm font-bold text-black dark:text-white ${ROUND_CIRCLE_STYLES[i % ROUND_CIRCLE_STYLES.length]}`}
                >
                  {i + 1}
                </span>
                <div
                  className={`flex min-h-24 flex-1 flex-col justify-center rounded-lg border bg-transparent p-4 sm:flex-row sm:items-center sm:justify-between sm:gap-6 ${ROUND_STYLES[i % ROUND_STYLES.length]}`}
                >
                  <div className="min-w-0">
                    <p className="text-sm font-semibold">{round.title}</p>
                    <p className="mt-1 text-xs leading-relaxed">{round.description}</p>
                  </div>
                  <span className="mt-3 flex-none rounded-md border border-current/20 bg-background/70 px-2.5 py-1 text-xs font-bold text-black dark:text-white sm:mt-0">
                    {round.weight}%
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>

    <Card className="border-[#E8E3F7] bg-[#F9F7FE]">
      <CardContent className="space-y-3 p-5">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 flex-none items-center justify-center rounded-lg bg-[#4C1D95]/10 text-[#4C1D95]">
            <BookOpen className="h-5 w-5" />
          </div>
          <div>
            <p className="text-sm font-semibold">What they're really testing</p>
            <p className="mt-0.5 text-sm text-muted-foreground">
              The common questions and what a strong answer looks like — read these before you
              practice.
            </p>
          </div>
        </div>
        {testedQuestions.length === 0 ? (
          <Notice />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {testedQuestions.map((q, i) => (
              <div key={`${q.question}-${i}`} className="rounded-xl border border-[#E8E3F7] bg-white p-5">
                <p className="text-sm font-semibold">{q.question}</p>
                <p className="mt-1 text-xs text-muted-foreground">{q.guidance}</p>
              </div>
            ))}
          </div>
        )}
        {testedSkills.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold text-[#4C1D95]">Most-tested for freshers:</span>
            {testedSkills.map((skill) => (
              <span
                key={skill}
                className="rounded-full border border-[#E8E3F7] bg-white px-2 py-0.5 text-xs font-medium text-[#4C1D95]"
              >
                {skill}
              </span>
            ))}
          </div>
        )}
      </CardContent>
    </Card>

    <Card className="border-primary/30 bg-primary/5">
      <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
        <div>
          <p className="text-sm font-semibold text-primary">You've reviewed what's coming.</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Next: build the STAR stories you'll use in behavioural rounds.
          </p>
        </div>
        <Button onClick={onGoToPrepare}>
          Go to Prepare
          <ArrowRight className="ml-1.5 h-4 w-4" />
        </Button>
      </CardContent>
    </Card>
  </div>
);

export default UnderstandBriefing;
