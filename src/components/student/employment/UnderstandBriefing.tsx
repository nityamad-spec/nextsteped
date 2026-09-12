import { ArrowRight, BookOpen } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  COMPANY_SPECIFIC_NOTES,
  INTERVIEW_ROUNDS,
  TESTED_QUESTIONS,
  TESTED_SKILLS,
} from "@/lib/careerReadinessBriefing";

const statusClass: Record<string, string> = {
  Ready: "text-green-600 dark:text-green-400",
  Stretch: "text-amber-600 dark:text-amber-400",
  Early: "text-muted-foreground",
};

const barClass: Record<string, string> = {
  Ready: "!bg-green-600 dark:!bg-green-400",
  Stretch: "!bg-amber-600 dark:!bg-amber-400",
  Early: "!bg-muted-foreground",
};

interface Props {
  targetRole: string;
  onGoToPrepare: () => void;
}

/**
 * Static role briefing for the Career Readiness "Understand" step:
 * role overview, interview rounds, what interviewers test, and
 * company-specific notes for the demo openings.
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

const UnderstandBriefing = ({ targetRole, onGoToPrepare }: Props) => (
  <div className="space-y-4">
    <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
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
        <div className="relative space-y-3 before:absolute before:bottom-[3.75rem] before:left-[1.1875rem] before:top-6 before:w-px before:bg-career-round-4-border">
          {INTERVIEW_ROUNDS.map((round, i) => (
            <div
              key={round.title}
              className="relative flex items-start gap-3 sm:gap-4"
            >
              <span
                className={`relative z-10 mt-4 flex h-10 w-10 flex-none items-center justify-center rounded-full border-2 text-sm font-bold text-black dark:text-white ${ROUND_CIRCLE_STYLES[i]}`}
              >
                {i + 1}
              </span>
              <div
                className={`flex min-h-24 flex-1 flex-col justify-center rounded-lg border bg-transparent p-4 sm:flex-row sm:items-center sm:justify-between sm:gap-6 ${ROUND_STYLES[i]}`}
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
        <div className="grid gap-3 sm:grid-cols-2">
          {TESTED_QUESTIONS.map((q) => (
            <div key={q.question} className="rounded-xl border border-[#E8E3F7] bg-white p-5">
              <p className="text-sm font-semibold">{q.question}</p>
              <p className="mt-1 text-xs text-muted-foreground">{q.guidance}</p>
            </div>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold text-[#4C1D95]">Most-tested for freshers:</span>
          {TESTED_SKILLS.map((skill) => (
            <span
              key={skill}
              className="rounded-full border border-[#E8E3F7] bg-white px-2 py-0.5 text-xs font-medium text-[#4C1D95]"
            >
              {skill}
            </span>
          ))}
        </div>
      </CardContent>
    </Card>

    <Card>
      <CardContent className="space-y-3 p-5">
        <div>
          <p className="text-sm font-semibold">Company-specific notes</p>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Openings matched to you have their own interview quirks. A few from your matched
            list.
          </p>
        </div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {COMPANY_SPECIFIC_NOTES.map((c) => (
            <Card key={c.company}>
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 flex-none items-center justify-center rounded-lg bg-primary/10 text-sm font-bold text-primary">
                    {c.initial}
                  </div>
                  <p className="truncate text-sm font-semibold">{c.company}</p>
                </div>
                <p className="mt-3 text-sm text-muted-foreground">{c.note}</p>
                <div className="mt-3 flex items-center gap-3">
                  <Progress value={c.match} className="h-2 flex-1" indicatorClassName={barClass[c.status]} />
                  <span className={`text-xs font-semibold ${statusClass[c.status]}`}>{c.status}</span>
                  <span className="text-xs text-muted-foreground">{c.match}%</span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
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
