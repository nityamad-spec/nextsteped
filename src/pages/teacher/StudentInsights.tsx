import { useState } from "react";
import { mockDashboard, mockTopics } from "@/data/mockData";
import { useApp } from "@/contexts/AppContext";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Users, TrendingUp, Clock, BarChart3, AlertTriangle, Activity, ArrowUp, ArrowDown } from "lucide-react";

const weeklyEngagement = [
  { week: "Week 1", active: 45, sessions: 89 },
  { week: "Week 2", active: 44, sessions: 102 },
  { week: "Week 3", active: 42, sessions: 95 },
  { week: "Week 4", active: 40, sessions: 78 },
  { week: "Week 5", active: 43, sessions: 112 },
  { week: "Week 6", active: 41, sessions: 98 },
];

const masteryMovement = [
  { period: "Week 3 → 4", up: 5, down: 1, stayed: 41 },
  { period: "Week 4 → 5", up: 7, down: 1, stayed: 39 },
  { period: "Week 5 → 6", up: 3, down: 1, stayed: 43 },
];

const levelColors: Record<string, string> = {
  Beginner: "bg-destructive/10 text-destructive",
  Developing: "bg-warning/10 text-warning",
  Proficient: "bg-primary/10 text-primary",
  Expert: "bg-success/10 text-success",
};

const topicDetails: Record<string, { correct: number; wrong: number; total: number }> = {
  "Process Management": { correct: 142, wrong: 28, total: 170 },
  "CPU Scheduling": { correct: 98, wrong: 32, total: 130 },
  "Memory Management": { correct: 67, wrong: 48, total: 115 },
  "Virtual Memory": { correct: 45, wrong: 62, total: 107 },
  "File Systems": { correct: 58, wrong: 42, total: 100 },
  "Synchronization": { correct: 33, wrong: 54, total: 87 },
  "Deadlocks": { correct: 25, wrong: 58, total: 83 },
  "I/O Systems": { correct: 48, wrong: 39, total: 87 },
};

