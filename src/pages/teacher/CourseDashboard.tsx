import { useState, useEffect } from "react";
import { useApp } from "@/contexts/AppContext";
import { useTeacherCourseId } from "@/hooks/useTeacherCourseId";
import { useTASettings } from "@/hooks/useTASettings";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Users, MessageSquare, AlertTriangle, TrendingUp, BarChart3, ArrowUp, ArrowDown, Minus, Shield, ChevronDown, Sparkles } from "lucide-react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";
import CourseCollaborators from "@/components/CourseCollaborators";

/* ── Concept Mastery Map categories ── */
const conceptMasteryMock = [
  { concept: "Variables & Types", touched: 32, deeplyExplored: 18, notExplored: 5 },
  { concept: "Control Flow", touched: 28, deeplyExplored: 22, notExplored: 5 },
  { concept: "Functions", touched: 20, deeplyExplored: 10, notExplored: 25 },
  { concept: "Lists & Dicts", touched: 15, deeplyExplored: 5, notExplored: 35 },
  { concept: "File Handling", touched: 8, deeplyExplored: 2, notExplored: 45 },
  { concept: "OOP Basics", touched: 5, deeplyExplored: 1, notExplored: 49 },
  { concept: "Error Handling", touched: 12, deeplyExplored: 4, notExplored: 39 },
  { concept: "Modules", touched: 10, deeplyExplored: 3, notExplored: 42 },
];

const aiInsightsMock = [
  "Consider dedicating extra time to **Functions** — most students have only touched this concept without deep exploration.",
  "**Variables & Types** is well-explored. You can reference this as a foundation when introducing more advanced topics.",
  "**File Handling** and **OOP Basics** have the highest 'Not Explored' rates. A targeted lab session could help accelerate engagement.",
  "Students who deeply explored **Control Flow** tend to also explore **Functions** — consider linking these topics in your teaching.",
];

const weeklyData = [
  { week: "Week 1", active: 45, sessions: 89, up: 0, down: 0, stayed: 45, beginner: 20, progressing: 15, proficient: 8, expert: 2, insight: "" },
  { week: "Week 2", active: 44, sessions: 102, up: 3, down: 1, stayed: 40, beginner: 17, progressing: 16, proficient: 9, expert: 2, insight: "3 students moved up — early momentum is building." },
  { week: "Week 3", active: 42, sessions: 95, up: 4, down: 2, stayed: 36, beginner: 14, progressing: 15, proficient: 10, expert: 3, insight: "2 students dropped a level. Consider reviewing Week 3 material." },
];

const masteryTimelineData = weeklyData.map((w) => {
  const total = w.beginner + w.progressing + w.proficient + w.expert;
  return {
    week: w.week,
    avgMastery: total > 0 ? Math.round(((w.proficient * 70 + w.expert * 90 + w.progressing * 45 + w.beginner * 20) / total)) : 0,
    proficientPct: total > 0 ? Math.round(((w.proficient + w.expert) / total) * 100) : 0,
    beginnerPct: total > 0 ? Math.round((w.beginner / total) * 100) : 0,
  };
});

