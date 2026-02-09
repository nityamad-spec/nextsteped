import { mockDashboard, mockTopics } from "@/data/mockData";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Users, TrendingUp, TrendingDown, Clock, BookOpen, MessageSquare, BarChart3, AlertTriangle, Activity } from "lucide-react";

const mockStudentRows = [
  { name: "Alice Chen", mastery: 88, sessions: 24, lastActive: "2 hours ago", status: "On Track", streak: 7 },
  { name: "Bob Martinez", mastery: 72, sessions: 18, lastActive: "1 day ago", status: "On Track", streak: 3 },
  { name: "Carol Davis", mastery: 45, sessions: 8, lastActive: "3 days ago", status: "At Risk", streak: 0 },
  { name: "David Kim", mastery: 91, sessions: 31, lastActive: "5 hours ago", status: "On Track", streak: 12 },
  { name: "Eva Johnson", mastery: 38, sessions: 5, lastActive: "5 days ago", status: "At Risk", streak: 0 },
  { name: "Frank Li", mastery: 67, sessions: 15, lastActive: "1 day ago", status: "On Track", streak: 2 },
  { name: "Grace Park", mastery: 54, sessions: 11, lastActive: "2 days ago", status: "Needs Attention", streak: 1 },
  { name: "Henry Wang", mastery: 82, sessions: 22, lastActive: "3 hours ago", status: "On Track", streak: 5 },
];

const weeklyEngagement = [
  { week: "Week 1", active: 45, sessions: 89 },
  { week: "Week 2", active: 44, sessions: 102 },
  { week: "Week 3", active: 42, sessions: 95 },
  { week: "Week 4", active: 40, sessions: 78 },
  { week: "Week 5", active: 43, sessions: 112 },
  { week: "Week 6", active: 41, sessions: 98 },
];

const topQuestionTopics = [
  { topic: "Virtual Memory", questions: 87, avgCorrect: 42 },
  { topic: "Deadlocks", questions: 74, avgCorrect: 38 },
  { topic: "Synchronization", questions: 65, avgCorrect: 51 },
  { topic: "Page Replacement", questions: 58, avgCorrect: 45 },
  { topic: "CPU Scheduling", questions: 52, avgCorrect: 72 },
];

const StudentInsights = () => {
  const d = mockDashboard;

  return (
    <div className="p-6">
      <div className="mb-8">
        <h1 className="font-heading text-3xl font-bold">Student Insights</h1>
        <p className="text-muted-foreground">Understand class performance, engagement, and where to adjust your teaching</p>
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
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-destructive/10 text-destructive">
              <AlertTriangle className="h-5 w-5" />
            </div>
            <div>
              <p className="text-2xl font-bold">{d.atRiskCount}</p>
              <p className="text-xs text-muted-foreground">At-Risk Students</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="space-y-6">
        {/* Weekly Engagement Trend */}
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

        {/* Topic Performance */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><BookOpen className="h-5 w-5" /> Topic Performance</CardTitle>
            <CardDescription>Which topics students struggle with most — consider adjusting depth or adding resources</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {topQuestionTopics.map((t) => (
                <div key={t.topic} className="flex items-center gap-4 rounded-lg border p-3">
                  <div className="flex-1">
                    <p className="text-sm font-medium">{t.topic}</p>
                    <p className="text-xs text-muted-foreground">{t.questions} questions asked</p>
                  </div>
                  <div className="text-right">
                    <p className={`text-lg font-bold ${t.avgCorrect >= 60 ? "text-success" : t.avgCorrect >= 45 ? "text-warning" : "text-destructive"}`}>{t.avgCorrect}%</p>
                    <p className="text-xs text-muted-foreground">avg correct</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Concept Mastery Heatmap */}
        <Card>
          <CardHeader>
            <CardTitle>Concept Mastery Heatmap</CardTitle>
            <CardDescription>Class-wide mastery per topic — low mastery areas may need syllabus adjustment</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {mockTopics.map((topic) => (
                <div key={topic.id} className={`rounded-lg p-3 text-center ${
                  (topic.mastery || 0) >= 70 ? "bg-success/10" : (topic.mastery || 0) >= 50 ? "bg-warning/10" : "bg-destructive/10"
                }`}>
                  <p className="text-xs font-medium">{topic.name}</p>
                  <p className={`text-lg font-bold ${
                    (topic.mastery || 0) >= 70 ? "text-success" : (topic.mastery || 0) >= 50 ? "text-warning" : "text-destructive"
                  }`}>{topic.mastery}%</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Student Roster */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Users className="h-5 w-5" /> Student Roster</CardTitle>
            <CardDescription>Individual student performance at a glance</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {mockStudentRows.map((s) => (
                <div key={s.name} className="flex items-center gap-4 rounded-lg border p-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-muted text-xs font-bold">
                    {s.name.split(" ").map(n => n[0]).join("")}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{s.name}</p>
                    <p className="text-xs text-muted-foreground">{s.lastActive}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="text-right hidden sm:block">
                      <p className="text-sm font-bold">{s.mastery}%</p>
                      <p className="text-xs text-muted-foreground">{s.sessions} sessions</p>
                    </div>
                    <Badge variant={s.status === "At Risk" ? "destructive" : s.status === "Needs Attention" ? "secondary" : "outline"} className="text-xs">
                      {s.status}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default StudentInsights;
