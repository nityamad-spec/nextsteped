import { useState } from "react";
import { mockDashboard, mockTopics } from "@/data/mockData";
import { useApp } from "@/contexts/AppContext";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Users, MessageSquare, AlertTriangle, TrendingUp, BarChart3, ArrowUp, ArrowDown, Minus, Shield, ChevronDown } from "lucide-react";

const masteryColors: Record<string, string> = {
  Beginner: "bg-mastery-beginner/20 text-mastery-beginner",
  Developing: "bg-mastery-developing/20 text-mastery-developing",
  Proficient: "bg-mastery-proficient/20 text-mastery-proficient",
  Expert: "bg-mastery-expert/20 text-mastery-expert",
};

const masteryBarColors: Record<string, string> = {
  Beginner: "[&>div]:bg-mastery-beginner",
  Developing: "[&>div]:bg-mastery-developing",
  Proficient: "[&>div]:bg-mastery-proficient",
  Expert: "[&>div]:bg-mastery-expert",
};

const topicInsights: Record<string, { beginner: number; developing: number; proficient: number; expert: number; summary: string; detail: string }> = {
  "Process Management": { beginner: 2, developing: 4, proficient: 15, expert: 24, summary: "Students demonstrate strong understanding of process lifecycle, creation, and termination.", detail: "Most students can explain context switching, PCBs, and process states. This topic can serve as a foundation to reinforce related concepts like scheduling." },
  "CPU Scheduling": { beginner: 3, developing: 6, proficient: 18, expert: 18, summary: "Solid grasp of scheduling algorithms across the class.", detail: "Students can compare FCFS, SJF, and Round Robin effectively. A few still struggle with priority inversion edge cases." },
  "Memory Management": { beginner: 8, developing: 14, proficient: 15, expert: 8, summary: "Mixed understanding — allocation strategies are a common stumbling block.", detail: "Students understand basic concepts but have difficulty with fragmentation analysis and choosing between paging vs segmentation in applied scenarios." },
  "Virtual Memory": { beginner: 15, developing: 14, proficient: 10, expert: 6, summary: "Significant gaps in page replacement and demand paging concepts.", detail: "Many students confuse page faults with segmentation faults. Consider revisiting TLB mechanics and running the Page Table Simulator again." },
  "File Systems": { beginner: 7, developing: 16, proficient: 14, expert: 8, summary: "Students understand structure but struggle with implementation details.", detail: "EXT4 case study helped with design intuition, but inode allocation and journaling concepts need reinforcement." },
  "Synchronization": { beginner: 18, developing: 13, proficient: 10, expert: 4, summary: "Concurrency primitives remain challenging for most students.", detail: "Producer-consumer and readers-writers problems are frequently confused. The mutex vs semaphore distinction needs more practice." },
  "Deadlocks": { beginner: 20, developing: 12, proficient: 8, expert: 5, summary: "Deadlock detection is understood, but prevention strategies are weak.", detail: "Students can identify deadlocks in diagrams but struggle to apply Banker's algorithm or explain resource ordering in practice." },
  "I/O Systems": { beginner: 6, developing: 13, proficient: 16, expert: 10, summary: "Reasonable understanding of I/O models, weaker on modern storage.", detail: "DMA and interrupt-driven I/O are well understood. NVMe and SSD internals from the industry white paper need more discussion." },
};

const weeklyData = [
  { week: "Week 1", active: 45, sessions: 89, up: 0, down: 0, stayed: 45, beginner: 20, developing: 15, proficient: 8, expert: 2, insight: "" },
  { week: "Week 2", active: 44, sessions: 102, up: 3, down: 1, stayed: 40, beginner: 17, developing: 16, proficient: 9, expert: 2, insight: "3 students moved up — early momentum is building." },
  { week: "Week 3", active: 42, sessions: 95, up: 4, down: 2, stayed: 36, beginner: 14, developing: 15, proficient: 10, expert: 3, insight: "2 students dropped a level. Consider reviewing Week 3 material (Advanced Scheduling) for common pain points." },
  { week: "Week 4", active: 40, sessions: 78, up: 5, down: 1, stayed: 34, beginner: 10, developing: 14, proficient: 12, expert: 4, insight: "Strong upward movement. Sessions dipped — students may be consolidating knowledge independently." },
  { week: "Week 5", active: 43, sessions: 112, up: 7, down: 1, stayed: 35, beginner: 8, developing: 13, proficient: 15, expert: 7, insight: "Highest engagement week. 7 students leveled up — the Synchronization topic is resonating well." },
  { week: "Week 6", active: 41, sessions: 98, up: 3, down: 1, stayed: 37, beginner: 6, developing: 12, proficient: 14, expert: 9, insight: "Steady progress. Beginner count is decreasing — the class is maturing overall." },
];

