import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { useApp } from "@/contexts/AppContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { BarChart3, Target, Flame, Check, ChevronDown, ChevronUp, BookOpen, TrendingUp, Brain, ArrowRight, FlaskConical, LibraryBig, Newspaper, Download } from "lucide-react";
import { mockTopics, availableCourses } from "@/data/mockData";
import { Button } from "@/components/ui/button";

const typeLabels: Record<string, string> = {
  textbook: "Textbook",
  exercise: "Interactive Exercise",
  lab: "Interactive Exercise",
  tool: "Interactive Exercise",
  "case-study": "Case Study",
  article: "Article & Industry Context",
  news: "Article & Industry Context",
  video: "Video",
};

const typeColors: Record<string, string> = {
  textbook: "bg-secondary text-secondary-foreground",
  exercise: "bg-primary/10 text-primary",
  lab: "bg-primary/10 text-primary",
  tool: "bg-primary/10 text-primary",
  "case-study": "bg-accent/20 text-accent-foreground",
  article: "bg-muted text-muted-foreground",
  news: "bg-muted text-muted-foreground",
  video: "bg-destructive/10 text-destructive",
};

const typeIcons: Record<string, typeof BookOpen> = {
  textbook: BookOpen,
  exercise: FlaskConical,
  lab: FlaskConical,
  tool: FlaskConical,
  "case-study": LibraryBig,
  article: Newspaper,
  news: Newspaper,
  video: BookOpen,
};

type Resource = {
  id: string;
  title: string;
  action: string;
  type: "textbook" | "lab" | "case-study" | "exercise" | "article" | "news" | "tool" | "video";
  source?: string;
};

type WeekPlan = {
  week: number;
  dates: string;
  topic: string;
  resources: Resource[];
};

