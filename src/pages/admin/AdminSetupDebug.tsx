import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { RefreshCw, Check, AlertCircle, ChevronDown, ChevronRight } from "lucide-react";

interface LogRow {
  id: string;
  teacher_id: string;
  course_id: string | null;
  step_id: string;
  action: string;
  success: boolean;
  error_code: string | null;
  error_message: string | null;
  error_details: string | null;
  context: any;
  created_at: string;
}

interface ProgressRow {
  teacher_id: string;
  course_id: string | null;
  step_id: string;
  opened_at: string | null;
  completed_at: string | null;
  updated_at: string | null;
}

const AdminSetupDebug = () => {
  const [logs, setLogs] = useState<LogRow[]>([]);
  const [progress, setProgress] = useState<ProgressRow[]>([]);
  const [filter, setFilter] = useState("");
  const [onlyFailures, setOnlyFailures] = useState(false);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const toggle = (id: string) => setExpanded((e) => ({ ...e, [id]: !e[id] }));

  const load = async () => {
    setLoading(true);
    const [logRes, progRes] = await Promise.all([
      supabase
        .from("setup_progress_log")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(200),
      supabase
        .from("teacher_setup_progress")
        .select("teacher_id, course_id, step_id, opened_at, completed_at, updated_at")
        .order("updated_at", { ascending: false })
        .limit(200),
    ]);
    setLogs((logRes.data as LogRow[]) ?? []);
    setProgress((progRes.data as ProgressRow[]) ?? []);
    setLoading(false);
  };

  useEffect(() => { void load(); }, []);

  const matchesFilter = (s: string) =>
    !filter || s.toLowerCase().includes(filter.toLowerCase());

  const filteredLogs = logs.filter((r) => {
    if (onlyFailures && r.success) return false;
    const ctx = r.context || {};
    return (
      matchesFilter(r.teacher_id) ||
      matchesFilter(r.course_id ?? "") ||
      matchesFilter(r.step_id) ||
      matchesFilter(r.error_message ?? "") ||
      matchesFilter(r.error_code ?? "") ||
      matchesFilter(String(ctx.request_id ?? "")) ||
      matchesFilter(JSON.stringify(ctx.caller ?? {}))
    );
  });

  const filteredProgress = progress.filter((r) =>
    matchesFilter(r.teacher_id) ||
    matchesFilter(r.course_id ?? "") ||
    matchesFilter(r.step_id),
  );

  const failureCount = logs.filter((l) => !l.success).length;
  const successCount = logs.length - failureCount;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-heading text-2xl font-bold">Setup Progress Debug</h1>
          <p className="text-sm text-muted-foreground">
            Verify <code>markStepCompleted</code> writes and inspect SQL/RLS errors when persistence fails.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading} className="gap-2">
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Refresh
        </Button>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <Card>
          <CardContent className="p-4">
            <div className="text-xs text-muted-foreground">Successful writes (last 200)</div>
            <div className="text-2xl font-bold text-primary">{successCount}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-xs text-muted-foreground">Failed writes</div>
            <div className={`text-2xl font-bold ${failureCount > 0 ? "text-destructive" : ""}`}>{failureCount}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-xs text-muted-foreground">Persisted progress rows</div>
            <div className="text-2xl font-bold">{progress.length}</div>
          </CardContent>
        </Card>
      </div>

      <div className="flex gap-2 items-center">
        <Input
          placeholder="Filter by teacher_id / course_id / step / error…"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="max-w-md"
        />
        <Button
          variant={onlyFailures ? "default" : "outline"}
          size="sm"
          onClick={() => setOnlyFailures((v) => !v)}
        >
          Failures only
        </Button>
      </div>

      <Tabs defaultValue="logs">
        <TabsList>
          <TabsTrigger value="logs">Audit Log ({filteredLogs.length})</TabsTrigger>
          <TabsTrigger value="progress">Persisted Rows ({filteredProgress.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="logs">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Recent markStep* attempts</CardTitle>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="text-left text-muted-foreground border-b">
                  <tr>
                    <th className="py-2 pr-3">Time</th>
                    <th className="py-2 pr-3">Action</th>
                    <th className="py-2 pr-3">Step</th>
                    <th className="py-2 pr-3">Teacher</th>
                    <th className="py-2 pr-3">Course</th>
                    <th className="py-2 pr-3">Result</th>
                    <th className="py-2 pr-3">Error</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredLogs.map((r) => (
                    <tr key={r.id} className="border-b last:border-0 align-top">
                      <td className="py-2 pr-3 whitespace-nowrap font-mono">
                        {new Date(r.created_at).toLocaleString()}
                      </td>
                      <td className="py-2 pr-3 font-mono">{r.action}</td>
                      <td className="py-2 pr-3 font-mono">{r.step_id}</td>
                      <td className="py-2 pr-3 font-mono text-muted-foreground">{r.teacher_id.slice(0, 8)}…</td>
                      <td className="py-2 pr-3 font-mono text-muted-foreground">
                        {r.course_id ? `${r.course_id.slice(0, 8)}…` : "—"}
                      </td>
                      <td className="py-2 pr-3">
                        {r.success ? (
                          <Badge variant="outline" className="gap-1 border-primary/40 text-primary bg-primary/5">
                            <Check className="h-3 w-3" /> OK
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="gap-1 border-destructive/40 text-destructive bg-destructive/5">
                            <AlertCircle className="h-3 w-3" /> FAIL
                          </Badge>
                        )}
                      </td>
                      <td className="py-2 pr-3 max-w-md">
                        {r.error_code && <div className="font-mono text-destructive">{r.error_code}</div>}
                        {r.error_message && <div>{r.error_message}</div>}
                        {r.error_details && <div className="text-muted-foreground">{r.error_details}</div>}
                      </td>
                    </tr>
                  ))}
                  {filteredLogs.length === 0 && (
                    <tr><td colSpan={7} className="py-6 text-center text-muted-foreground">No log entries.</td></tr>
                  )}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="progress">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">teacher_setup_progress (most recent 200)</CardTitle>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="text-left text-muted-foreground border-b">
                  <tr>
                    <th className="py-2 pr-3">Teacher</th>
                    <th className="py-2 pr-3">Course</th>
                    <th className="py-2 pr-3">Step</th>
                    <th className="py-2 pr-3">opened_at</th>
                    <th className="py-2 pr-3">completed_at</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredProgress.map((r, i) => (
                    <tr key={i} className="border-b last:border-0">
                      <td className="py-2 pr-3 font-mono text-muted-foreground">{r.teacher_id.slice(0, 8)}…</td>
                      <td className="py-2 pr-3 font-mono text-muted-foreground">
                        {r.course_id ? `${r.course_id.slice(0, 8)}…` : "—"}
                      </td>
                      <td className="py-2 pr-3 font-mono">{r.step_id}</td>
                      <td className="py-2 pr-3 font-mono text-muted-foreground">
                        {r.opened_at ? new Date(r.opened_at).toLocaleString() : "—"}
                      </td>
                      <td className="py-2 pr-3 font-mono">
                        {r.completed_at ? (
                          <span className="text-primary">{new Date(r.completed_at).toLocaleString()}</span>
                        ) : (
                          <span className="text-muted-foreground">NULL</span>
                        )}
                      </td>
                    </tr>
                  ))}
                  {filteredProgress.length === 0 && (
                    <tr><td colSpan={5} className="py-6 text-center text-muted-foreground">No progress rows.</td></tr>
                  )}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default AdminSetupDebug;
