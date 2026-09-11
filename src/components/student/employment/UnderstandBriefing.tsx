import { ArrowRight } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  COMPANY_SPECIFIC_NOTES,
  INTERVIEW_ROUNDS,
  TESTED_QUESTIONS,
  TESTED_SKILLS,
} from "@/lib/careerReadinessBriefing";

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

const UnderstandBriefing = ({ targetRole, onGoToPrepare }: Props) => (
  <div className="space-y-4">
    <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
      Step 1 · Understand — what {article(targetRole)} {targetRole} interview looks like
    </p>

    <Card>
      <CardContent className="space-y-3 p-5">
        <div>
          <p className="text-sm font-semibold">The rounds you'll face</p>
          <p className="mt-0.5 text-sm text-muted-foreground">
            A typical {targetRole} loop, and how much each round weighs. Practice the
            heavy ones most.
          </p>
        </div>
        {INTERVIEW_ROUNDS.map((round, i) => (
          <div key={round.title} className="rounded-lg border p-3">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-3">
                <span className="flex h-6 w-6 flex-none items-center justify-center rounded-md bg-primary/10 text-xs font-bold text-primary">
                  {i + 1}
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-semibold">{round.title}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">{round.description}</p>
                </div>
              </div>
              <span className="flex-none rounded-md bg-primary/10 px-2 py-0.5 text-xs font-bold text-primary">
                {round.weight}%
              </span>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>

    <Card>
      <CardContent className="space-y-3 p-5">
        <div>
          <p className="text-sm font-semibold">What they're really testing</p>
          <p className="mt-0.5 text-sm text-muted-foreground">
            The common questions and what a strong answer looks like — read these before you
            practice.
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {TESTED_QUESTIONS.map((q) => (
            <div key={q.question} className="rounded-lg border p-3">
              <p className="text-sm font-semibold">{q.question}</p>
              <p className="mt-1 text-xs text-muted-foreground">{q.guidance}</p>
            </div>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold text-primary">Most-tested for freshers:</span>
          {TESTED_SKILLS.map((skill) => (
            <span
              key={skill}
              className="rounded-md bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary"
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
        <div className="grid gap-3 sm:grid-cols-2">
          {COMPANY_SPECIFIC_NOTES.map((c) => (
            <div key={c.company} className="rounded-lg border p-3">
              <p className="text-sm font-semibold">
                {c.company} · <span className="text-primary">{c.statusLabel}</span>
              </p>
              <p className="mt-1 text-xs text-muted-foreground">{c.note}</p>
            </div>
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
