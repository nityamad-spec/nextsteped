import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { ShieldCheck } from "lucide-react";
import { useApp } from "@/contexts/AppContext";
import { workshopPlan as sharedWorkshopPlan } from "@/data/workshopPlan";
import { useStudentStatus } from "@/hooks/useStudentStatus";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Check, ChevronDown, ChevronUp, BookOpen, Brain, ArrowRight, FlaskConical, LibraryBig, Newspaper, Download, ClipboardList, GraduationCap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

const typeLabels: Record<string, string> = {
  textbook: "Textbook", exercise: "Interactive Exercise", lab: "Interactive Exercise",
  tool: "Interactive Exercise", "case-study": "Case Study", article: "Article & Industry Context",
  news: "Article & Industry Context", video: "Video",
};

const typeColors: Record<string, string> = {
  textbook: "bg-secondary text-secondary-foreground", exercise: "bg-primary/10 text-primary",
  lab: "bg-primary/10 text-primary", tool: "bg-primary/10 text-primary",
  "case-study": "bg-accent/20 text-accent-foreground", article: "bg-muted text-muted-foreground",
  news: "bg-muted text-muted-foreground", video: "bg-destructive/10 text-destructive",
};

const typeIcons: Record<string, typeof BookOpen> = {
  textbook: BookOpen, exercise: FlaskConical, lab: FlaskConical, tool: FlaskConical,
  "case-study": LibraryBig, article: Newspaper, news: Newspaper, video: BookOpen,
};

const workshopPlan = sharedWorkshopPlan;
const currentDay = 1;

const conceptMasteryData = [
  { name: "Variables & Types", mastery: 85 },
  { name: "Control Flow", mastery: 78 },
  { name: "Functions", mastery: 62 },
  { name: "Lists & Dicts", mastery: 0 },
  { name: "File Handling", mastery: 0 },
  { name: "OOP Basics", mastery: 0 },
  { name: "Error Handling", mastery: 0 },
  { name: "Modules", mastery: 55 },
];

const getMasteryColor = (mastery: number) => {
  if (mastery === 0) return "bg-background border text-muted-foreground";
  if (mastery >= 70) return "bg-primary text-primary-foreground";
  if (mastery >= 40) return "bg-primary/40 text-foreground";
  return "bg-destructive/20 text-destructive-foreground";
};

