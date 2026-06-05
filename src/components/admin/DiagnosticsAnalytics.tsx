import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  BarChart3,
  Users,
  GraduationCap,
  Activity,
  RefreshCw,
  Download,
  Clock,
  ChevronRight,
  ChevronLeft,
  CheckCircle2,
  XCircle,
  TrendingUp,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  Area,
  AreaChart,
  Legend,
} from "recharts";
import { toast } from "sonner";
import {
  aggregateBranchTierDistribution,
  aggregateByCourse,
  aggregateConceptPerformance,
  aggregateGlobalKpis,
  aggregateLevelDistribution,
  aggregateTierAccuracy,
  timeSeriesOverall,
  toCsv,
  LEARNER_LEVELS,
  type CourseRow,
  type CourseSummary,
  type DiagnosticResultRow,
  type LearnerLevel,
  type ProfileRow,
} from "@/lib/diagnosticsAnalytics";

const LEVEL_COLORS: Record<LearnerLevel, string> = {
  beginner: "hsl(var(--destructive))",
  developing: "hsl(var(--chart-3, 30 90% 55%))",
  proficient: "hsl(var(--chart-2, 200 80% 55%))",
  expert: "hsl(var(--primary))",
};

const TIER_COLORS: Record<string, string> = {
  easy: "hsl(142 70% 45%)",
  medium: "hsl(38 92% 50%)",
  hard: "hsl(0 75% 55%)",
  none: "hsl(var(--muted-foreground))",
  standard: "hsl(var(--primary))",
};

function pct(n: number) {
  return `${n.toFixed(0)}%`;
}

