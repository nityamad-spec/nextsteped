import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { FlaskConical, ChevronDown, ChevronUp, ExternalLink, Check, Loader2 } from "lucide-react";
import { useEnrolledCourseId } from "@/hooks/useEnrolledCourseId";
import { useCourseProjectLabs } from "@/hooks/useCourseProjectLabs";

const StudentProjectLab = () => {
  const courseId = useEnrolledCourseId();
  const { labs: rows, loading } = useCourseProjectLabs(courseId, true);

  // Labs are professor-authored per course; the display index is positional.
  const LABS = rows.map((lab, i) => ({
    ...lab,
    index: String(i + 1).padStart(2, "0"),
  }));

  const [expanded, setExpanded] = useState<string[]>([]);
  useEffect(() => {
    if (LABS.length > 0) setExpanded((prev) => (prev.length ? prev : [LABS[0].index]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows.length]);

  const toggle = (idx: string) =>
    setExpanded((prev) => (prev.includes(idx) ? prev.filter((i) => i !== idx) : [...prev, idx]));

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center p-8 text-sm text-muted-foreground">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading labs…
      </div>
    );
  }

  // The nav item is hidden when a course has no published labs; a direct visit
  // should not land on an empty page.
  if (LABS.length === 0) return <Navigate to="/student/home" replace />;


  return (
    <div className="flex-1 overflow-y-auto">
      <div className="mx-auto w-full max-w-5xl p-6 md:p-8 space-y-6">
        <header>
          <h1 className="font-heading text-3xl font-bold text-foreground">Project Lab</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Apply AI concepts through short, practical challenges.
          </p>
        </header>

        {/* Learn by doing banner */}
        <div className="rounded-xl border border-primary/20 bg-primary/5 p-5">
          <div className="flex items-start gap-4">
            <div className="flex h-11 w-11 flex-none items-center justify-center rounded-lg bg-primary/10">
              <FlaskConical className="h-5 w-5 text-primary" />
            </div>
            <div className="min-w-0">
              <div className="text-xs font-semibold uppercase tracking-wider text-primary">
                Learn by doing
              </div>
              <div className="mt-1 font-heading text-lg font-semibold text-foreground">
                Choose a lab and expand it to see the mission
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                Each lab is a focused activity with a clear goal, recommended time, and step-by-step
                instructions. Complete the activity individually or with a lab partner.
              </p>
            </div>
          </div>
        </div>

        {/* Lab cards */}
        <div className="space-y-4">
          {LABS.map((lab) => {
            const isOpen = expanded.includes(lab.index);
            return (
              <div key={lab.index} className="rounded-xl border border-border bg-card">
                <button
                  type="button"
                  onClick={() => toggle(lab.index)}
                  className="flex w-full items-start gap-4 p-5 text-left"
                >
                  <div className="w-8 flex-none font-mono text-sm text-muted-foreground pt-1">
                    {lab.index}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-semibold text-primary">
                        Available
                      </span>
                      {lab.tags.map((t) => (
                        <span
                          key={t}
                          className="rounded-full border border-border px-2.5 py-0.5 text-xs text-muted-foreground"
                        >
                          {t}
                        </span>
                      ))}
                    </div>
                    <div className="mt-2 font-heading text-lg font-semibold text-foreground">
                      {lab.title}
                    </div>
                    <p className="mt-0.5 text-sm text-muted-foreground">{lab.summary}</p>
                  </div>
                  <div className="flex h-8 w-8 flex-none items-center justify-center rounded-md border border-border text-muted-foreground">
                    {isOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                  </div>
                </button>

                {isOpen && (
                  <div className="grid grid-cols-1 gap-8 border-t border-border p-5 md:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)]">
                    {/* Mission */}
                    <div>
                      <div className="text-xs font-semibold uppercase tracking-wider text-primary">
                        Mission
                      </div>
                      <p className="mt-2 text-sm text-muted-foreground">{lab.mission}</p>
                      {lab.caution && (
                        <div className="mt-4 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
                          {lab.caution}
                        </div>
                      )}
                      {lab.learnings && (
                        <div className="mt-6">
                          <div className="text-xs font-semibold uppercase tracking-wider text-primary">
                            What you'll learn
                          </div>
                          <ol className="mt-2 list-decimal space-y-1 pl-4 text-sm text-muted-foreground">
                            {lab.learnings.map((item) => (
                              <li key={item}>{item}</li>
                            ))}
                          </ol>
                        </div>
                      )}
                    </div>

                    {/* Instructions */}
                    <div>
                      <div className="text-xs font-semibold uppercase tracking-wider text-primary">
                        Instructions
                      </div>
                      <ol className="mt-3 space-y-5">
                        {lab.steps.map((step, i) => (
                          <li key={i} className="flex gap-3">
                            <div className="flex h-6 w-6 flex-none items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                              {i + 1}
                            </div>
                            <div className="min-w-0 flex-1 space-y-3">
                              <div className="font-semibold text-foreground">{step.title}</div>
                              {step.body && (
                                <p className="text-sm text-muted-foreground">{step.body}</p>
                              )}
                              {step.link && (
                                <a
                                  href={step.link.href}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm font-medium text-primary underline underline-offset-2 hover:bg-muted"
                                >
                                  {step.link.label}
                                  <ExternalLink className="h-3.5 w-3.5" />
                                </a>
                              )}
                              {step.tiles && (
                                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                                  {step.tiles.map((tile) => (
                                    <div
                                      key={tile.title}
                                      className="rounded-md border border-border p-3"
                                    >
                                      <div className="text-sm font-semibold text-foreground">
                                        {tile.title}
                                      </div>
                                      {tile.body && (
                                        <div className="mt-1 text-xs text-muted-foreground">
                                          {tile.body}
                                        </div>
                                      )}
                                    </div>
                                  ))}
                                </div>
                              )}
                              {step.prompts?.map((p, j) => (
                                <div key={j} className="rounded-md border border-border">
                                  {p.label && (
                                    <div className="border-b border-border px-3 py-2 text-sm font-semibold text-foreground">
                                      {p.label}
                                    </div>
                                  )}
                                  <pre className="whitespace-pre-wrap break-words rounded-md bg-muted p-3 font-mono text-sm text-foreground">
                                    {p.text}
                                  </pre>
                                </div>
                              ))}
                              {step.checks && (
                                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                                  {step.checks.map((c) => (
                                    <div
                                      key={c}
                                      className="flex items-start gap-2 rounded-md border border-border p-3 text-sm text-foreground"
                                    >
                                      <Check className="mt-0.5 h-4 w-4 flex-none text-green-600 dark:text-green-500" />
                                      <span>{c}</span>
                                    </div>
                                  ))}
                                </div>
                              )}
                              {step.footnote && (
                                <p className="text-sm text-muted-foreground">{step.footnote}</p>
                              )}
                            </div>
                          </li>
                        ))}
                      </ol>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default StudentProjectLab;
