import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { useApp } from "@/contexts/AppContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { BarChart3, Check, ChevronDown, ChevronUp, BookOpen, TrendingUp, Brain, ArrowRight, FlaskConical, LibraryBig, Newspaper, Download } from "lucide-react";
import { mockTopics, availableCourses } from "@/data/mockData";
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

type Resource = {
  id: string; title: string; action: string;
  type: "textbook" | "lab" | "case-study" | "exercise" | "article" | "news" | "tool" | "video";
  source?: string;
};

type DayPlan = {
  day: number; dates: string; topic: string; resources: Resource[];
};

const workshopPlan: DayPlan[] = [
  { day: 1, dates: "Day 1", topic: "Introduction to OS Concepts & Process Lifecycle", resources: [
    { id: "r1", title: "Textbook Ch. 1-2", action: "Chapters 1-2 as required reading before class", type: "textbook" },
    { id: "r2", title: "AICTE Module 1 Guide", action: "Reference AICTE guidelines aligned with curriculum standards", type: "textbook" },
    { id: "r4", title: "Scheduling Simulator", action: "Interactive demo to visualize FCFS vs Round Robin", type: "exercise" },
  ]},
  { day: 2, dates: "Day 2", topic: "Process Scheduling & Synchronization Fundamentals", resources: [
    { id: "r3", title: "Textbook Ch. 3-4", action: "Chapters 3-4 on scheduling and threads", type: "textbook" },
    { id: "r11", title: "Producer-Consumer Lab", action: "Hands-on lab implementing the producer-consumer problem", type: "lab" },
    { id: "r6", title: "Scheduling Algorithms Lab", action: "In-class lab to implement and compare scheduling algorithms", type: "lab" },
  ]},
  { day: 3, dates: "Day 3", topic: "Memory Management & Review", resources: [
    { id: "r18", title: "Textbook Ch. 7-8", action: "Chapters 7-8 on memory hierarchy and paging", type: "textbook" },
    { id: "r21", title: "Page Table Simulator", action: "Demo showing address translation step by step", type: "exercise" },
    { id: "r16", title: "Review Sheet", action: "Comprehensive review covering all workshop topics", type: "textbook" },
  ]},
];

const currentDay = 1;

const conceptMasteryData = [
  { name: "Process Mgmt", mastery: 85 },
  { name: "CPU Scheduling", mastery: 78 },
  { name: "Memory Mgmt", mastery: 62 },
  { name: "Virtual Memory", mastery: 0 },
  { name: "File Systems", mastery: 58 },
  { name: "Synchronization", mastery: 0 },
  { name: "Deadlocks", mastery: 0 },
  { name: "I/O Systems", mastery: 55 },
];

const getMasteryColor = (mastery: number) => {
  if (mastery === 0) return "bg-background border text-muted-foreground";
  if (mastery >= 70) return "bg-primary text-primary-foreground";
  if (mastery >= 40) return "bg-primary/40 text-foreground";
  return "bg-destructive/20 text-destructive-foreground";
};

const learningJourney = [
  { month: "Day 1", level: "Beginner", active: true },
  { month: "Day 2", level: "Intermediate", active: false },
  { month: "Day 3", level: "Advanced", active: false },
];

const StudentHome = () => {
  const { studentProfile, currentCourse } = useApp();
  const navigate = useNavigate();
  const [expandedDays, setExpandedDays] = useState<number[]>([1]);
  const courseName = currentCourse?.name || availableCourses.find(c => c.code === studentProfile?.courseCode)?.name || "Course";

  const avgMastery = Math.round(mockTopics.reduce((sum, t) => sum + (t.mastery || 0), 0) / mockTopics.length);

  const toggleDay = (day: number) => {
    setExpandedDays((prev) => prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]);
  };

  return (
    <div className="p-6">
      {/* Welcome header */}
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="mb-4">
        <h1 className="font-heading text-3xl font-bold">
          Welcome back, {studentProfile?.name || "Student"}!
        </h1>
        <div className="mt-2 flex items-center gap-2">
          <Badge variant="outline" className="text-sm">{studentProfile?.learnerLevel || "Beginner"}</Badge>
          <span className="text-sm text-muted-foreground">{courseName}</span>
        </div>
      </motion.div>

      {/* Learning Timeline */}
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }} className="mb-6">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-3">
              <TrendingUp className="h-4 w-4 text-primary" />
              <p className="text-sm font-medium">Learning Timeline</p>
            </div>
            <div className="flex items-center justify-center gap-2">
              {learningJourney.map((item, i) => (
                <div key={item.month} className="flex items-center">
                  <div className={`flex flex-col items-center ${item.active ? "" : "opacity-40"}`}>
                    <Badge variant={item.active ? "default" : "outline"} className="text-xs">{item.level}</Badge>
                    <div className={`mt-2 h-3 w-3 rounded-full ${item.active ? "bg-primary" : "bg-muted"}`} />
                    <p className="mt-1 text-[10px] text-muted-foreground">{item.month}</p>
                    {item.active && <p className="text-[10px] text-primary font-medium">You are here</p>}
                  </div>
                  {i < learningJourney.length - 1 && (
                    <div className="mx-2 h-0.5 w-12 bg-muted sm:w-20" />
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Tabs: Overall Mastery + Workshop Progress */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="mb-6">
        <Tabs defaultValue="mastery">
          <TabsList className="mb-3">
            <TabsTrigger value="mastery">Overall Mastery</TabsTrigger>
            <TabsTrigger value="progress">Workshop Progress</TabsTrigger>
          </TabsList>
          <TabsContent value="mastery">
            <Card>
              <CardContent className="flex items-center gap-3 p-4">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <BarChart3 className="h-4 w-4" />
                </div>
                <div>
                  <p className="text-xl font-bold">{avgMastery}%</p>
                  <p className="text-[11px] text-muted-foreground">Your average understanding across all topics</p>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
          <TabsContent value="progress">
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
          </TabsContent>
        </Tabs>
      </motion.div>

      {/* Workshop Lesson Plan */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }} className="mb-6">
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
                    </CardContent>
                  )}
                </Card>
              );
            })}
          </CardContent>
        </Card>
      </motion.div>

      {/* Concept Mastery Heat Map */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="mb-6">
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

      {/* What To Do Next */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }} className="mb-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">What To Do Next</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div
              className="flex items-center gap-3 rounded-lg border p-3 cursor-pointer hover:bg-muted/50 transition-colors"
              onClick={() => navigate("/student/chat?mode=learning")}
            >
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent/10 text-accent">
                <BookOpen className="h-4 w-4" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium">Keep Learning</p>
                <p className="text-xs text-muted-foreground">Continue studying with the Teaching Assistant</p>
              </div>
              <ArrowRight className="h-4 w-4 text-muted-foreground" />
            </div>
            <div
              className="flex items-center gap-3 rounded-lg border p-3 cursor-pointer hover:bg-muted/50 transition-colors"
              onClick={() => navigate("/student/chat?mode=learning&newchat=true")}
            >
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                <TrendingUp className="h-4 w-4" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium">Let's recap what you learnt in Day {Math.min(currentDay, workshopPlan.length)}</p>
                <p className="text-xs text-muted-foreground">Review and consolidate today's key concepts</p>
              </div>
              <ArrowRight className="h-4 w-4 text-muted-foreground" />
            </div>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
};

export default StudentHome;