function fmtMs(ms: number) {
  if (!ms) return "—";
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60000).toFixed(1)}m`;
}

export default function DiagnosticsAnalytics() {
  const [loading, setLoading] = useState(true);
  const [results, setResults] = useState<DiagnosticResultRow[]>([]);
  const [courses, setCourses] = useState<CourseRow[]>([]);
  const [profiles, setProfiles] = useState<Map<string, ProfileRow>>(new Map());
  const [courseFilter, setCourseFilter] = useState<string>("all");
  const [dateRange, setDateRange] = useState<string>("90");
  const [drillCourseId, setDrillCourseId] = useState<string | null>(null);
  const [drillResult, setDrillResult] = useState<DiagnosticResultRow | null>(null);

  async function fetchAll() {
    setLoading(true);
    try {
      const [rRes, cRes] = await Promise.all([
        supabase
          .from("diagnostic_results")
          .select(
            "id, student_id, course_id, score, total_questions, learner_level, branch_tier, answers, question_times, confidences, created_at",
          )
          .order("created_at", { ascending: false }),
        supabase.from("courses").select("id, name, course_code, teacher_id"),
      ]);
      if (rRes.error) throw rRes.error;
      if (cRes.error) throw cRes.error;

      const rows = (rRes.data || []) as unknown as DiagnosticResultRow[];
      setResults(rows);
      setCourses((cRes.data || []) as CourseRow[]);

      const studentIds = Array.from(new Set(rows.map((r) => r.student_id)));
      if (studentIds.length) {
        const pRes = await supabase
          .from("profiles")
          .select("id, name, roll_number, email")
          .in("id", studentIds);
        if (pRes.data) {
          setProfiles(new Map((pRes.data as ProfileRow[]).map((p) => [p.id, p])));
        }
      } else {
        setProfiles(new Map());
      }
    } catch (err: any) {
      toast.error("Failed to load diagnostic data", { description: err?.message });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchAll();
  }, []);

  const filtered = useMemo(() => {
    const days = dateRange === "all" ? null : parseInt(dateRange, 10);
    const cutoff = days
      ? Date.now() - days * 24 * 60 * 60 * 1000
      : null;
    return results.filter((r) => {
      if (courseFilter !== "all" && r.course_id !== courseFilter) return false;
      if (cutoff && new Date(r.created_at).getTime() < cutoff) return false;
      return true;
    });
  }, [results, courseFilter, dateRange]);

  const kpis = useMemo(() => aggregateGlobalKpis(filtered), [filtered]);
  const levelDist = useMemo(() => aggregateLevelDistribution(filtered), [filtered]);
  const tierDist = useMemo(() => aggregateBranchTierDistribution(filtered), [filtered]);
  const byCourse = useMemo(() => aggregateByCourse(filtered, courses), [filtered, courses]);
  const series = useMemo(
    () => timeSeriesOverall(filtered, dateRange === "all" ? 90 : Math.min(parseInt(dateRange, 10), 90)),
    [filtered, dateRange],
  );

  const drillCourse = drillCourseId ? byCourse.find((c) => c.courseId === drillCourseId) : null;
  const drillResults = useMemo(
    () => (drillCourseId ? filtered.filter((r) => r.course_id === drillCourseId) : []),
    [drillCourseId, filtered],
  );

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-24 w-full" />
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
        <Skeleton className="h-64 w-full" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  if (results.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-16 text-center">
          <BarChart3 className="h-12 w-12 text-muted-foreground/40" />
          <p className="mt-4 text-muted-foreground">No diagnostic results yet.</p>
          <p className="text-xs text-muted-foreground">
            Once students complete diagnostics, summaries will appear here.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Filters */}
      <div className="flex flex-wrap items-end gap-3 rounded-lg border bg-card p-3">
        <div className="space-y-1">
          <p className="text-xs font-medium text-muted-foreground">Course</p>
          <Select value={courseFilter} onValueChange={setCourseFilter}>
            <SelectTrigger className="w-[240px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All courses</SelectItem>
              {courses.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.course_code ? `${c.course_code} — ` : ""}
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <p className="text-xs font-medium text-muted-foreground">Date range</p>
          <Select value={dateRange} onValueChange={setDateRange}>
            <SelectTrigger className="w-[160px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7">Last 7 days</SelectItem>
              <SelectItem value="30">Last 30 days</SelectItem>
              <SelectItem value="90">Last 90 days</SelectItem>
              <SelectItem value="all">All time</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="ml-auto">
          <Button variant="outline" size="sm" onClick={fetchAll} className="gap-1">
            <RefreshCw className="h-4 w-4" /> Refresh
          </Button>
        </div>
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-5">
        <KpiCard icon={<Activity className="h-5 w-5 text-primary" />} label="Attempts" value={kpis.totalAttempts.toString()} />
        <KpiCard icon={<Users className="h-5 w-5 text-primary" />} label="Students" value={kpis.uniqueStudents.toString()} />
        <KpiCard icon={<GraduationCap className="h-5 w-5 text-primary" />} label="Courses" value={kpis.coursesWithAttempts.toString()} />
        <KpiCard icon={<TrendingUp className="h-5 w-5 text-primary" />} label="Avg score" value={pct(kpis.avgScorePct)} />
        <KpiCard icon={<Clock className="h-5 w-5 text-primary" />} label="Median time/q" value={fmtMs(kpis.medianTimePerQuestionMs)} />
      </div>

      {/* Distributions */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Learner level distribution</CardTitle>
            <CardDescription>Across {kpis.totalAttempts} attempts</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart
                data={LEARNER_LEVELS.map((l) => ({ name: l, count: levelDist[l] }))}
                margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
                <Tooltip cursor={{ fill: "hsl(var(--muted))" }} />
                <Bar dataKey="count" radius={[6, 6, 0, 0]}>
                  {LEARNER_LEVELS.map((l) => (
                    <Cell key={l} fill={LEVEL_COLORS[l]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Adaptive branch tier mix</CardTitle>
            <CardDescription>Which difficulty branch students were routed to</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie
                  data={Object.entries(tierDist).map(([k, v]) => ({ name: k, value: v }))}
                  dataKey="value"
                  nameKey="name"
                  outerRadius={80}
                  innerRadius={45}
                  paddingAngle={2}
                >
                  {Object.keys(tierDist).map((k) => (
                    <Cell key={k} fill={TIER_COLORS[k]} />
                  ))}
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Trend */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Attempts & average score over time</CardTitle>
          <CardDescription>
            {dateRange === "all" ? "Last 90 days" : `Last ${dateRange} days`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={240}>
            <AreaChart data={series} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="gAttempts" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.4} />
                  <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
              <XAxis dataKey="date" tick={{ fontSize: 11 }} />
              <YAxis yAxisId="l" allowDecimals={false} tick={{ fontSize: 11 }} />
              <YAxis yAxisId="r" orientation="right" domain={[0, 100]} tick={{ fontSize: 11 }} />
              <Tooltip />
              <Legend />
              <Area
                yAxisId="l"
                type="monotone"
                dataKey="attempts"
                stroke="hsl(var(--primary))"
                fill="url(#gAttempts)"
                name="Attempts"
              />
              <Area
                yAxisId="r"
                type="monotone"
                dataKey="avgScorePct"
                stroke="hsl(142 70% 45%)"
                fill="transparent"
                name="Avg score %"
              />
            </AreaChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Course-wise table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Course-wise summary</CardTitle>
          <CardDescription>Click a row to drill into per-concept and per-student detail.</CardDescription>
        </CardHeader>
        <CardContent>
          {byCourse.length === 0 ? (
            <p className="text-sm text-muted-foreground">No data for current filters.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Course</TableHead>
                  <TableHead className="text-right">Attempts</TableHead>
                  <TableHead className="text-right">Students</TableHead>
                  <TableHead className="text-right">Avg score</TableHead>
                  <TableHead className="text-right">Std-phase</TableHead>
                  <TableHead>Tier mix</TableHead>
                  <TableHead>Level mix</TableHead>
                  <TableHead className="text-right">Last attempt</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {byCourse.map((c) => (
                  <TableRow
                    key={c.courseId}
                    className="cursor-pointer"
                    onClick={() => setDrillCourseId(c.courseId)}
                  >
                    <TableCell>
                      <p className="font-medium">{c.courseName}</p>
                      <p className="text-xs text-muted-foreground">{c.courseCode || "—"}</p>
                    </TableCell>
                    <TableCell className="text-right">{c.attempts}</TableCell>
                    <TableCell className="text-right">{c.uniqueStudents}</TableCell>
                    <TableCell className="text-right">{pct(c.avgScorePct)}</TableCell>
                    <TableCell className="text-right">{pct(c.avgStandardScorePct)}</TableCell>
                    <TableCell>
                      <TierPills mix={c.tierMix} />
                    </TableCell>
                    <TableCell>
                      <LevelMiniBar mix={c.levelMix} total={c.attempts} />
                    </TableCell>
                    <TableCell className="text-right text-xs text-muted-foreground">
                      {c.lastAttemptAt ? new Date(c.lastAttemptAt).toLocaleDateString() : "—"}
                    </TableCell>
                    <TableCell>
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Course drill-down */}
      <Dialog open={!!drillCourseId} onOpenChange={(o) => !o && setDrillCourseId(null)}>
        <DialogContent className="max-w-5xl max-h-[90vh] overflow-hidden flex flex-col">
          {drillCourse && (
            <CourseDrillDown
              course={drillCourse}
              results={drillResults}
              profiles={profiles}
              onPickStudent={setDrillResult}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Student drill-down */}
      <Dialog open={!!drillResult} onOpenChange={(o) => !o && setDrillResult(null)}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-hidden flex flex-col">
          {drillResult && (
            <StudentDrillDown result={drillResult} profile={profiles.get(drillResult.student_id)} onBack={() => setDrillResult(null)} />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function KpiCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <Card>
      <CardContent className="flex items-center gap-3 p-4">
        <div className="rounded-md bg-primary/10 p-2">{icon}</div>
        <div>
          <p className="text-xl font-bold leading-none">{value}</p>
          <p className="mt-1 text-xs text-muted-foreground">{label}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function TierPills({ mix }: { mix: Record<string, number> }) {
  return (
    <div className="flex flex-wrap gap-1">
      {(["easy", "medium", "hard", "none"] as const).map((k) =>
        mix[k] > 0 ? (
          <Badge
            key={k}
            variant="outline"
            className="text-[10px] px-1.5 py-0"
            style={{ borderColor: TIER_COLORS[k], color: TIER_COLORS[k] }}
          >
            {k} {mix[k]}
          </Badge>
        ) : null,
      )}
    </div>
  );
}

function LevelMiniBar({ mix, total }: { mix: Record<LearnerLevel, number>; total: number }) {
  if (total === 0) return <span className="text-xs text-muted-foreground">—</span>;
  return (
    <div className="flex h-2 w-32 overflow-hidden rounded-full bg-muted">
      {LEARNER_LEVELS.map((l) =>
        mix[l] > 0 ? (
          <div
            key={l}
            style={{ width: `${(mix[l] / total) * 100}%`, backgroundColor: LEVEL_COLORS[l] }}
            title={`${l}: ${mix[l]}`}
          />
        ) : null,
      )}
    </div>
  );
}

function CourseDrillDown({
  course,
  results,
  profiles,
  onPickStudent,
}: {
  course: CourseSummary;
  results: DiagnosticResultRow[];
  profiles: Map<string, ProfileRow>;
  onPickStudent: (r: DiagnosticResultRow) => void;
}) {
  const concepts = useMemo(() => aggregateConceptPerformance(results), [results]);
  const tierAcc = useMemo(() => aggregateTierAccuracy(results), [results]);

  const exportCsv = () => {
    const rows = results.map((r) => {
      const p = profiles.get(r.student_id);
      const avgTime =
        r.question_times && r.question_times.length
          ? r.question_times.reduce((s, t) => s + t, 0) / r.question_times.length
          : 0;
      return [
        p?.name || "—",
        p?.roll_number || "—",
        p?.email || "—",
        r.score,
        r.total_questions,
        ((r.score / Math.max(r.total_questions, 1)) * 100).toFixed(1),
        r.learner_level,
        r.branch_tier || "—",
        Math.round(avgTime),
        new Date(r.created_at).toISOString(),
      ];
    });
    const csv = toCsv(
      ["Name", "Roll", "Email", "Score", "Total", "Pct", "Level", "Branch", "AvgTimeMs", "CompletedAt"],
      rows,
    );
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `diagnostics-${course.courseCode || course.courseId}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle>
          {course.courseCode ? `${course.courseCode} — ` : ""}
          {course.courseName}
        </DialogTitle>
        <DialogDescription>
          {course.attempts} attempts · {course.uniqueStudents} students · avg {pct(course.avgScorePct)}
        </DialogDescription>
      </DialogHeader>
      <ScrollArea className="flex-1 pr-4">
        <Tabs defaultValue="concepts" className="space-y-4">
          <TabsList>
            <TabsTrigger value="concepts">Concept performance</TabsTrigger>
            <TabsTrigger value="tiers">Tier accuracy</TabsTrigger>
            <TabsTrigger value="students">Students ({results.length})</TabsTrigger>
          </TabsList>

          <TabsContent value="concepts">
            {concepts.length === 0 ? (
              <p className="text-sm text-muted-foreground">No per-concept data available.</p>
            ) : (
              <>
                <div className="mb-3 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm">
                  <p className="font-medium">Focus areas (weakest 3 concepts)</p>
                  <ul className="mt-1 text-xs text-muted-foreground">
                    {concepts.slice(0, 3).map((c) => (
                      <li key={c.topic}>
                        <span className="font-mono">{c.topic}</span> — {pct(c.accuracyPct)} ({c.correct}/{c.attempted})
                      </li>
                    ))}
                  </ul>
                </div>
                <ResponsiveContainer width="100%" height={Math.max(200, concepts.length * 26)}>
                  <BarChart data={concepts} layout="vertical" margin={{ left: 80 }}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                    <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 11 }} />
                    <YAxis type="category" dataKey="topic" tick={{ fontSize: 11 }} width={120} />
                    <Tooltip formatter={(v: number) => `${v.toFixed(0)}%`} />
                    <Bar dataKey="accuracyPct" radius={[0, 6, 6, 0]} fill="hsl(var(--primary))" />
                  </BarChart>
                </ResponsiveContainer>
              </>
            )}
          </TabsContent>

          <TabsContent value="tiers">
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={tierAcc}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="tier" tick={{ fontSize: 12 }} />
                <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} />
                <Tooltip formatter={(v: number) => `${v.toFixed(0)}%`} />
                <Bar dataKey="accuracyPct" radius={[6, 6, 0, 0]}>
                  {tierAcc.map((t) => (
                    <Cell key={t.tier} fill={TIER_COLORS[t.tier]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
            <div className="mt-2 grid grid-cols-4 gap-2 text-xs text-muted-foreground">
              {tierAcc.map((t) => (
                <div key={t.tier} className="rounded-md border bg-muted/40 p-2 text-center">
                  <p className="font-medium capitalize">{t.tier}</p>
                  <p>
                    {t.correct}/{t.attempted}
                  </p>
                </div>
              ))}
            </div>
          </TabsContent>

          <TabsContent value="students">
            <div className="mb-3 flex justify-end">
              <Button size="sm" variant="outline" className="gap-1" onClick={exportCsv}>
                <Download className="h-4 w-4" /> Export CSV
              </Button>
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Student</TableHead>
                  <TableHead>Roll</TableHead>
                  <TableHead className="text-right">Score</TableHead>
                  <TableHead>Level</TableHead>
                  <TableHead>Branch</TableHead>
                  <TableHead className="text-right">Avg time/q</TableHead>
                  <TableHead className="text-right">Completed</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {results.map((r) => {
                  const p = profiles.get(r.student_id);
                  const avgTime =
                    r.question_times && r.question_times.length
                      ? r.question_times.reduce((s, t) => s + t, 0) / r.question_times.length
                      : 0;
                  return (
                    <TableRow
                      key={r.id}
                      className="cursor-pointer"
                      onClick={() => onPickStudent(r)}
                    >
                      <TableCell>
                        <p className="font-medium">{p?.name || "—"}</p>
                        <p className="text-xs text-muted-foreground">{p?.email || ""}</p>
                      </TableCell>
                      <TableCell className="text-xs">{p?.roll_number || "—"}</TableCell>
                      <TableCell className="text-right">
                        {r.score}/{r.total_questions}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          style={{
                            borderColor: LEVEL_COLORS[r.learner_level as LearnerLevel] || "hsl(var(--border))",
                            color: LEVEL_COLORS[r.learner_level as LearnerLevel] || "inherit",
                          }}
                        >
                          {r.learner_level}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs capitalize">{r.branch_tier || "—"}</TableCell>
                      <TableCell className="text-right text-xs">{fmtMs(avgTime)}</TableCell>
                      <TableCell className="text-right text-xs text-muted-foreground">
                        {new Date(r.created_at).toLocaleDateString()}
                      </TableCell>
                      <TableCell>
                        <ChevronRight className="h-4 w-4 text-muted-foreground" />
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </TabsContent>
        </Tabs>
      </ScrollArea>
    </>
  );
}

function StudentDrillDown({
  result,
  profile,
  onBack,
}: {
  result: DiagnosticResultRow;
  profile?: ProfileRow;
  onBack: () => void;
}) {
  const totalTime =
    result.question_times?.reduce((s, t) => s + (typeof t === "number" ? t : 0), 0) || 0;
  const strengths = useMemo(() => {
    const map = new Map<string, { c: number; t: number }>();
    for (const a of result.answers || []) {
      const k = a.topic || "Uncategorized";
      const cur = map.get(k) || { c: 0, t: 0 };
      cur.t += 1;
      if (a.is_correct) cur.c += 1;
      map.set(k, cur);
    }
    return Array.from(map.entries())
      .map(([topic, v]) => ({ topic, accuracy: (v.c / v.t) * 100, correct: v.c, total: v.t }))
      .sort((a, b) => b.accuracy - a.accuracy);
  }, [result]);

  return (
    <>
      <DialogHeader>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={onBack} className="-ml-2 h-8">
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <div>
            <DialogTitle>{profile?.name || "Student"}</DialogTitle>
            <DialogDescription>
              {profile?.roll_number ? `${profile.roll_number} · ` : ""}
              {profile?.email || ""}
            </DialogDescription>
          </div>
        </div>
      </DialogHeader>

      <div className="grid grid-cols-4 gap-2 text-sm">
        <Stat label="Score" value={`${result.score}/${result.total_questions}`} />
        <Stat label="Level" value={result.learner_level} />
        <Stat label="Branch" value={result.branch_tier || "—"} />
        <Stat label="Total time" value={fmtMs(totalTime)} />
      </div>

      <ScrollArea className="flex-1 pr-3">
        <div className="space-y-4">
          <div>
            <p className="mb-2 text-sm font-medium">Concept breakdown</p>
            <div className="grid gap-1.5">
              {strengths.map((s) => (
                <div key={s.topic} className="flex items-center gap-3 text-xs">
                  <span className="w-32 truncate font-mono text-muted-foreground" title={s.topic}>
                    {s.topic}
                  </span>
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full"
                      style={{
                        width: `${s.accuracy}%`,
                        backgroundColor:
                          s.accuracy >= 75
                            ? "hsl(142 70% 45%)"
                            : s.accuracy >= 50
                              ? "hsl(38 92% 50%)"
                              : "hsl(var(--destructive))",
                      }}
                    />
                  </div>
                  <span className="w-16 text-right tabular-nums">
                    {s.correct}/{s.total}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div>
            <p className="mb-2 text-sm font-medium">Per-question detail</p>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-8">#</TableHead>
                  <TableHead>Question</TableHead>
                  <TableHead>Tier</TableHead>
                  <TableHead>Selected</TableHead>
                  <TableHead>Correct</TableHead>
                  <TableHead className="text-right">Time</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {(result.answers || []).map((a, i) => (
                  <TableRow key={i}>
                    <TableCell className="text-xs text-muted-foreground">{i + 1}</TableCell>
                    <TableCell className="max-w-[280px] truncate text-xs" title={a.question_text}>
                      {a.question_text || "—"}
                    </TableCell>
                    <TableCell className="text-xs capitalize">{a.tier || "—"}</TableCell>
                    <TableCell className="text-xs">{a.selected || "—"}</TableCell>
                    <TableCell className="text-xs">{a.correct || "—"}</TableCell>
                    <TableCell className="text-right text-xs">{fmtMs(a.time_ms || 0)}</TableCell>
                    <TableCell>
                      {a.is_correct ? (
                        <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                      ) : (
                        <XCircle className="h-4 w-4 text-destructive" />
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      </ScrollArea>
    </>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border bg-muted/40 p-2 text-center">
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="mt-0.5 text-sm font-semibold capitalize">{value}</p>
    </div>
  );
}