const CourseDashboard = () => {
  const [expandedWeek, setExpandedWeek] = useState<string | null>(null);
  const { currentCourse } = useApp();
  const courseId = useTeacherCourseId();
  const { taSettings } = useTASettings(courseId);
  const courseSections = currentCourse?.sections || [];
  const [selectedSection, setSelectedSection] = useState<string>("all");

  // Course progress (mock: based on 3-day workshop)
  const totalDays = 3;
  const currentDay = 2;
  const progressPct = Math.round((currentDay / totalDays) * 100);

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

      {/* Course Progress */}
      <Card className="mb-6">
        <CardContent className="p-4">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm font-medium">Course Progress</p>
            <span className="text-sm text-muted-foreground">Day {currentDay} of {totalDays}</span>
          </div>
          <Progress value={progressPct} className="h-3" />
        </CardContent>
      </Card>

      {/* Stats row */}
      <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Users className="h-5 w-5" />
            </div>
            <div>
              <p className="text-2xl font-bold">45</p>
              <p className="text-xs text-muted-foreground">Active Students</p>
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
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent/10 text-accent">
              <MessageSquare className="h-5 w-5" />
            </div>
            <div>
              <p className="text-2xl font-bold">312</p>
              <p className="text-xs text-muted-foreground">Total Sessions</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="space-y-6">
        {/* Concept Mastery Map */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><BarChart3 className="h-5 w-5" /> Concept Mastery Map</CardTitle>
            <CardDescription>Aggregate anonymous view — based on chat interactions</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap items-center gap-4 rounded-lg border bg-muted/30 px-4 py-2.5">
              <span className="text-xs font-medium text-muted-foreground">Legend:</span>
              <div className="flex items-center gap-1.5">
                <div className="h-3 w-3 rounded bg-primary" />
                <span className="text-xs text-muted-foreground">Deeply Explored</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="h-3 w-3 rounded bg-primary/40" />
                <span className="text-xs text-muted-foreground">Touched</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="h-3 w-3 rounded bg-muted" />
                <span className="text-xs text-muted-foreground">Not Explored</span>
              </div>
            </div>

            {conceptMasteryMock.map((c) => {
              const total = c.touched + c.deeplyExplored + c.notExplored;
              const touchedPct = Math.round((c.touched / total) * 100);
              const deepPct = Math.round((c.deeplyExplored / total) * 100);
              const notPct = Math.round((c.notExplored / total) * 100);
              return (
                <div key={c.concept} className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">{c.concept}</span>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground">
                      <span>{c.deeplyExplored} deep</span>
                      <span>{c.touched} touched</span>
                      <span>{c.notExplored} unexplored</span>
                    </div>
                  </div>
                  <div className="flex h-3 w-full overflow-hidden rounded-full bg-muted">
                    <div className="bg-primary transition-all" style={{ width: `${deepPct}%` }} />
                    <div className="bg-primary/40 transition-all" style={{ width: `${touchedPct}%` }} />
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>

        {/* AI-Generated Insights */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Sparkles className="h-5 w-5 text-primary" /> AI-Generated Insights</CardTitle>
            <CardDescription>Suggestions to enhance learning based on student engagement patterns</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {aiInsightsMock.map((insight, i) => (
              <div key={i} className="flex items-start gap-3 rounded-lg border border-primary/20 bg-primary/5 px-4 py-3">
                <Sparkles className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                <p className="text-sm text-muted-foreground" dangerouslySetInnerHTML={{
                  __html: insight.replace(/\*\*(.*?)\*\*/g, '<strong class="text-foreground">$1</strong>')
                }} />
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Weekly Engagement */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><BarChart3 className="h-5 w-5" /> Weekly Engagement</CardTitle>
            <CardDescription>Click a week to see mastery level breakdown and AI-generated insights</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
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

                    {isExpanded && (
                      <div className="border-t px-4 py-3 space-y-3">
                        <div>
                          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">Mastery Level Distribution</p>
                          <div className="grid grid-cols-4 gap-2">
                            <div className="rounded-lg bg-mastery-beginner/10 p-2.5 text-center">
                              <p className="text-lg font-bold text-mastery-beginner">{w.beginner}</p>
                              <p className="text-[10px] text-mastery-beginner/80">Beginner</p>
                            </div>
                            <div className="rounded-lg bg-mastery-progressing/10 p-2.5 text-center">
                              <p className="text-lg font-bold text-mastery-progressing">{w.progressing}</p>
                              <p className="text-[10px] text-mastery-progressing/80">Progressing</p>
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

        {/* Mastery Timeline Graph */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><TrendingUp className="h-5 w-5" /> Mastery Improvement Over Time</CardTitle>
            <CardDescription>Tracking average mastery and proficiency rates across weeks</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[280px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={masteryTimelineData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="week" className="text-xs" tick={{ fontSize: 11 }} />
                  <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} tickFormatter={(v) => `${v}%`} />
                  <Tooltip
                    contentStyle={{ borderRadius: "8px", border: "1px solid hsl(var(--border))", background: "hsl(var(--card))" }}
                    formatter={(value: number, name: string) => [`${value}%`, name === "avgMastery" ? "Avg Mastery" : name === "proficientPct" ? "Proficient+" : "Beginner"]}
                  />
                  <Legend formatter={(value) => value === "avgMastery" ? "Avg Mastery" : value === "proficientPct" ? "Proficient & Above" : "Beginner"} />
                  <Line type="monotone" dataKey="avgMastery" stroke="hsl(var(--primary))" strokeWidth={2.5} dot={{ r: 4 }} />
                  <Line type="monotone" dataKey="proficientPct" stroke="hsl(142 76% 36%)" strokeWidth={2} dot={{ r: 3 }} />
                  <Line type="monotone" dataKey="beginnerPct" stroke="hsl(var(--destructive))" strokeWidth={2} strokeDasharray="5 5" dot={{ r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Collaborators */}
        <CourseCollaborators />
      </div>
    </div>
  );
};

export default CourseDashboard;