const CourseDashboard = () => {
  const d = mockDashboard;
  const [expandedTopic, setExpandedTopic] = useState<string | null>(null);
  const [expandedWeek, setExpandedWeek] = useState<string | null>(null);
  const { currentCourse } = useApp();
  const courseSections = currentCourse?.sections || [];
  const [selectedSection, setSelectedSection] = useState<string>("all");

  return (
    <div className="p-6">
      <div className="mb-8">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <h1 className="font-heading text-3xl font-bold">Course Dashboard</h1>
            <p className="text-muted-foreground">{currentCourse?.name || "Course"} — Student Insights</p>
          </div>
          {courseSections.length >= 1 && (
            <Select value={selectedSection} onValueChange={setSelectedSection}>
              <SelectTrigger className="w-[180px]"><SelectValue placeholder="All Sections" /></SelectTrigger>
              <SelectContent>
                {courseSections.length > 1 && <SelectItem value="all">All Sections</SelectItem>}
                {courseSections.map((s) => (
                  <SelectItem key={s} value={s}>{s}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
        <div className="mt-2 flex items-center gap-2 rounded-lg border border-primary/20 bg-primary/5 px-3 py-2">
          <Shield className="h-4 w-4 text-primary shrink-0" />
          <p className="text-xs text-muted-foreground">All student data is anonymized to protect privacy and encourage authentic engagement with the Teaching Assistant.</p>
        </div>
      </div>

      {/* Stats row */}
      <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Users className="h-5 w-5" />
            </div>
            <div>
              <p className="text-2xl font-bold">{d.activeStudents}</p>
              <p className="text-xs text-muted-foreground">Active Students</p>
              <p className="text-[10px] text-muted-foreground/70">Students currently enrolled and active in the course</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-mastery-expert/10 text-mastery-expert">
              <TrendingUp className="h-5 w-5" />
            </div>
            <div>
              <p className="text-2xl font-bold">72%</p>
              <p className="text-xs text-muted-foreground">Avg Mastery</p>
              <p className="text-[10px] text-muted-foreground/70">Average mastery level across all enrolled students</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent/10 text-accent">
              <MessageSquare className="h-5 w-5" />
            </div>
            <div>
              <p className="text-2xl font-bold">{d.totalSessions}</p>
              <p className="text-xs text-muted-foreground">Total Sessions</p>
              <p className="text-[10px] text-muted-foreground/70">Teaching Assistant chat sessions initiated by students</p>
            </div>
          </CardContent>
        </Card>
        <Card className="opacity-50">
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-destructive/10 text-destructive">
              <AlertTriangle className="h-5 w-5" />
            </div>
            <div>
              <p className="text-2xl font-bold">{d.atRiskCount}</p>
              <p className="text-xs text-muted-foreground">At-Risk Learners</p>
              <p className="text-[10px] text-muted-foreground/70">Students falling behind based on engagement & scores</p>
              <Badge variant="secondary" className="text-[10px] mt-1">In Progress</Badge>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="space-y-6">
        {/* Mastery Distribution */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><BarChart3 className="h-5 w-5" /> Mastery Distribution</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {Object.entries(d.masteryDistribution).map(([level, count]) => (
                <div key={level}>
                  <div className="mb-1 flex justify-between text-sm">
                    <span className="flex items-center gap-2">
                      <span className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${masteryColors[level] || ""}`}>{level}</span>
                    </span>
                    <span className="text-muted-foreground">{count} students</span>
                  </div>
                  <Progress value={(count / d.activeStudents) * 100} className={`h-2 ${masteryBarColors[level] || ""}`} />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Weekly Engagement */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><BarChart3 className="h-5 w-5" /> Weekly Engagement</CardTitle>
            <CardDescription>Click a week to see mastery level breakdown and AI-generated insights</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Compact legend */}
            <div className="flex flex-wrap items-center gap-3 rounded-lg border bg-muted/30 px-3 py-2 text-[11px] text-muted-foreground">
              <span className="font-medium">Movement:</span>
              <span className="text-mastery-movedup">▲ Moved Up</span>
              <span className="text-destructive">▼ Moved Down</span>
              <span>— Stayed</span>
            </div>

            <div className="space-y-2">
              {weeklyData.map((w) => {
                const isExpanded = expandedWeek === w.week;
                return (
                  <div
                    key={w.week}
                    className={`rounded-lg border transition-all cursor-pointer hover:border-primary/30 ${isExpanded ? "border-primary/40 bg-muted/20" : ""}`}
                    onClick={() => setExpandedWeek(isExpanded ? null : w.week)}
                  >
                    {/* Main row */}
                    <div className="flex items-center gap-4 p-3">
                      <span className="w-14 text-sm font-semibold text-foreground shrink-0">{w.week}</span>
                      <div className="flex items-center gap-3 shrink-0">
                        <div className="flex items-center gap-1">
                          <Users className="h-3 w-3 text-muted-foreground" />
                          <span className="text-sm font-bold">{w.active}</span>
                          <span className="text-[10px] text-muted-foreground">active</span>
                        </div>
                        <span className="text-[10px] text-muted-foreground">{w.sessions} sessions</span>
                      </div>
                      <div className="flex items-center gap-2 ml-auto shrink-0">
                        <div className="flex items-center gap-1 rounded-md bg-mastery-movedup/10 px-2 py-1">
                          <ArrowUp className="h-3 w-3 text-mastery-movedup" />
                          <span className="text-xs font-bold text-mastery-movedup">{w.up}</span>
                        </div>
                        <div className="flex items-center gap-1 rounded-md bg-destructive/10 px-2 py-1">
                          <ArrowDown className="h-3 w-3 text-destructive" />
                          <span className="text-xs font-bold text-destructive">{w.down}</span>
                        </div>
                        <div className="flex items-center gap-1 rounded-md bg-muted px-2 py-1">
                          <Minus className="h-3 w-3 text-muted-foreground" />
                          <span className="text-xs font-bold text-muted-foreground">{w.stayed}</span>
                        </div>
                        <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${isExpanded ? "rotate-180" : ""}`} />
                      </div>
                    </div>

                    {/* Expanded detail */}
                    {isExpanded && (
                      <div className="border-t px-4 py-3 space-y-3">
                        <div>
                          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">Mastery Level Distribution</p>
                          <div className="grid grid-cols-4 gap-2">
                            <div className="rounded-lg bg-mastery-beginner/10 p-2.5 text-center">
                              <p className="text-lg font-bold text-mastery-beginner">{w.beginner}</p>
                              <p className="text-[10px] text-mastery-beginner/80">Beginner</p>
                            </div>
                            <div className="rounded-lg bg-mastery-developing/10 p-2.5 text-center">
                              <p className="text-lg font-bold text-mastery-developing">{w.developing}</p>
                              <p className="text-[10px] text-mastery-developing/80">Developing</p>
                            </div>
                            <div className="rounded-lg bg-mastery-proficient/10 p-2.5 text-center">
                              <p className="text-lg font-bold text-mastery-proficient">{w.proficient}</p>
                              <p className="text-[10px] text-mastery-proficient/80">Proficient</p>
                            </div>
                            <div className="rounded-lg bg-mastery-expert/10 p-2.5 text-center">
                              <p className="text-lg font-bold text-mastery-expert">{w.expert}</p>
                              <p className="text-[10px] text-mastery-expert/80">Expert</p>
                            </div>
                          </div>
                        </div>
                        {w.insight && (
                          <div className="flex items-start gap-2 rounded-lg border border-primary/20 bg-primary/5 px-3 py-2">
                            <TrendingUp className="h-3.5 w-3.5 text-primary mt-0.5 shrink-0" />
                            <p className="text-xs text-muted-foreground">{w.insight}</p>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {/* Concept Mastery Heatmap */}
        <Card>
          <CardHeader>
            <CardTitle>Concept Mastery Heatmap</CardTitle>
            <CardDescription>Class-wide mastery per topic — click a topic for detailed breakdown</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap items-center gap-4 rounded-lg border bg-muted/30 px-4 py-2.5">
              <span className="text-xs font-medium text-muted-foreground">Legend:</span>
              <div className="flex items-center gap-1.5">
                <div className="h-3 w-3 rounded bg-mastery-expert/60" />
                <span className="text-xs text-muted-foreground">≥ 70% — Mastered</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="h-3 w-3 rounded bg-warning/60" />
                <span className="text-xs text-muted-foreground">50–69% — On Track</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="h-3 w-3 rounded bg-destructive/60" />
                <span className="text-xs text-muted-foreground">{"< 50%"} — Needs Attention</span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {mockTopics.map((topic) => {
                const m = topic.mastery || 0;
                const borderColor = m >= 70 ? "border-l-mastery-expert" : m >= 50 ? "border-l-mastery-developing" : "border-l-destructive";
                return (
                  <button
                    key={topic.id}
                    onClick={() => setExpandedTopic(expandedTopic === topic.name ? null : topic.name)}
                    className={`rounded-lg border border-l-4 ${borderColor} bg-card p-3 text-center transition-all cursor-pointer hover:bg-muted/50 h-20 flex flex-col items-center justify-center ${expandedTopic === topic.name ? "ring-2 ring-primary" : ""}`}
                  >
                    <p className="text-xs font-medium">{topic.name}</p>
                    <p className={`text-lg font-bold ${
                      m >= 70 ? "text-mastery-expert" : m >= 50 ? "text-mastery-developing" : "text-destructive"
                    }`}>{topic.mastery}%</p>
                  </button>
                );
              })}
            </div>
            {expandedTopic && topicInsights[expandedTopic] && (() => {
              const t = topicInsights[expandedTopic];
              const mastery = mockTopics.find(tp => tp.name === expandedTopic)?.mastery || 0;
              const total = t.beginner + t.developing + t.proficient + t.expert;
              const levelLabel = mastery >= 70 ? "Mastered" : mastery >= 50 ? "Developing" : "Needs Attention";
              const levelColor = mastery >= 70 ? "text-mastery-expert" : mastery >= 50 ? "text-mastery-developing" : "text-destructive";
              const levelBg = mastery >= 70 ? "bg-mastery-expert/10" : mastery >= 50 ? "bg-mastery-developing/10" : "bg-destructive/10";
              const notMastered = t.beginner + t.developing;
              return (
                <div className="rounded-lg border bg-muted/20 p-4 space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-semibold">{expandedTopic}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{mastery}% class mastery · {notMastered} of {total} students have not yet reached Proficient level</p>
                    </div>
                    <span className={`text-xs font-medium px-2 py-0.5 rounded ${levelBg} ${levelColor}`}>{levelLabel}</span>
                  </div>

                  <div className="grid grid-cols-4 gap-2">
                    <div className="rounded-lg bg-mastery-beginner/10 p-2.5 text-center">
                      <p className="text-lg font-bold text-mastery-beginner">{t.beginner}</p>
                      <p className="text-[10px] text-mastery-beginner/80">Beginner</p>
                    </div>
                    <div className="rounded-lg bg-mastery-developing/10 p-2.5 text-center">
                      <p className="text-lg font-bold text-mastery-developing">{t.developing}</p>
                      <p className="text-[10px] text-mastery-developing/80">Developing</p>
                    </div>
                    <div className="rounded-lg bg-mastery-proficient/10 p-2.5 text-center">
                      <p className="text-lg font-bold text-mastery-proficient">{t.proficient}</p>
                      <p className="text-[10px] text-mastery-proficient/80">Proficient</p>
                    </div>
                    <div className="rounded-lg bg-mastery-expert/10 p-2.5 text-center">
                      <p className="text-lg font-bold text-mastery-expert">{t.expert}</p>
                      <p className="text-[10px] text-mastery-expert/80">Expert</p>
                    </div>
                  </div>

                  <p className="text-sm text-foreground">{t.summary}</p>
                  <div className="flex items-start gap-2 rounded-lg border border-primary/20 bg-primary/5 px-3 py-2">
                    <TrendingUp className="h-3.5 w-3.5 text-primary mt-0.5 shrink-0" />
                    <p className="text-xs text-muted-foreground">{t.detail}</p>
                  </div>
                </div>
              );
            })()}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default CourseDashboard;
