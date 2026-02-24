import { useState } from "react";
import { mockDashboard, mockTopics } from "@/data/mockData";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Users, MessageSquare, AlertTriangle, TrendingUp, BarChart3 } from "lucide-react";

const masteryColors: Record<string, string> = {
  Beginner: "bg-destructive/20 text-destructive",
  Developing: "bg-warning/20 text-warning",
  Proficient: "bg-primary/20 text-primary",
  Expert: "bg-success/20 text-success",
};

const masteryBarColors: Record<string, string> = {
  Beginner: "[&>div]:bg-destructive",
  Developing: "[&>div]:bg-warning",
  Proficient: "[&>div]:bg-primary",
  Expert: "[&>div]:bg-success",
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

const CourseDashboard = () => {
  const d = mockDashboard;
  const [expandedTopic, setExpandedTopic] = useState<string | null>(null);

  return (
    <div className="p-6">
      <div className="mb-8">
        <h1 className="font-heading text-3xl font-bold">Course Dashboard</h1>
        <p className="text-muted-foreground">Operating Systems — Command Center</p>
      </div>

      {/* Stats row — Avg Mastery is now 2nd */}
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
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-success/10 text-success">
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
              <p className="text-[10px] text-muted-foreground/70">AI TA chat sessions initiated by students</p>
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

        <Card>
          <CardHeader>
            <CardTitle>Concept Mastery Heatmap</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Legend */}
            <div className="flex flex-wrap items-center gap-4 rounded-lg border bg-muted/30 px-4 py-2.5">
              <span className="text-xs font-medium text-muted-foreground">Legend:</span>
              <div className="flex items-center gap-1.5">
                <div className="h-3 w-3 rounded bg-success/60" />
                <span className="text-xs text-muted-foreground">≥ 70% — Mastered</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="h-3 w-3 rounded bg-warning/60" />
                <span className="text-xs text-muted-foreground">50–69% — Developing</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="h-3 w-3 rounded bg-destructive/60" />
                <span className="text-xs text-muted-foreground">{"< 50%"} — Needs Attention</span>
              </div>
            </div>

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

export default CourseDashboard;
