import { mockDashboard, mockTopics } from "@/data/mockData";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Users, MessageSquare, AlertTriangle, TrendingUp, Send, BookOpen, BarChart3 } from "lucide-react";

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

const CourseDashboard = () => {
  const d = mockDashboard;

  return (
    <div className="p-6">
      <div className="mb-8">
        <h1 className="font-heading text-3xl font-bold">Course Dashboard</h1>
        <p className="text-muted-foreground">Operating Systems — Command Center</p>
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
              <p className="text-xs text-muted-foreground">At-Risk Learners</p>
              <Badge variant="secondary" className="text-[10px] mt-1">In Progress</Badge>
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
            </div>
          </CardContent>
        </Card>
      </div>

      {/* All sections stacked as rows */}
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

        <Card>
          <CardHeader>
            <CardTitle>Top Misunderstood Concepts</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {d.topMisunderstood.map((concept, i) => (
                <div key={concept} className="flex items-center gap-2 rounded-lg bg-muted/50 px-3 py-2 text-sm">
                  <span className="font-mono text-xs text-muted-foreground">{i + 1}.</span>
                  <span>{concept}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Quick Actions</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm">
              <Send className="mr-2 h-4 w-4" /> Broadcast Message
            </Button>
            <Button variant="outline" size="sm">
              <BookOpen className="mr-2 h-4 w-4" /> Push Practice Set
            </Button>
            <Button variant="outline" size="sm">
              <MessageSquare className="mr-2 h-4 w-4" /> Add Concept Note
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default CourseDashboard;
