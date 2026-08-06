// @ts-nocheck
import { useEffect, useState, useMemo } from "react";
import { useApp } from "@/contexts/AppContext";
import { useAuth } from "@/contexts/AuthContext";
import { useTeacherCourseId } from "@/hooks/useTeacherCourseId";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid } from "recharts";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { ClipboardCheck, Clock, Users, TrendingUp, ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react";
import { format } from "date-fns";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

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
  learner_level?: string;
}

interface TopicPerformance {
  topic: string;
  correct: number;
  incorrect: number;
  total: number;
  rate: number;
}

type SortDir = "asc" | "desc";
interface SortState {
  column: string;
  direction: SortDir;
}

const toggleSort = (prev: SortState | null, col: string): SortState => {
  if (prev?.column === col) {
    return { column: col, direction: prev.direction === "asc" ? "desc" : "asc" };
  }
  return { column: col, direction: "asc" };
};

const SortIcon = ({ active, direction }: { active: boolean; direction?: SortDir }) => {
  if (!active) return <ArrowUpDown className="ml-1 h-3 w-3 inline opacity-40" />;
  return direction === "asc" ? (
    <ArrowUp className="ml-1 h-3 w-3 inline" />
  ) : (
    <ArrowDown className="ml-1 h-3 w-3 inline" />
  );
};

