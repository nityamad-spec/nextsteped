import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { useApp } from "@/contexts/AppContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { BarChart3, Target, Flame, Check, ChevronDown, ChevronUp, BookOpen, TrendingUp, Brain, ArrowRight } from "lucide-react";
import { mockTopics } from "@/data/mockData";

const lessonPlan = [
  { week: 1, topic: "Introduction to OS Concepts & Process Lifecycle", dates: "Jan 13 & 15" },
  { week: 2, topic: "Process Scheduling: FCFS, SJF, Round Robin", dates: "Jan 20 & 22" },
  { week: 3, topic: "Advanced Scheduling & Real-World Applications", dates: "Jan 27 & 29" },
  { week: 4, topic: "Threads & Concurrency Fundamentals", dates: "Feb 3 & 5" },
  { week: 5, topic: "Synchronization: Mutexes, Semaphores, Monitors", dates: "Feb 10 & 12" },
  { week: 6, topic: "Deadlock Prevention & Detection", dates: "Feb 17 & 19" },
  { week: 7, topic: "Midterm Review & Exam", dates: "Feb 24 & 26" },
  { week: 8, topic: "Physical & Virtual Memory Concepts", dates: "Mar 3 & 5" },
  { week: 9, topic: "Paging, Segmentation & Address Translation", dates: "Mar 10 & 12" },
  { week: 10, topic: "Memory Allocation Strategies", dates: "Mar 17 & 19" },
  { week: 11, topic: "File System Design & Implementation", dates: "Mar 24 & 26" },
  { week: 12, topic: "Modern Storage: NVMe, SSDs & I/O Systems", dates: "Mar 31 & Apr 2" },
  { week: 13, topic: "Security & Protection in Operating Systems", dates: "Apr 7 & 9" },
  { week: 14, topic: "Virtualization & Cloud OS Concepts", dates: "Apr 14 & 16" },
  { week: 15, topic: "Emerging Trends: WASM Runtimes, Unikernels", dates: "Apr 21 & 23" },
  { week: 16, topic: "Final Review & Exam", dates: "Apr 28 & 30" },
];

const currentWeek = 5;

const StudentHome = () => {
  const { studentProfile } = useApp();
  const navigate = useNavigate();
  const [showAllWeeks, setShowAllWeeks] = useState(false);

  const avgMastery = Math.round(mockTopics.reduce((sum, t) => sum + (t.mastery || 0), 0) / mockTopics.length);

  return (
    <div className="p-6">
      {/* Welcome header */}
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="mb-6">
        <h1 className="font-heading text-3xl font-bold">
          Welcome back, {studentProfile?.name || "Student"}!
        </h1>
        <div className="mt-2 flex items-center gap-2">
          <Badge variant="outline" className="text-sm">{studentProfile?.learnerLevel || "Beginner"}</Badge>
          <span className="text-sm text-muted-foreground">Operating Systems</span>
        </div>
      </motion.div>

      {/* Stats overview - mastery, readiness, streak */}
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
              <Target className="h-4 w-4 text-accent" /> What To Do Next
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

      {/* Lesson Plan Progress + Full Lesson Plan */}
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
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2 text-base">
                <BookOpen className="h-4 w-4 text-primary" /> Course Lesson Plan
              </CardTitle>
              <button
                onClick={() => setShowAllWeeks(!showAllWeeks)}
                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                {showAllWeeks ? "Collapse" : "Show all weeks"}
                {showAllWeeks ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
              </button>
            </div>
          </CardHeader>
          <CardContent className="space-y-1">
            {(showAllWeeks ? lessonPlan : lessonPlan.slice(0, 6)).map((week) => (
              <div
                key={week.week}
                className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors ${
                  week.week === currentWeek
                    ? "bg-primary/10 border border-primary/20 font-medium"
                    : week.week < currentWeek
                    ? "text-muted-foreground"
                    : ""
                }`}
              >
                <Badge
                  variant={week.week === currentWeek ? "default" : "outline"}
                  className="shrink-0 text-xs w-16 justify-center"
                >
                  Week {week.week}
                </Badge>
                <span className="text-xs text-muted-foreground shrink-0 w-24">{week.dates}</span>
                <span className="flex-1 truncate">{week.topic}</span>
                {week.week === currentWeek && (
                  <Badge variant="secondary" className="text-[10px] shrink-0">Current</Badge>
                )}
                {week.week < currentWeek && (
                  <Check className="h-3.5 w-3.5 text-primary shrink-0" />
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
};

export default StudentHome;
