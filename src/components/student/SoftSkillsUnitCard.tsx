import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ChevronDown, ChevronUp, Sparkles } from "lucide-react";

export interface SoftSkillsModuleView {
  id: string;
  title: string;
  summary: string;
  outcomes: string[];
  activities: { title: string; body?: string }[];
}

interface Props {
  modules: SoftSkillsModuleView[];
  onStudy: (moduleTitle: string) => void;
}

/**
 * Employment-pathway courses render their published Soft Skills modules as a
 * standalone unit at the end of the Learning Path.
 */
const SoftSkillsUnitCard = ({ modules, onStudy }: Props) => {
  const [expanded, setExpanded] = useState(false);
  const [openModule, setOpenModule] = useState<string | null>(null);

  if (modules.length === 0) return null;

  return (
    <Card className="border-primary/30">
      <CardContent className="p-4">
        <button
          type="button"
          className="flex w-full items-center gap-3 text-left"
          onClick={() => setExpanded((v) => !v)}
        >
          <div className="flex h-9 w-9 flex-none items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Sparkles className="h-4 w-4" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h3 className="truncate text-sm font-semibold">Soft Skills</h3>
              <Badge variant="outline" className="text-[10px]">
                {modules.length} module{modules.length === 1 ? "" : "s"}
              </Badge>
            </div>
            <p className="truncate text-xs text-muted-foreground">
              Workplace readiness for your employment pathway
            </p>
          </div>
          {expanded ? (
            <ChevronUp className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          )}
        </button>

        {expanded && (
          <div className="mt-4 space-y-3">
            {modules.map((m) => {
              const open = openModule === m.id;
              return (
                <div key={m.id} className="rounded-lg border p-3">
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
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default SoftSkillsUnitCard;
