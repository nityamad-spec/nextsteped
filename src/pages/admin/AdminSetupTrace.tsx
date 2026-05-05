import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { RefreshCw, Check, AlertCircle, ChevronDown, ChevronRight, Clock } from "lucide-react";

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

interface TraceGroup {
  requestId: string;
  rows: LogRow[];
  firstAt: string;
  lastAt: string;
  durationMs: number;
  teacherId: string;
  courseId: string | null;
  stepId: string;
  action: string;
  hasFailure: boolean;
}

const AdminSetupTrace = () => {
  const [logs, setLogs] = useState<LogRow[]>([]);
  const [filter, setFilter] = useState("");
  const [onlyFailures, setOnlyFailures] = useState(false);
  const [loading, setLoading] = useState(true);
  const [openId, setOpenId] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("setup_progress_log")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(500);
    setLogs((data as LogRow[]) ?? []);
    setLoading(false);
  };

  useEffect(() => { void load(); }, []);

  const groups: TraceGroup[] = useMemo(() => {
    const map = new Map<string, LogRow[]>();
    for (const r of logs) {
      const ctx: any = r.context || {};
      const rid: string = ctx.request_id || `orphan:${r.id}`;
      if (!map.has(rid)) map.set(rid, []);
      map.get(rid)!.push(r);
    }
    const result: TraceGroup[] = [];
    for (const [rid, rows] of map.entries()) {
      const sorted = [...rows].sort(
        (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
      );
      const first = sorted[0];
      const last = sorted[sorted.length - 1];
      result.push({
        requestId: rid,
        rows: sorted,
        firstAt: first.created_at,
        lastAt: last.created_at,
        durationMs:
          new Date(last.created_at).getTime() - new Date(first.created_at).getTime(),
        teacherId: first.teacher_id,
        courseId: first.course_id,
        stepId: first.step_id,
        action: first.action,
        hasFailure: rows.some((r) => !r.success),
      });
    }
    return result.sort(
      (a, b) => new Date(b.firstAt).getTime() - new Date(a.firstAt).getTime(),
    );
  }, [logs]);

  const matches = (s: string) => !filter || s.toLowerCase().includes(filter.toLowerCase());

  const filtered = groups.filter((g) => {
    if (onlyFailures && !g.hasFailure) return false;
    return (
      matches(g.requestId) ||
      matches(g.teacherId) ||
      matches(g.courseId ?? "") ||
      matches(g.stepId) ||
      matches(g.action) ||
      g.rows.some((r) =>
        matches(r.error_message ?? "") || matches(r.error_code ?? "") ||
        matches(JSON.stringify(r.context?.caller ?? {})),
      )
    );
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-heading text-2xl font-bold">Setup Progress Trace</h1>
          <p className="text-sm text-muted-foreground">
            Grouped by <code>request_id</code> — every <code>markStep*</code> attempt and its verification step in order.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading} className="gap-2">
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Refresh
        </Button>
      </div>

      <div className="flex gap-2 items-center">
        <Input
          placeholder="Filter by request_id / teacher / course / step / error / caller…"
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
        <span className="text-xs text-muted-foreground">
          {filtered.length} traces · {logs.length} log rows
        </span>
      </div>

      <div className="space-y-2">
        {filtered.map((g) => {
          const isOpen = openId === g.requestId;
          return (
            <Card key={g.requestId} className={g.hasFailure ? "border-destructive/40" : ""}>
              <button
                onClick={() => setOpenId(isOpen ? null : g.requestId)}
                className="w-full text-left"
              >
                <CardHeader className="py-3">
                  <div className="flex items-center gap-3 flex-wrap">
                    {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                    <CardTitle className="text-sm font-mono" title={g.requestId}>
                      {g.requestId.slice(0, 16)}…
                    </CardTitle>
                    <Badge variant="outline" className="font-mono">{g.action}</Badge>
                    <Badge variant="outline" className="font-mono">step={g.stepId}</Badge>
                    {g.hasFailure ? (
                      <Badge variant="outline" className="gap-1 border-destructive/40 text-destructive bg-destructive/5">
                        <AlertCircle className="h-3 w-3" /> failure
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="gap-1 border-primary/40 text-primary bg-primary/5">
                        <Check className="h-3 w-3" /> ok
                      </Badge>
                    )}
                    <span className="text-xs text-muted-foreground font-mono flex items-center gap-1">
                      <Clock className="h-3 w-3" /> {g.durationMs}ms · {g.rows.length} entries
                    </span>
                    <span className="text-xs text-muted-foreground font-mono ml-auto">
                      {new Date(g.firstAt).toLocaleString()}
                    </span>
                  </div>
                  <div className="flex gap-4 text-[11px] text-muted-foreground font-mono pl-7">
                    <span title={g.teacherId}>teacher={g.teacherId.slice(0, 8)}…</span>
                    <span title={g.courseId ?? ""}>course={g.courseId ? `${g.courseId.slice(0, 8)}…` : "—"}</span>
                  </div>
                </CardHeader>
              </button>
              {isOpen && (
                <CardContent className="pt-0">
                  <ol className="relative border-l border-border pl-5 space-y-4">
                    {g.rows.map((r, i) => {
                      const ctx: any = r.context || {};
                      const t0 = new Date(g.firstAt).getTime();
                      const dt = new Date(r.created_at).getTime() - t0;
                      return (
                        <li key={r.id} className="relative">
                          <span
                            className={`absolute -left-[26px] top-1 h-3 w-3 rounded-full border-2 ${
                              r.success ? "bg-primary border-primary" : "bg-destructive border-destructive"
                            }`}
                          />
                          <div className="flex flex-wrap items-center gap-2 text-xs">
                            <span className="font-mono text-muted-foreground">#{i + 1}</span>
                            <span className="font-mono">{new Date(r.created_at).toLocaleTimeString()}</span>
                            <span className="font-mono text-muted-foreground">+{dt}ms</span>
                            <Badge variant="outline" className="font-mono">{r.action}</Badge>
                            {typeof ctx.duration_ms === "number" && (
                              <span className="font-mono text-muted-foreground">upsert {ctx.duration_ms}ms</span>
                            )}
                            {r.success ? (
                              <Badge variant="outline" className="gap-1 border-primary/40 text-primary bg-primary/5">
                                <Check className="h-3 w-3" /> OK
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="gap-1 border-destructive/40 text-destructive bg-destructive/5">
                                <AlertCircle className="h-3 w-3" /> FAIL
                              </Badge>
                            )}
                          </div>
                          {(r.error_code || r.error_message || r.error_details) && (
                            <div className="text-xs mt-1">
                              {r.error_code && <span className="font-mono text-destructive mr-2">{r.error_code}</span>}
                              {r.error_message && <span>{r.error_message}</span>}
                              {r.error_details && (
                                <div className="text-muted-foreground">{r.error_details}</div>
                              )}
                            </div>
                          )}
                          <div className="grid gap-2 md:grid-cols-2 mt-2">
                            <div>
                              <div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">Payload</div>
                              <pre className="text-[11px] bg-background border rounded p-2 overflow-x-auto">{JSON.stringify(ctx.payload ?? {}, null, 2)}</pre>
                            </div>
                            <div>
                              <div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">Verified row</div>
                              <pre className="text-[11px] bg-background border rounded p-2 overflow-x-auto">{JSON.stringify(ctx.verified_row ?? null, null, 2)}</pre>
                            </div>
                            {ctx.caller && Object.keys(ctx.caller).length > 0 && (
                              <div>
                                <div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">Caller</div>
                                <pre className="text-[11px] bg-background border rounded p-2 overflow-x-auto">{JSON.stringify(ctx.caller, null, 2)}</pre>
                              </div>
                            )}
                            {ctx.client && (
                              <div>
                                <div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">Client</div>
                                <pre className="text-[11px] bg-background border rounded p-2 overflow-x-auto">{JSON.stringify(ctx.client, null, 2)}</pre>
                              </div>
                            )}
                          </div>
                        </li>
                      );
                    })}
                  </ol>
                </CardContent>
              )}
            </Card>
          );
        })}
        {filtered.length === 0 && (
          <Card><CardContent className="py-8 text-center text-sm text-muted-foreground">
            No traces match.
          </CardContent></Card>
        )}
      </div>
    </div>
  );
};

export default AdminSetupTrace;
