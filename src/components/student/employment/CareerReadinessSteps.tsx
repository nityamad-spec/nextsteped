import { useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ChevronDown, ChevronUp } from "lucide-react";
import {
  CAREER_READINESS_STEPS,
  isCareerReadinessStep,
  type CareerReadinessStep,
} from "@/lib/careerReadiness";
import type { SoftSkillsModuleView } from "@/hooks/useCourseSoftSkills";
import CareerReadinessStepper from "./CareerReadinessStepper";
import UnderstandBriefing from "./UnderstandBriefing";
import StarStoryBuilder from "./StarStoryBuilder";
import MockInterviewLab from "./MockInterviewLab";
import { DEMO_STAR_STORIES, isStudentCreatedStory, type StarStory } from "@/lib/starStories";

interface Props {
  modules: SoftSkillsModuleView[];
  onStudy: (moduleTitle: string) => void;
  targetRole?: string | null;
  /** Optional step to open initially (e.g. from a ?step= deep link). */
  initialStep?: string | null;
}

/**
 * Three-step Career Readiness view: Understand → Prepare → Practice.
 * Understand shows a static role briefing; Prepare/Practice list the
 * modules the professor assigned to them.
 */
const CareerReadinessSteps = ({ modules, onStudy, targetRole, initialStep }: Props) => {
  const byStep = useMemo(() => {
    const map: Record<CareerReadinessStep, SoftSkillsModuleView[]> = {
      understand: [],
      prepare: [],
      practice: [],
    };
    modules.forEach((m) => map[m.step].push(m));
    return map;
  }, [modules]);

  const firstWithContent =
    CAREER_READINESS_STEPS.find((s) => byStep[s.key].length > 0)?.key ?? "understand";
  const [stories, setStories] = useState<StarStory[]>(DEMO_STAR_STORIES);
  const studentStoryCount = stories.filter(isStudentCreatedStory).length;
  const practiceUnlocked = studentStoryCount >= 5;
  const requestedInitial = initialStep && isCareerReadinessStep(initialStep) ? initialStep : firstWithContent;
  const [active, setActive] = useState<CareerReadinessStep>(
    requestedInitial === "practice" ? "prepare" : requestedInitial
  );
  const [openModule, setOpenModule] = useState<string | null>(null);

  const activeModules = byStep[active];

  return (
    <div className="space-y-4">
      <CareerReadinessStepper
        active={active}
        practiceLocked={!practiceUnlocked}
        onSelect={(step) => {
          if (step === "practice" && !practiceUnlocked) return;
          setActive(step);
          setOpenModule(null);
        }}
      />

      {active === "understand" ? (
        <UnderstandBriefing
          targetRole={targetRole || "this role"}
          onGoToPrepare={() => {
            setActive("prepare");
            setOpenModule(null);
          }}
        />
      ) : active === "prepare" ? (
        <StarStoryBuilder
          targetRole={targetRole}
          stories={stories}
          onStoriesChange={setStories}
          onGoToPractice={() => {
            if (!practiceUnlocked) return;
            setActive("practice");
            setOpenModule(null);
          }}
        />
      ) : active === "practice" ? (
        <MockInterviewLab />
      ) : activeModules.length === 0 ? (
        <Card>
          <CardContent className="py-6 text-center text-sm text-muted-foreground">
            Nothing in this step yet.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {activeModules.map((m) => {
            const open = openModule === m.id;
            return (
              <Card key={m.id}>
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium">{m.title}</p>
                      {m.summary && (
                        <p className="mt-0.5 text-xs text-muted-foreground">{m.summary}</p>
                      )}
                    </div>
                    <Button variant="outline" size="sm" onClick={() => onStudy(m.title)}>
                      Study
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setOpenModule(open ? null : m.id)}
                    >
                      {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                    </Button>
                  </div>

                  {open && (
                    <div className="mt-3 space-y-3 border-t pt-3">
                      {m.outcomes.length > 0 && (
                        <div>
                          <p className="text-xs font-semibold">What you'll learn</p>
                          <ul className="mt-1 list-disc space-y-0.5 pl-5 text-xs text-muted-foreground">
                            {m.outcomes.map((o, i) => (
                              <li key={i}>{o}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                      {m.activities.length > 0 && (
                        <div className="space-y-2">
                          <p className="text-xs font-semibold">Activities</p>
                          {m.activities.map((a, i) => (
                            <div key={i} className="rounded-md bg-muted/40 p-2">
                              <p className="text-xs font-medium">{a.title}</p>
                              {a.body && (
                                <p className="mt-0.5 whitespace-pre-wrap text-xs text-muted-foreground">
                                  {a.body}
                                </p>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default CareerReadinessSteps;
