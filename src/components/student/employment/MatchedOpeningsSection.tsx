import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { COMPANY_SPECIFIC_NOTES } from "@/lib/careerReadinessBriefing";
import { DEMO_OPENINGS } from "./demoOpenings";

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

/** Illustrative target-role matches with readiness and interview context. */
const MatchedOpeningsSection = () => (
  <section>
    <div className="mb-3 flex items-end justify-between gap-3">
      <div>
        <h2 className="text-xl font-heading font-semibold">Target role examples matched to you</h2>
        <p className="text-sm text-muted-foreground">
          Explore example roles, expected pay, readiness, and company-specific interview guidance.
        </p>
      </div>
    </div>

    <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
      {DEMO_OPENINGS.map((o) => {
        const interviewNote = COMPANY_SPECIFIC_NOTES.find((note) => note.company === o.company)?.note;

        return (
          <Card key={o.company}>
            <CardContent className="flex h-full flex-col p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 flex-none items-center justify-center rounded-lg bg-primary/10 text-sm font-bold text-primary">
                {o.initial}
              </div>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">{o.company}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {o.tier} · {o.location}
                </p>
              </div>
            </div>

            <p className="mt-3 text-sm font-semibold">{o.role}</p>
            <p className="text-sm text-muted-foreground">{o.salary}</p>

            {interviewNote && (
              <div className="mt-3 border-t pt-3">
                <p className="text-xs font-semibold">Interview and role insight</p>
                <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{interviewNote}</p>
              </div>
            )}

            <div className="mt-auto flex items-center gap-3 pt-4">
              <Progress value={o.match} className="h-2 flex-1" indicatorClassName={barClass[o.status]} />
              <span className={`text-xs font-semibold ${statusClass[o.status]}`}>{o.status}</span>
              <span className="text-xs text-muted-foreground">{o.match}%</span>
            </div>
          </CardContent>
          </Card>
        );
      })}
    </div>
  </section>
);

export default MatchedOpeningsSection;