const lessonPlan: WeekPlan[] = [
  { week: 1, dates: "Jan 13 & 15", topic: "Introduction to OS Concepts & Process Lifecycle", resources: [
    { id: "r1", title: "Textbook Ch. 1-2", action: "Chapters 1-2 as required reading before class", type: "textbook" },
    { id: "r2", title: "AICTE Module 1 Guide", action: "Reference AICTE guidelines aligned with curriculum standards", type: "textbook" },
  ]},
  { week: 2, dates: "Jan 20 & 22", topic: "Process Scheduling: FCFS, SJF, Round Robin", resources: [
    { id: "r3", title: "Textbook Ch. 3", action: "Chapter 3 as pre-lecture reading on scheduling algorithms", type: "textbook" },
    { id: "r4", title: "Scheduling Simulator", action: "Interactive demo to visualize FCFS vs Round Robin", type: "exercise" },
  ]},
  { week: 3, dates: "Jan 27 & 29", topic: "Advanced Scheduling & Real-World Applications", resources: [
    { id: "r6", title: "Scheduling Algorithms Lab", action: "In-class lab to implement and compare scheduling algorithms", type: "lab" },
  ]},
  { week: 4, dates: "Feb 3 & 5", topic: "Threads & Concurrency Fundamentals", resources: [
    { id: "r8", title: "Textbook Ch. 4", action: "Chapter 4 on threads and concurrency models", type: "textbook" },
    { id: "r9", title: "POSIX Threads Tutorial", action: "Hands-on reference for practicing pthreads", type: "exercise" },
  ]},
  { week: 5, dates: "Feb 10 & 12", topic: "Synchronization: Mutexes, Semaphores, Monitors", resources: [
    { id: "r10", title: "Textbook Ch. 5", action: "Chapter 5 on synchronization primitives", type: "textbook" },
    { id: "r11", title: "Producer-Consumer Lab", action: "Hands-on lab implementing the producer-consumer problem", type: "lab" },
  ]},
  { week: 6, dates: "Feb 17 & 19", topic: "Deadlock Prevention & Detection", resources: [
    { id: "r13", title: "Textbook Ch. 6", action: "Chapter 6 on deadlock concepts and prevention strategies", type: "textbook" },
    { id: "r14", title: "Deadlock Visualization Tool", action: "Visual tool showing how deadlocks form and resolve", type: "exercise" },
  ]},
  { week: 7, dates: "Feb 24 & 26", topic: "Midterm Review & Exam", resources: [
    { id: "r16", title: "Review Sheet", action: "Comprehensive review sheet covering weeks 1-6", type: "textbook" },
    { id: "r17", title: "Practice Exam", action: "Take-home practice exam before the midterm", type: "exercise" },
  ]},
  { week: 8, dates: "Mar 3 & 5", topic: "Physical & Virtual Memory Concepts", resources: [
    { id: "r18", title: "Textbook Ch. 7", action: "Chapter 7 on memory hierarchy and virtual memory basics", type: "textbook" },
    { id: "r19", title: "Memory Hierarchy Slides", action: "Slides walking through the memory hierarchy", type: "textbook" },
  ]},
  { week: 9, dates: "Mar 10 & 12", topic: "Paging, Segmentation & Address Translation", resources: [
    { id: "r20", title: "Textbook Ch. 8", action: "Chapter 8 on paging and segmentation", type: "textbook" },
    { id: "r21", title: "Page Table Simulator", action: "Demo showing address translation step by step", type: "exercise" },
  ]},
  { week: 10, dates: "Mar 17 & 19", topic: "Memory Allocation Strategies", resources: [
    { id: "r23", title: "Build a Memory Allocator in C", action: "In-class lab to implement a basic memory allocator", type: "lab" },
    { id: "r24", title: "Textbook Ch. 9", action: "Chapter 9 on memory allocation strategies", type: "textbook" },
  ]},
  { week: 11, dates: "Mar 24 & 26", topic: "File System Design & Implementation", resources: [
    { id: "r26", title: "Textbook Ch. 10-11", action: "Chapters 10-11 on file system design and implementation", type: "textbook" },
    { id: "r27", title: "EXT4 Case Study", action: "EXT4 file system as a real-world design example", type: "case-study" },
  ]},
  { week: 12, dates: "Mar 31 & Apr 2", topic: "Modern Storage: NVMe, SSDs & I/O Systems", resources: [
    { id: "r29", title: "Industry White Paper", action: "Industry context on modern storage technologies", type: "article" },
    { id: "r30", title: "Storage Benchmark Lab", action: "Hands-on lab comparing I/O performance across storage types", type: "lab" },
  ]},
  { week: 13, dates: "Apr 7 & 9", topic: "Security & Protection in Operating Systems", resources: [
    { id: "r31", title: "Textbook Ch. 14", action: "Chapter 14 on OS security and protection mechanisms", type: "textbook" },
    { id: "r32", title: "CVE Case Studies", action: "Real CVEs illustrating OS vulnerability patterns", type: "case-study" },
  ]},
  { week: 14, dates: "Apr 14 & 16", topic: "Virtualization & Cloud OS Concepts", resources: [
    { id: "r34", title: "Hypervisor Comparison Article", action: "Reference for Type 1 vs Type 2 hypervisors", type: "article" },
    { id: "r35", title: "Docker Lab", action: "Hands-on lab containerizing a simple application", type: "lab" },
  ]},
  { week: 15, dates: "Apr 21 & 23", topic: "Emerging Trends: WASM Runtimes, Unikernels", resources: [
    { id: "r37", title: "Research Papers", action: "Selected papers on WASM runtimes and unikernels", type: "article" },
    { id: "r38", title: "Hands-On Demo", action: "Live demo of a WASM runtime", type: "lab" },
  ]},
  { week: 16, dates: "Apr 28 & 30", topic: "Final Review & Exam", resources: [
    { id: "r40", title: "Comprehensive Review", action: "Final review covering all semester topics", type: "textbook" },
    { id: "r41", title: "Practice Final", action: "Take-home practice exam before the final", type: "exercise" },
  ]},
];

const currentWeek = 5;

