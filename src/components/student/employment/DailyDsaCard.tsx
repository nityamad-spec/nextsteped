import { useNavigate } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Flame, CheckCircle2, Code2, Loader2 } from "lucide-react";
import { useDailyDsa } from "@/hooks/useDailyDsa";
import { solvedDayLabel } from "@/lib/dailyDsa";

interface DailyDsaCardProps {
  courseId: string | null;
  codingApproved: boolean;
  unlockedWeeks: number[];
}

/** Today's coding problem, drawn from the course's published exercise bank. */
const DailyDsaCard = ({ courseId, codingApproved, unlockedWeeks }: DailyDsaCardProps) => {
  const navigate = useNavigate();
  const {
    loading,
    hasBank,
    exercise,
    solvedCount,
    totalCount,
    streak,
    recentDays,
    solvedToday,
    attemptsToday,
    bankComplete,
  } = useDailyDsa(courseId, codingApproved, unlockedWeeks);

  const header = (
    <div className="flex items-center justify-between gap-3">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        Daily DSA
      </p>
      {hasBank && (
        <Badge variant="secondary" className="gap-1">
          <Flame className="h-3 w-3" /> {streak}
        </Badge>
      )}
    </div>
  );

  if (loading) {
    return (
      <Card className="h-full">
        <CardContent className="flex h-full flex-col p-5">
          {header}
          <div className="flex flex-1 items-center justify-center text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!hasBank) {
    return (
      <Card className="h-full">
        <CardContent className="flex h-full flex-col p-5">
          {header}
          <p className="mt-2 text-lg font-heading font-semibold">No problems yet</p>
          <p className="mt-2 text-sm text-muted-foreground">
            Your professor hasn't published any coding problems for this course yet. Daily
            practice starts as soon as the first one is ready.
          </p>
        </CardContent>
      </Card>
    );
  }

  const start = () => {
    if (!exercise) return;
    navigate(`/student/chat?terminal=1&daily=1&unit=${exercise.week_number}&exercise=${exercise.id}`);
  };

  return (
    <Card className="h-full">
      <CardContent className="flex h-full flex-col p-5">
        {header}

        {bankComplete ? (
          <>
            <p className="mt-2 text-lg font-heading font-semibold">All problems solved</p>
            <p className="mt-2 text-sm text-muted-foreground">
              You've cleared every problem your professor has published. Rest up — new problems
              appear here as soon as they're added.
            </p>
          </>
        ) : (
          <>
            <p className="mt-2 text-lg font-heading font-semibold">{exercise?.title}</p>
            <div className="mt-2 flex flex-wrap gap-2">
              <Badge variant="outline" className="text-[10px]">
                Unit {exercise?.week_number}
              </Badge>
              {exercise?.language && (
                <Badge variant="outline" className="text-[10px] capitalize">
                  {exercise.language}
                </Badge>
              )}
              {solvedToday && (
                <Badge variant="outline" className="gap-1 text-[10px] text-primary">
                  <CheckCircle2 className="h-3 w-3" /> Solved today
                </Badge>
              )}
            </div>

            <Button className="mt-4 w-full gap-2" onClick={start}>
              <Code2 className="h-4 w-4" /> Start today's problem
            </Button>
            {attemptsToday > 0 && !solvedToday && (
              <p className="mt-2 text-center text-xs text-muted-foreground">
                {attemptsToday} {attemptsToday === 1 ? "attempt" : "attempts"} today — keep going.
              </p>
            )}
          </>
        )}

        <div className="mt-auto pt-4 text-xs text-muted-foreground">
          <p>
            {solvedCount} of {totalCount} problems solved
          </p>
          {recentDays.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1">
              {recentDays.map((d) => (
                <span key={d} className="rounded bg-muted px-1.5 py-0.5 text-[10px]">
                  {solvedDayLabel(d)}
                </span>
              ))}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
};

export default DailyDsaCard;