const StudentHome = () => {
  const { studentProfile, currentCourse } = useApp();
  const { profileData } = useStudentStatus();
  const navigate = useNavigate();
  const [expandedDays, setExpandedDays] = useState<number[]>([1]);
  const courseName = currentCourse?.name || "Intro to Python";
  const displayName = profileData?.name || studentProfile?.name || "Student";

  const toggleDay = (day: number) => {
    setExpandedDays((prev) => prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]);
  };

  return (
    <div className="p-6">
      {/* Welcome header */}
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="mb-4">
        <h1 className="font-heading text-3xl font-bold">
          Welcome back, {displayName}!
        </h1>
        <div className="mt-2 flex items-center gap-2">
          <Badge variant="outline" className="text-sm">{studentProfile?.learnerLevel || "Beginner"}</Badge>
          <span className="text-sm text-muted-foreground">{courseName}</span>
        </div>
      </motion.div>

      {/* Privacy notice */}
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.03 }} className="mb-5">
        <div className="flex items-center gap-2.5 rounded-lg border border-primary/20 bg-primary/5 px-4 py-2.5">
          <ShieldCheck className="h-4 w-4 shrink-0 text-primary" />
          <p className="text-xs text-muted-foreground">
            <span className="font-medium text-foreground">Your data is private & anonymized.</span>{" "}
            Your professor can only see aggregate class trends — never your individual chats, quiz answers, or performance data.
          </p>
        </div>
      </motion.div>

      {/* Workshop Progress */}
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }} className="mb-6">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <BookOpen className="h-4 w-4 text-primary" />
                <p className="text-sm font-medium">Workshop Progress</p>
              </div>
              <span className="text-sm text-muted-foreground">Day {currentDay} of {workshopPlan.length}</span>
            </div>
            <Progress value={(currentDay / workshopPlan.length) * 100} className="h-2 mb-1" />
            <p className="text-xs text-muted-foreground">Currently covering: {workshopPlan[currentDay - 1].topic}</p>
          </CardContent>
        </Card>
      </motion.div>

      {/* Workshop Lesson Plan */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="mb-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <BookOpen className="h-4 w-4 text-primary" /> Workshop Lesson Plan
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {workshopPlan.map((dp) => {
              const isExpanded = expandedDays.includes(dp.day);
              const isCurrent = dp.day === currentDay;
              const isPast = dp.day < currentDay;

              return (
                <Card key={dp.day} className={isCurrent ? "border-primary/30" : ""}>
                  <div
                    className={`flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-muted/30 transition-colors ${isCurrent ? "bg-primary/5" : ""}`}
                    onClick={() => toggleDay(dp.day)}
                  >
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <Badge variant={isCurrent ? "default" : "outline"} className="shrink-0 text-xs w-16 justify-center">
                        Day {dp.day}
                      </Badge>
                      <span className={`text-sm truncate ${isCurrent ? "font-medium" : isPast ? "text-muted-foreground" : ""}`}>
                        {dp.topic}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 ml-2 shrink-0">
                      {isCurrent && <Badge variant="secondary" className="text-[10px]">Current</Badge>}
                      {isPast && <Check className="h-3.5 w-3.5 text-primary" />}
                      {isExpanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                    </div>
                  </div>

                  {isExpanded && (
                    <CardContent className="pt-0 pb-4 space-y-2">
                      {dp.resources.length === 0 ? (
                        <p className="text-xs text-muted-foreground py-2">No resources for this day yet.</p>
                      ) : (
                        dp.resources.map((r) => {
                          const Icon = typeIcons[r.type] || BookOpen;
                          const isDownloadable = r.type === "textbook" || r.type === "article";
                          return (
                            <div key={r.id} className="flex items-start gap-3 rounded-lg border p-3">
                              <div className="pt-0.5"><Icon className="h-4 w-4 text-muted-foreground" /></div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                  <span className="text-sm font-medium">{r.title}</span>
                                  <Badge variant="outline" className={`text-[10px] ${typeColors[r.type] || ""}`}>
                                    {typeLabels[r.type] || r.type}
                                  </Badge>
                                </div>
                                <p className="text-xs text-muted-foreground mt-0.5">{r.action}</p>
                              </div>
                              {isDownloadable && (
                                <Button variant="ghost" size="sm" className="h-8 shrink-0" title="Download">
                                  <Download className="h-3.5 w-3.5" />
                                </Button>
                              )}
                            </div>
                          );
                        })
                      )}

                      {/* Daily Quiz for Day 1 & 2, Final Exam for Day 3 */}
                      {dp.day < workshopPlan.length ? (
                        <div
                          className="flex items-center gap-3 rounded-lg border border-primary/20 bg-primary/5 p-3 mt-3 cursor-pointer hover:bg-primary/10 transition-colors"
                          onClick={() => navigate("/student/exam?mode=daily-quiz")}
                        >
                          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                            <ClipboardList className="h-4 w-4" />
                          </div>
                          <div className="flex-1">
                            <p className="text-sm font-medium">Daily Quiz — Day {dp.day}</p>
                            <p className="text-xs text-muted-foreground">Test your understanding of today's concepts</p>
                          </div>
                          <ArrowRight className="h-4 w-4 text-primary" />
                        </div>
                      ) : (
                        <div
                          className="flex items-center gap-3 rounded-lg border border-accent/30 bg-accent/5 p-3 mt-3 cursor-pointer hover:bg-accent/10 transition-colors"
                          onClick={() => navigate("/student/exam?mode=exam")}
                        >
                          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent/10 text-accent-foreground">
                            <GraduationCap className="h-4 w-4" />
                          </div>
                          <div className="flex-1">
                            <p className="text-sm font-medium">Final Exam Simulation</p>
                            <p className="text-xs text-muted-foreground">Take the full exam covering all workshop topics</p>
                          </div>
                          <ArrowRight className="h-4 w-4 text-accent-foreground" />
                        </div>
                      )}
                    </CardContent>
                  )}
                </Card>
              );
            })}
          </CardContent>
        </Card>
      </motion.div>

      {/* Concept Mastery Heat Map */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }} className="mb-6">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <Brain className="h-4 w-4 text-primary" /> Concept Mastery Heat Map
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {conceptMasteryData.map((concept) => (
                <Tooltip key={concept.name}>
                  <TooltipTrigger asChild>
                    <div className={`rounded-lg p-3 text-center cursor-default transition-colors ${getMasteryColor(concept.mastery)}`}>
                      <p className="text-xs font-medium truncate">{concept.name}</p>
                      <p className="text-lg font-bold mt-1">{concept.mastery === 0 ? "—" : `${concept.mastery}%`}</p>
                    </div>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>{concept.name}: {concept.mastery === 0 ? "Not covered yet" : `${concept.mastery}% mastery`}</p>
                  </TooltipContent>
                </Tooltip>
              ))}
            </div>
            <div className="flex items-center justify-center gap-4 mt-3">
              <div className="flex items-center gap-1.5">
                <div className="h-3 w-3 rounded bg-background border" />
                <span className="text-[10px] text-muted-foreground">Not covered</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="h-3 w-3 rounded bg-primary/40" />
                <span className="text-[10px] text-muted-foreground">In progress</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="h-3 w-3 rounded bg-primary" />
                <span className="text-[10px] text-muted-foreground">Strong</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
};

export default StudentHome;