const StudentInsights = () => {
  const d = mockDashboard;
  const [expandedTopic, setExpandedTopic] = useState<string | null>(null);
  const { currentCourse } = useApp();
  const courseSections = currentCourse?.sections || [];
  const [selectedSection, setSelectedSection] = useState<string>("all");

  return (
    <div className="p-6">
      <div className="mb-8">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <h1 className="font-heading text-3xl font-bold">Student Insights</h1>
            <p className="text-muted-foreground">Understand class performance, engagement, and where to adjust your teaching</p>
          </div>
          {courseSections.length > 1 && (
            <Select value={selectedSection} onValueChange={setSelectedSection}>
              <SelectTrigger className="w-[180px]"><SelectValue placeholder="All Sections" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Sections</SelectItem>
                {courseSections.map((s) => (
                  <SelectItem key={s} value={s}>{s}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
        <div className="mt-2 flex items-center gap-2 rounded-lg border border-primary/20 bg-primary/5 px-3 py-2">
          <Users className="h-4 w-4 text-primary shrink-0" />
          <p className="text-xs text-muted-foreground">All student data is anonymized to protect privacy and encourage authentic engagement with the AI TA.</p>
        </div>
      </div>

      {/* Overview Stats */}
      <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Users className="h-5 w-5" />
            </div>
            <div>
              <p className="text-2xl font-bold">{d.activeStudents}</p>
              <p className="text-xs text-muted-foreground">Active Students</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-success/10 text-success">
              <TrendingUp className="h-5 w-5" />
            </div>
            <div>
              <p className="text-2xl font-bold">72%</p>
              <p className="text-xs text-muted-foreground">Class Avg Mastery</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent/10 text-accent">
              <Activity className="h-5 w-5" />
            </div>
            <div>
              <p className="text-2xl font-bold">6.6</p>
              <p className="text-xs text-muted-foreground">Avg Sessions/Student</p>
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
              <p className="text-xs text-muted-foreground">At-Risk Students</p>
              <Badge variant="secondary" className="text-[10px] mt-1">In Progress</Badge>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="space-y-6">
        {/* Weekly Engagement */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><BarChart3 className="h-5 w-5" /> Weekly Engagement</CardTitle>
            <CardDescription>Track how student activity changes over time</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {weeklyEngagement.map((w) => (
                <div key={w.week} className="flex items-center gap-4">
                  <span className="w-16 text-sm text-muted-foreground">{w.week}</span>
                  <div className="flex-1">
                    <Progress value={(w.sessions / 120) * 100} className="h-3" />
                  </div>
                  <div className="flex gap-4 text-xs text-muted-foreground">
                    <span>{w.active} active</span>
                    <span>{w.sessions} sessions</span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Simplified Mastery Level Movement */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Activity className="h-5 w-5" /> Mastery Level Movement</CardTitle>
            <CardDescription>Classroom-level trends — how many students moved up, down, or stayed at their mastery level each week</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {masteryMovement.map((period) => (
                <div key={period.period} className="flex items-center gap-4 rounded-lg border p-4">
                  <span className="text-sm font-medium w-24 shrink-0">{period.period}</span>
                  <div className="flex flex-1 gap-4">
                    <div className="flex items-center gap-1.5">
                      <ArrowUp className="h-4 w-4 text-success" />
                      <span className="text-sm font-bold text-success">{period.up}</span>
                      <span className="text-xs text-muted-foreground">moved up</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <ArrowDown className="h-4 w-4 text-destructive" />
                      <span className="text-sm font-bold text-destructive">{period.down}</span>
                      <span className="text-xs text-muted-foreground">moved down</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm font-bold text-muted-foreground">{period.stayed}</span>
                      <span className="text-xs text-muted-foreground">stayed</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Concept Mastery Heatmap with click-to-detail */}
        <Card>
          <CardHeader>
            <CardTitle>Concept Mastery Heatmap</CardTitle>
            <CardDescription>Class-wide mastery per topic — click a topic for question breakdown</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {mockTopics.map((topic) => (
                <button
                  key={topic.id}
                  onClick={() => setExpandedTopic(expandedTopic === topic.name ? null : topic.name)}
                  className={`rounded-lg p-3 text-center transition-all cursor-pointer ${
                    (topic.mastery || 0) >= 70 ? "bg-success/10 hover:bg-success/20" : (topic.mastery || 0) >= 50 ? "bg-warning/10 hover:bg-warning/20" : "bg-destructive/10 hover:bg-destructive/20"
                  } ${expandedTopic === topic.name ? "ring-2 ring-primary" : ""}`}
                >
                  <p className="text-xs font-medium">{topic.name}</p>
                  <p className={`text-lg font-bold ${
                    (topic.mastery || 0) >= 70 ? "text-success" : (topic.mastery || 0) >= 50 ? "text-warning" : "text-destructive"
                  }`}>{topic.mastery}%</p>
                </button>
              ))}
            </div>
            {expandedTopic && topicDetails[expandedTopic] && (
              <div className="rounded-lg border bg-muted/30 p-4 space-y-2">
                <p className="text-sm font-medium">{expandedTopic} — Question Breakdown</p>
                <div className="grid grid-cols-3 gap-4 text-center">
                  <div>
                    <p className="text-lg font-bold">{topicDetails[expandedTopic].total}</p>
                    <p className="text-xs text-muted-foreground">Total Questions</p>
                  </div>
                  <div>
                    <p className="text-lg font-bold text-success">{topicDetails[expandedTopic].correct}</p>
                    <p className="text-xs text-muted-foreground">Answered Correctly</p>
                  </div>
                  <div>
                    <p className="text-lg font-bold text-destructive">{topicDetails[expandedTopic].wrong}</p>
                    <p className="text-xs text-muted-foreground">Answered Wrong</p>
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default StudentInsights;