const StudentHome = () => {
  const { studentProfile, currentCourse } = useApp();
  const navigate = useNavigate();
  const [expandedWeeks, setExpandedWeeks] = useState<number[]>([]);
  const courseName = currentCourse?.name || availableCourses.find(c => c.code === studentProfile?.courseCode)?.name || "Course";

  const avgMastery = Math.round(mockTopics.reduce((sum, t) => sum + (t.mastery || 0), 0) / mockTopics.length);

  const toggleWeek = (week: number) => {
    setExpandedWeeks((prev) => prev.includes(week) ? prev.filter((w) => w !== week) : [...prev, week]);
  };

  return (
    <div className="p-6">
      {/* Welcome header */}
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="mb-6">
        <h1 className="font-heading text-3xl font-bold">
          Welcome back, {studentProfile?.name || "Student"}!
        </h1>
        <div className="mt-2 flex items-center gap-2">
          <Badge variant="outline" className="text-sm">{studentProfile?.learnerLevel || "Beginner"}</Badge>
          <span className="text-sm text-muted-foreground">{courseName}</span>
        </div>
      </motion.div>

      {/* Stats overview */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }} className="mb-6 grid gap-3 grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <BarChart3 className="h-4 w-4" />
            </div>
            <div>
              <p className="text-xl font-bold">{avgMastery}%</p>
              <p className="text-[11px] text-muted-foreground">Overall Mastery</p>
              <p className="text-[10px] text-muted-foreground mt-0.5">Your average understanding across all topics</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-destructive/10 text-destructive">
              <Target className="h-4 w-4" />
            </div>
            <div>
              <p className="text-xl font-bold">62%</p>
              <p className="text-[11px] text-muted-foreground">Exam Readiness</p>
              <p className="text-[10px] text-muted-foreground mt-0.5">How prepared you are for your next exam</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent/10 text-accent">
              <Flame className="h-4 w-4" />
            </div>
            <div>
              <p className="text-xl font-bold">4 days</p>
              <p className="text-[11px] text-muted-foreground">Learning Streak</p>
              <p className="text-[10px] text-muted-foreground mt-0.5">Consecutive days you've used the platform</p>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* What To Do Next */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="mb-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              What To Do Next
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div
              className="flex items-center gap-3 rounded-lg border p-3 cursor-pointer hover:bg-muted/50 transition-colors"
              onClick={() => navigate("/student/chat")}
            >
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-destructive/10 text-destructive">
                <BookOpen className="h-4 w-4" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium">Practice Virtual Memory Concepts</p>
                <p className="text-xs text-muted-foreground">Your weakest area — targeted practice recommended</p>
              </div>
              <ArrowRight className="h-4 w-4 text-muted-foreground" />
            </div>
            <div
              className="flex items-center gap-3 rounded-lg border p-3 cursor-pointer hover:bg-muted/50 transition-colors"
              onClick={() => navigate("/student/chat")}
            >
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent/10 text-accent">
                <TrendingUp className="h-4 w-4" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium">Continue Synchronization Module</p>
                <p className="text-xs text-muted-foreground">You're making progress — keep the momentum going</p>
              </div>
              <ArrowRight className="h-4 w-4 text-muted-foreground" />
            </div>
            <div
              className="flex items-center gap-3 rounded-lg border p-3 cursor-pointer hover:bg-muted/50 transition-colors"
              onClick={() => navigate("/student/chat?mode=exam")}
            >
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Brain className="h-4 w-4" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium">Take an Exam Simulation</p>
                <p className="text-xs text-muted-foreground">Midterm in 6 days — practice under timed conditions</p>
              </div>
              <ArrowRight className="h-4 w-4 text-muted-foreground" />
            </div>
            <div
              className="flex items-center gap-3 rounded-lg border p-3 cursor-pointer hover:bg-muted/50 transition-colors"
              onClick={() => navigate("/student/chat")}
            >
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                <BookOpen className="h-4 w-4" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium">Switch to Deadlocks Module</p>
                <p className="text-xs text-muted-foreground">Low mastery (30%) — review the four Coffman conditions</p>
              </div>
              <ArrowRight className="h-4 w-4 text-muted-foreground" />
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Lesson Plan Progress + Course Lesson Plan */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }} className="mb-6">
        <Card className="mb-4">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <BookOpen className="h-4 w-4 text-primary" />
                <p className="text-sm font-medium">Lesson Plan Progress</p>
              </div>
              <span className="text-sm text-muted-foreground">Week {currentWeek} of {lessonPlan.length}</span>
            </div>
            <Progress value={(currentWeek / lessonPlan.length) * 100} className="h-2 mb-1" />
            <p className="text-xs text-muted-foreground">Currently covering: {lessonPlan[currentWeek - 1].topic}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <BookOpen className="h-4 w-4 text-primary" /> Course Lesson Plan
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {lessonPlan.map((wp) => {
              const isExpanded = expandedWeeks.includes(wp.week);
              const isCurrent = wp.week === currentWeek;
              const isPast = wp.week < currentWeek;

              return (
                <Card key={wp.week} className={isCurrent ? "border-primary/30" : ""}>
                  <div
                    className={`flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-muted/30 transition-colors ${
                      isCurrent ? "bg-primary/5" : ""
                    }`}
                    onClick={() => toggleWeek(wp.week)}
                  >
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <Badge
                        variant={isCurrent ? "default" : "outline"}
                        className="shrink-0 text-xs w-16 justify-center"
                      >
                        Week {wp.week}
                      </Badge>
                      <span className="text-xs text-muted-foreground shrink-0 w-24">{wp.dates}</span>
                      <span className={`text-sm truncate ${isCurrent ? "font-medium" : isPast ? "text-muted-foreground" : ""}`}>
                        {wp.topic}
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
                      {wp.resources.length === 0 ? (
                        <p className="text-xs text-muted-foreground py-2">No resources for this week yet.</p>
                      ) : (
                        wp.resources.map((r) => {
                          const Icon = typeIcons[r.type] || BookOpen;
                          const isDownloadable = r.type === "textbook" || r.type === "article";

                          return (
                            <div key={r.id} className="flex items-start gap-3 rounded-lg border p-3">
                              <div className="pt-0.5">
                                <Icon className="h-4 w-4 text-muted-foreground" />
                              </div>
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
    </div>
  );
};

export default StudentHome;
