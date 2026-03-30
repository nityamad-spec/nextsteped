import { useEffect, useState } from "react";
import { useApp } from "@/contexts/AppContext";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid } from "recharts";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { ClipboardCheck, Clock, Users, TrendingUp } from "lucide-react";
import { format } from "date-fns";

interface AssessmentResult {
  id: string;
  student_id: string;
  course_id: string | null;
  mode: string;
  quiz_day: number | null;
  score: number;
  total_questions: number;
  correct_answers: number;
  answers: any;
  time_spent: number;
  created_at: string;
}

interface TopicPerformance {
  topic: string;
  correct: number;
  incorrect: number;
  total: number;
  rate: number;
}

const AssessmentAnalytics = () => {
  const { currentCourse } = useApp();
  const [results, setResults] = useState<AssessmentResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [modeFilter, setModeFilter] = useState<string>("all");

  useEffect(() => {
    if (!currentCourse?.id) return;
    setLoading(true);
    supabase
      .from("assessment_results")
      .select("*")
      .eq("course_id", currentCourse.id)
      .order("created_at", { ascending: false })
      .then(({ data, error }) => {
        if (!error && data) setResults(data as AssessmentResult[]);
        setLoading(false);
      });
  }, [currentCourse?.id]);

  const filtered = modeFilter === "all" ? results : results.filter(r => r.mode === modeFilter);

  // Summary stats
  const totalAttempts = filtered.length;
  const avgScore = totalAttempts > 0 ? Math.round(filtered.reduce((s, r) => s + (r.total_questions > 0 ? (r.correct_answers / r.total_questions) * 100 : 0), 0) / totalAttempts) : 0;
  const avgTime = totalAttempts > 0 ? Math.round(filtered.reduce((s, r) => s + r.time_spent, 0) / totalAttempts) : 0;
  const examCount = results.filter(r => r.mode === "exam").length;
  const quizCount = results.filter(r => r.mode === "daily_quiz").length;

  // Score distribution
  const ranges = ["0-20%", "21-40%", "41-60%", "61-80%", "81-100%"];
  const distribution = ranges.map((label, i) => {
    const lo = i * 20;
    const hi = (i + 1) * 20;
    const count = filtered.filter(r => {
      const pct = r.total_questions > 0 ? (r.correct_answers / r.total_questions) * 100 : 0;
      return pct >= lo && (i === 4 ? pct <= hi : pct < hi);
    }).length;
    return { range: label, count };
  });

  // Topic performance from answers JSONB (supports new standardised format + legacy fallback)
  const topicMap = new Map<string, { correct: number; total: number }>();
  filtered.forEach(r => {
    if (Array.isArray(r.answers)) {
      (r.answers as any[]).forEach((a: any) => {
        const topic = a?.topic || "Unknown";
        const entry = topicMap.get(topic) || { correct: 0, total: 0 };
        entry.total++;
        if (a?.is_correct || a?.isCorrect) entry.correct++;
        topicMap.set(topic, entry);
      });
    }
    // Legacy flat-map format: skip topic aggregation (no topic info available)
  });
  const topicPerformance: TopicPerformance[] = Array.from(topicMap.entries())
    .map(([topic, { correct, total }]) => ({
      topic,
      correct,
      incorrect: total - correct,
      total,
      rate: total > 0 ? Math.round((correct / total) * 100) : 0,
    }))
    .sort((a, b) => b.total - a.total);

  const chartConfig = {
    count: { label: "Students", color: "hsl(var(--primary))" },
  };

  if (!currentCourse) {
    return (
      <div className="flex items-center justify-center p-12">
        <p className="text-muted-foreground">No course selected.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Assessment Analytics</h1>
          <p className="text-sm text-muted-foreground">{currentCourse.name}</p>
        </div>
        <Select value={modeFilter} onValueChange={setModeFilter}>
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Modes</SelectItem>
            <SelectItem value="exam">Exams</SelectItem>
            <SelectItem value="daily_quiz">Daily Quizzes</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {loading ? (
        <p className="text-muted-foreground">Loading analytics...</p>
      ) : totalAttempts === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <ClipboardCheck className="h-12 w-12 text-muted-foreground/40 mb-3" />
            <p className="text-muted-foreground">No assessment results yet.</p>
            <p className="text-xs text-muted-foreground">Results will appear here once students complete exams or quizzes.</p>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Summary Cards */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium">Total Attempts</CardTitle>
                <Users className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{totalAttempts}</div>
                <p className="text-xs text-muted-foreground">{examCount} exams · {quizCount} quizzes</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium">Average Score</CardTitle>
                <TrendingUp className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{avgScore}%</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium">Avg Time Spent</CardTitle>
                <Clock className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{Math.floor(avgTime / 60)}m {avgTime % 60}s</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium">Pass Rate</CardTitle>
                <ClipboardCheck className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {Math.round((filtered.filter(r => r.total_questions > 0 && (r.correct_answers / r.total_questions) >= 0.5).length / totalAttempts) * 100)}%
                </div>
                <p className="text-xs text-muted-foreground">≥ 50% correct</p>
              </CardContent>
            </Card>
          </div>

          {/* Score Distribution Chart */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Score Distribution</CardTitle>
            </CardHeader>
            <CardContent>
              <ChartContainer config={chartConfig} className="h-[250px] w-full">
                <BarChart data={distribution} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border/50" />
                  <XAxis dataKey="range" className="text-xs" />
                  <YAxis allowDecimals={false} className="text-xs" />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Bar dataKey="count" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ChartContainer>
            </CardContent>
          </Card>

          {/* Topic Performance */}
          {topicPerformance.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Topic Performance</CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Topic</TableHead>
                      <TableHead className="text-right">Correct</TableHead>
                      <TableHead className="text-right">Incorrect</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                      <TableHead className="text-right">Accuracy</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {topicPerformance.map(t => (
                      <TableRow key={t.topic}>
                        <TableCell className="font-medium">{t.topic}</TableCell>
                        <TableCell className="text-right">{t.correct}</TableCell>
                        <TableCell className="text-right">{t.incorrect}</TableCell>
                        <TableCell className="text-right">{t.total}</TableCell>
                        <TableCell className="text-right">
                          <Badge variant={t.rate >= 70 ? "default" : t.rate >= 40 ? "secondary" : "destructive"}>
                            {t.rate}%
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}

          {/* Recent Results */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Recent Submissions</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Mode</TableHead>
                    <TableHead className="text-right">Score</TableHead>
                    <TableHead className="text-right">Correct</TableHead>
                    <TableHead className="text-right">Time</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.slice(0, 20).map(r => (
                    <TableRow key={r.id}>
                      <TableCell className="text-sm">{format(new Date(r.created_at), "MMM d, yyyy HH:mm")}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{r.mode === "daily_quiz" ? `Quiz Day ${r.quiz_day}` : "Exam"}</Badge>
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        {r.total_questions > 0 ? Math.round((r.correct_answers / r.total_questions) * 100) : 0}%
                      </TableCell>
                      <TableCell className="text-right">{r.correct_answers}/{r.total_questions}</TableCell>
                      <TableCell className="text-right">{Math.floor(r.time_spent / 60)}m {r.time_spent % 60}s</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
};

export default AssessmentAnalytics;