const AssessmentAnalytics = () => {
  const { currentCourse } = useApp();
  const courseId = useTeacherCourseId();
  const { user } = useAuth();
  const [assessmentResults, setAssessmentResults] = useState<AssessmentResult[]>([]);
  const [diagnosticResults, setDiagnosticResults] = useState<AssessmentResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [modeFilter, setModeFilter] = useState<string>("all");
  const [dateFrom, setDateFrom] = useState<string>("");
  const [dateTo, setDateTo] = useState<string>("");
  const [branchFilter, setBranchFilter] = useState<string>("all");
  const [branches, setBranches] = useState<{ id: string; name: string }[]>([]);
  const [studentBranches, setStudentBranches] = useState<Map<string, string>>(new Map());
  const [topicSort, setTopicSort] = useState<SortState | null>(null);
  const [recentSort, setRecentSort] = useState<SortState | null>(null);

  // Fetch assessment_results
  useEffect(() => {
    if (!currentCourse?.id) return;
    setLoading(true);
    supabase
      .from("assessment_results")
      .select("*")
      .eq("course_id", currentCourse.id)
      .order("created_at", { ascending: false })
      .then(({ data, error }) => {
        if (!error && data) setAssessmentResults(data as AssessmentResult[]);
        setLoading(false);
      });
  }, [currentCourse?.id]);

  // Fetch diagnostic_results
  useEffect(() => {
    if (!currentCourse?.id) return;
    supabase
      .from("diagnostic_results")
      .select("*")
      .eq("course_id", currentCourse.id)
      .order("created_at", { ascending: false })
      .then(({ data, error }) => {
        if (!error && data) {
          const normalized: AssessmentResult[] = (data as any[]).map((d) => {
            let timeSpent = 0;
            if (Array.isArray(d.question_times)) {
              timeSpent = Math.round(
                (d.question_times as number[]).reduce((s: number, t: number) => s + (t || 0), 0) / 1000
              );
            }
            return {
              id: d.id,
              student_id: d.student_id,
              course_id: d.course_id,
              mode: "diagnostic",
              quiz_day: null,
              score: d.score,
              total_questions: d.total_questions,
              correct_answers: d.score,
              answers: d.answers,
              time_spent: timeSpent,
              created_at: d.created_at,
              learner_level: d.learner_level,
            };
          });
          setDiagnosticResults(normalized);
        }
      });
  }, [currentCourse?.id]);

  // Fetch branches + student-branch mapping
  useEffect(() => {
    if (!currentCourse?.id) return;
    supabase
      .from("branches")
      .select("id, name")
      .then(({ data }) => {
        if (data) setBranches(data);
      });

    supabase
      .from("enrollments")
      .select("student_id, profiles(branch_id)")
      .eq("course_id", currentCourse.id)
      .then(({ data }) => {
        if (data) {
          const map = new Map<string, string>();
          (data as any[]).forEach((e) => {
            const branchId = e.profiles?.branch_id;
            if (branchId) map.set(e.student_id, branchId);
          });
          setStudentBranches(map);
        }
      });
  }, [currentCourse?.id]);

  // Combine & filter
  const allResults = [...assessmentResults, ...diagnosticResults];

  const filtered = useMemo(() => {
    let results =
      modeFilter === "all"
        ? allResults
        : modeFilter === "diagnostic"
          ? diagnosticResults
          : assessmentResults.filter((r) => r.mode === modeFilter);

    if (dateFrom) {
      results = results.filter((r) => r.created_at >= dateFrom);
    }
    if (dateTo) {
      const endOfDay = dateTo + "T23:59:59.999Z";
      results = results.filter((r) => r.created_at <= endOfDay);
    }
    if (branchFilter !== "all") {
      results = results.filter((r) => studentBranches.get(r.student_id) === branchFilter);
    }
    return results;
  }, [allResults, modeFilter, dateFrom, dateTo, branchFilter, studentBranches, assessmentResults, diagnosticResults]);

  // Summary stats
  const totalAttempts = filtered.length;
  const avgScore =
    totalAttempts > 0
      ? Math.round(
          filtered.reduce(
            (s, r) => s + (r.total_questions > 0 ? (r.correct_answers / r.total_questions) * 100 : 0),
            0
          ) / totalAttempts
        )
      : 0;
  const avgTime =
    totalAttempts > 0 ? Math.round(filtered.reduce((s, r) => s + r.time_spent, 0) / totalAttempts) : 0;
  const examCount = allResults.filter((r) => r.mode === "exam").length;
  const quizCount = allResults.filter((r) => r.mode === "daily_quiz").length;
  const diagCount = diagnosticResults.length;

  // Score distribution
  const ranges = ["0-20%", "21-40%", "41-60%", "61-80%", "81-100%"];
  const distribution = ranges.map((label, i) => {
    const lo = i * 20;
    const hi = (i + 1) * 20;
    const count = filtered.filter((r) => {
      const pct = r.total_questions > 0 ? (r.correct_answers / r.total_questions) * 100 : 0;
      return pct >= lo && (i === 4 ? pct <= hi : pct < hi);
    }).length;
    return { range: label, count };
  });

  // Topic performance
  const topicMap = new Map<string, { correct: number; total: number }>();
  filtered.forEach((r) => {
    if (Array.isArray(r.answers)) {
      (r.answers as any[]).forEach((a: any) => {
        const topic = a?.topic || "Unknown";
        const entry = topicMap.get(topic) || { correct: 0, total: 0 };
        entry.total++;
        if (a?.is_correct || a?.isCorrect) entry.correct++;
        topicMap.set(topic, entry);
      });
    }
  });

  const topicPerformance: TopicPerformance[] = useMemo(() => {
    const items = Array.from(topicMap.entries())
      .map(([topic, { correct, total }]) => ({
        topic,
        correct,
        incorrect: total - correct,
        total,
        rate: total > 0 ? Math.round((correct / total) * 100) : 0,
      }));

    if (topicSort) {
      const dir = topicSort.direction === "asc" ? 1 : -1;
      items.sort((a, b) => {
        const aVal = a[topicSort.column as keyof TopicPerformance];
        const bVal = b[topicSort.column as keyof TopicPerformance];
        if (typeof aVal === "string") return aVal.localeCompare(bVal as string) * dir;
        return ((aVal as number) - (bVal as number)) * dir;
      });
    } else {
      items.sort((a, b) => b.total - a.total);
    }
    return items;
  }, [topicMap, topicSort]);

  // Recent submissions sorted
  const recentSubmissions = useMemo(() => {
    const items = [...filtered];
    if (recentSort) {
      const dir = recentSort.direction === "asc" ? 1 : -1;
      items.sort((a, b) => {
        switch (recentSort.column) {
          case "date":
            return (new Date(a.created_at).getTime() - new Date(b.created_at).getTime()) * dir;
          case "score": {
            const aP = a.total_questions > 0 ? a.correct_answers / a.total_questions : 0;
            const bP = b.total_questions > 0 ? b.correct_answers / b.total_questions : 0;
            return (aP - bP) * dir;
          }
          case "correct":
            return (a.correct_answers - b.correct_answers) * dir;
          case "time":
            return (a.time_spent - b.time_spent) * dir;
          default:
            return 0;
        }
      });
    } else {
      items.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    }
    return items.slice(0, 20);
  }, [filtered, recentSort]);

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
      <div>
        <h1 className="text-2xl font-bold">Assessment Analytics</h1>
        <p className="text-sm text-muted-foreground">{currentCourse.name}</p>
      </div>

      <Tabs defaultValue="primary" className="space-y-6">
        <TabsList>
          <TabsTrigger value="primary">Primary questions</TabsTrigger>
        </TabsList>

        <TabsContent value="primary" className="space-y-6">
          {/* Filter Bar */}
          <div className="flex flex-wrap items-end gap-4">
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Mode</Label>
          <Select value={modeFilter} onValueChange={setModeFilter}>
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Modes</SelectItem>
              <SelectItem value="exam">Exams</SelectItem>
              <SelectItem value="daily_quiz">Weekly Quizzes</SelectItem>
              <SelectItem value="diagnostic">Diagnostic Tests</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">From</Label>
          <Input
            type="date"
            className="w-40"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">To</Label>
          <Input
            type="date"
            className="w-40"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
          />
        </div>
        {branches.length > 0 && (
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Branch</Label>
            <Select value={branchFilter} onValueChange={setBranchFilter}>
              <SelectTrigger className="w-44">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Branches</SelectItem>
                {branches.map((b) => (
                  <SelectItem key={b.id} value={b.id}>
                    {b.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>

      {loading ? (
        <p className="text-muted-foreground">Loading analytics...</p>
      ) : totalAttempts === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <ClipboardCheck className="h-12 w-12 text-muted-foreground/40 mb-3" />
            <p className="text-muted-foreground">No assessment results yet.</p>
            <p className="text-xs text-muted-foreground">
              Results will appear here once students complete exams, quizzes, or diagnostics.
            </p>
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
                <p className="text-xs text-muted-foreground">
                  {examCount} exams · {quizCount} quizzes · {diagCount} diagnostics
                </p>
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
                <div className="text-2xl font-bold">
                  {Math.floor(avgTime / 60)}m {avgTime % 60}s
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium">Pass Rate</CardTitle>
                <ClipboardCheck className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {Math.round(
                    (filtered.filter(
                      (r) => r.total_questions > 0 && r.correct_answers / r.total_questions >= 0.5
                    ).length /
                      totalAttempts) *
                      100
                  )}
                  %
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
                      {[
                        { key: "topic", label: "Topic", align: "" },
                        { key: "correct", label: "Correct", align: "text-right" },
                        { key: "incorrect", label: "Incorrect", align: "text-right" },
                        { key: "total", label: "Total", align: "text-right" },
                        { key: "rate", label: "Accuracy", align: "text-right" },
                      ].map((col) => (
                        <TableHead
                          key={col.key}
                          className={`${col.align} cursor-pointer select-none`}
                          onClick={() => setTopicSort((prev) => toggleSort(prev, col.key))}
                        >
                          {col.label}
                          <SortIcon
                            active={topicSort?.column === col.key}
                            direction={topicSort?.direction}
                          />
                        </TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {topicPerformance.map((t) => (
                      <TableRow key={t.topic}>
                        <TableCell className="font-medium">{t.topic}</TableCell>
                        <TableCell className="text-right">{t.correct}</TableCell>
                        <TableCell className="text-right">{t.incorrect}</TableCell>
                        <TableCell className="text-right">{t.total}</TableCell>
                        <TableCell className="text-right">
                          <Badge
                            variant={t.rate >= 70 ? "default" : t.rate >= 40 ? "secondary" : "destructive"}
                          >
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
                    {[
                      { key: "date", label: "Date", align: "" },
                      { key: "mode", label: "Mode", align: "", sortable: false },
                      { key: "score", label: "Score", align: "text-right" },
                      { key: "correct", label: "Correct", align: "text-right" },
                      { key: "time", label: "Time", align: "text-right" },
                    ].map((col) => (
                      <TableHead
                        key={col.key}
                        className={`${col.align} ${col.sortable !== false ? "cursor-pointer select-none" : ""}`}
                        onClick={col.sortable !== false ? () => setRecentSort((prev) => toggleSort(prev, col.key)) : undefined}
                      >
                        {col.label}
                        {col.sortable !== false && (
                          <SortIcon
                            active={recentSort?.column === col.key}
                            direction={recentSort?.direction}
                          />
                        )}
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {recentSubmissions.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="text-sm">
                        {format(new Date(r.created_at), "MMM d, yyyy HH:mm")}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1.5">
                          <Badge variant="outline">
                            {r.mode === "daily_quiz"
                              ? `Quiz Day ${r.quiz_day}`
                              : r.mode === "diagnostic"
                                ? "Diagnostic"
                                : "Exam"}
                          </Badge>
                          {r.learner_level && (
                            <Badge variant="secondary" className="text-[10px]">
                              {r.learner_level}
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        {r.total_questions > 0
                          ? Math.round((r.correct_answers / r.total_questions) * 100)
                          : 0}
                        %
                      </TableCell>
                      <TableCell className="text-right">
                        {r.correct_answers}/{r.total_questions}
                      </TableCell>
                      <TableCell className="text-right">
                        {Math.floor(r.time_spent / 60)}m {r.time_spent % 60}s
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </>
      )}
        </TabsContent>

      </Tabs>
    </div>
  );
};

export default AssessmentAnalytics;
