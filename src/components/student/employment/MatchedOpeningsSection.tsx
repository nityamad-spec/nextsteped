import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { DEMO_OPENINGS } from "./demoOpenings";

const statusClass: Record<string, string> = {
  Ready: "text-green-600 dark:text-green-400",
  Stretch: "text-amber-600 dark:text-amber-400",
  Early: "text-muted-foreground",
};

/** Placeholder openings list — example data until employer matching is live. */
const MatchedOpeningsSection = () => (
  <section className="mb-6">
    <div className="mb-3 flex items-end justify-between gap-3">
      <div>
        <h2 className="text-xl font-heading font-semibold">Openings matched to you</h2>
        <p className="text-sm text-muted-foreground">
          Example roles for now — real openings arrive as your pathway progresses.
        </p>
      </div>
    </div>

    <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
      {DEMO_OPENINGS.map((o) => (
        <Card key={o.company}>
          <CardContent className="p-4">
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

            <div className="mt-3 flex items-center gap-3">
              <Progress value={o.match} className="h-2 flex-1" />
              <span className={`text-xs font-semibold ${statusClass[o.status]}`}>{o.status}</span>
              <span className="text-xs text-muted-foreground">{o.match}%</span>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  </section>
);

export default MatchedOpeningsSection;
