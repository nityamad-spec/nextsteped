import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Medal } from "lucide-react";
import type { Achievement } from "@/hooks/useAchievements";

interface Props {
  achievements: Achievement[];
  earnedCount: number;
}

const AchievementsCard = ({ achievements, earnedCount }: Props) => {
  return (
    <Card className="h-full">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3 min-w-0">
            <div className="h-10 w-10 rounded-lg bg-primary/15 flex items-center justify-center shrink-0">
              <Medal className="h-5 w-5 text-primary" />
            </div>
            <div className="min-w-0">
              <h3 className="text-xl font-serif font-semibold leading-tight">Achievements</h3>
              <p className="text-sm text-muted-foreground mt-0.5">Small wins that build momentum</p>
            </div>
          </div>
          <span className="text-xs text-muted-foreground border rounded-full px-3 py-1 shrink-0">
            {earnedCount} of {achievements.length} earned
          </span>
        </div>
      </CardHeader>
      <CardContent>
        <TooltipProvider delayDuration={100}>
          <div className="grid grid-cols-4 gap-3">
            {achievements.map((a) => (
              <Tooltip key={a.id}>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    className="flex flex-col items-center gap-2 cursor-default bg-transparent border-0 p-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-2xl"
                  >
                    <div
                      className={`h-16 w-16 rounded-2xl flex items-center justify-center text-3xl transition-colors ${
                        a.earned
                          ? "bg-primary/15 border border-primary/30"
                          : "bg-muted border border-border opacity-60 grayscale"
                      }`}
                    >
                      <span aria-hidden>{a.emoji}</span>
                    </div>
                    <p
                      className={`text-xs font-semibold text-center truncate w-full ${
                        a.earned ? "text-foreground" : "text-muted-foreground"
                      }`}
                    >
                      {a.label}
                    </p>
                  </button>
                </TooltipTrigger>
                <TooltipContent side="top" sideOffset={6} className="max-w-[260px]">
                  {a.earned ? (
                    <p className="text-xs">{a.tooltip}</p>
                  ) : (
                    <div className="space-y-1.5">
                      <p className="text-xs font-semibold">{a.howTo.title}</p>
                      <ul className="space-y-1">
                        {a.howTo.steps.map((s, i) => (
                          <li key={i} className="flex items-start gap-1.5 text-xs">
                            <span aria-hidden className={s.done ? "text-primary" : "text-muted-foreground"}>
                              {s.done ? "✓" : "○"}
                            </span>
                            <span className={s.done ? "text-muted-foreground line-through" : ""}>
                              {s.label}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </TooltipContent>
              </Tooltip>
            ))}
          </div>
        </TooltipProvider>
      </CardContent>
    </Card>
  );
};

export default AchievementsCard;
