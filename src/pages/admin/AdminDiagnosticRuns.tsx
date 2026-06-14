import { Fragment, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ChevronDown, ChevronRight, RefreshCw, Copy } from "lucide-react";

interface RunRow {
  run_id: string;
  course_id: string;
  tier: string;
  status: string;
  requested: number;
  accepted: number;
  attempts: number;
  error_code: string | null;
  created_at: string;
  updated_at: string;
}

interface EventRow {
  id: string;
  run_id: string;
  course_id: string;
  tier: string | null;
  attempt: number | null;
  step: string;
  status: string;
  message: string | null;
  reason: string | null;
  data: Record<string, unknown> | null;
  gateway_call_id: string | null;
  duration_ms: number | null;
  created_at: string;
}

interface CourseRow {
  id: string;
  name: string | null;
  course_code: string | null;
}

const RANGES: Record<string, number> = {
  "1h": 60 * 60 * 1000,
  "24h": 24 * 60 * 60 * 1000,
  "7d": 7 * 24 * 60 * 60 * 1000,
  "30d": 30 * 24 * 60 * 60 * 1000,
};

const STATUS_BADGE: Record<string, string> = {
  ok: "border-primary/40 text-primary bg-primary/5",
  info: "border-muted-foreground/40 text-muted-foreground bg-muted/30",
  warn: "border-amber-500/40 text-amber-600 bg-amber-500/5",
  error: "border-destructive/40 text-destructive bg-destructive/5",
};

const RUN_STATUS_BADGE: Record<string, string> = {
  done: "border-primary/40 text-primary bg-primary/5",
  pending: "border-muted-foreground/40 text-muted-foreground bg-muted/30",
  calling_model: "border-amber-500/40 text-amber-600 bg-amber-500/5",
  validating: "border-amber-500/40 text-amber-600 bg-amber-500/5",
  failed: "border-destructive/40 text-destructive bg-destructive/5",
  skipped: "border-destructive/40 text-destructive bg-destructive/5",
};

interface RunGroup {
  run_id: string;
  course_id: string;
  course_label: string;
  tiers: RunRow[];
  totalAccepted: number;
  totalRequested: number;
  worstStatus: string;
  errorCodes: string[];
  startedAt: string;
  updatedAt: string;
  durationMs: number;
}

const AdminDiagnosticRuns = () => {
  const [tierRows, setTierRows] = useState<RunRow[]>([]);
  const [courses, setCourses] = useState<Record<string, CourseRow>>({});
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("");
  const [range, setRange] = useState("24h");
  const [statusFilter, setStatusFilter] = useState("all");
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [events, setEvents] = useState<EventRow[]>([]);
  const [eventsLoading, setEventsLoading] = useState(false);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const toggle = (id: string) => setExpanded((e) => ({ ...e, [id]: !e[id] }));

  const load = async () => {
    setLoading(true);
    const since = new Date(Date.now() - RANGES[range]).toISOString();
    const { data } = await supabase
      .from("diagnostic_generation_runs")
      .select("run_id, course_id, tier, status, requested, accepted, attempts, error_code, created_at, updated_at")
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(500);
    const rows = (data as RunRow[]) ?? [];
    setTierRows(rows);

    const courseIds = Array.from(new Set(rows.map((r) => r.course_id))).filter(Boolean);
    if (courseIds.length > 0) {
      const { data: cdata } = await supabase
        .from("courses")
        .select("id, name, course_code")
        .in("id", courseIds);
      const map: Record<string, CourseRow> = {};
      for (const c of (cdata as CourseRow[]) ?? []) map[c.id] = c;
      setCourses(map);
    }
    setLoading(false);
  };

  useEffect(() => {
    void load();
    const t = setInterval(() => void load(), 15000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range]);

  const loadEvents = async (runId: string) => {
    setEventsLoading(true);
    const { data } = await supabase
      .from("diagnostic_generation_events")
      .select("*")
      .eq("run_id", runId)
      .order("created_at", { ascending: true })
      .limit(2000);
    setEvents((data as EventRow[]) ?? []);
    setEventsLoading(false);
  };

  useEffect(() => {
    if (selectedRunId) void loadEvents(selectedRunId);
    else setEvents([]);
  }, [selectedRunId]);

  const groups: RunGroup[] = useMemo(() => {
    const map = new Map<string, RunGroup>();
    for (const r of tierRows) {
      let g = map.get(r.run_id);
      if (!g) {
        const c = courses[r.course_id];
        const label = c ? `${c.course_code ?? "?"} — ${c.name ?? "?"}` : r.course_id.slice(0, 8);
        g = {
          run_id: r.run_id,
          course_id: r.course_id,
          course_label: label,
          tiers: [],
          totalAccepted: 0,
          totalRequested: 0,
          worstStatus: "done",
          errorCodes: [],
          startedAt: r.created_at,
          updatedAt: r.updated_at,
          durationMs: 0,
        };
        map.set(r.run_id, g);
      }
      g.tiers.push(r);
      g.totalAccepted += r.accepted;
      g.totalRequested += r.requested;
      if (r.created_at < g.startedAt) g.startedAt = r.created_at;
      if (r.updated_at > g.updatedAt) g.updatedAt = r.updated_at;
      if (r.error_code && !g.errorCodes.includes(r.error_code)) g.errorCodes.push(r.error_code);
      const rank = (s: string) =>
        s === "failed" || s === "skipped" ? 3 : s === "calling_model" || s === "validating" || s === "pending" ? 2 : 1;
      if (rank(r.status) > rank(g.worstStatus)) g.worstStatus = r.status;
    }
    for (const g of map.values()) {
      g.durationMs = new Date(g.updatedAt).getTime() - new Date(g.startedAt).getTime();
    }
    return Array.from(map.values()).sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  }, [tierRows, courses]);

  const matchesFilter = (s: string) =>
    !filter || s.toLowerCase().includes(filter.toLowerCase());

  const filteredGroups = groups.filter((g) => {
    if (statusFilter !== "all" && g.worstStatus !== statusFilter) return false;
    return (
      matchesFilter(g.run_id) ||
      matchesFilter(g.course_label) ||
      matchesFilter(g.tiers.map((t) => t.tier).join(",")) ||
      matchesFilter(g.errorCodes.join(","))
    );
  });

  const stats = useMemo(() => {
    const s = { runs: groups.length, complete: 0, partial: 0, failed: 0 };
    for (const g of groups) {
      if (g.totalAccepted === g.totalRequested && g.worstStatus === "done") s.complete++;
      else if (g.totalAccepted > 0) s.partial++;
      else s.failed++;
    }
    return s;
  }, [groups]);

  const selectedGroup = groups.find((g) => g.run_id === selectedRunId);

  const copyRunJson = () => {
    if (!selectedGroup) return;
    const payload = { run: selectedGroup, events };
    void navigator.clipboard.writeText(JSON.stringify(payload, null, 2));
  };

  return (
    <div className="space-y-3">
      <div>
        <h1 className="text-2xl font-bold">Diagnostic Runs</h1>
        <p className="text-sm text-muted-foreground">
          Audit log of every diagnostic-question generation run with per-step reasoning.
        </p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <Card><CardContent className="p-3">
          <div className="text-[10px] uppercase text-muted-foreground">Runs ({range})</div>
          <div className="text-xl font-bold">{stats.runs}</div>
        </CardContent></Card>
        <Card><CardContent className="p-3">
          <div className="text-[10px] uppercase text-muted-foreground">Complete</div>
          <div className="text-xl font-bold text-primary">{stats.complete}</div>
        </CardContent></Card>
        <Card><CardContent className="p-3">
          <div className="text-[10px] uppercase text-muted-foreground">Partial</div>
          <div className="text-xl font-bold text-amber-600">{stats.partial}</div>
        </CardContent></Card>
        <Card><CardContent className="p-3">
          <div className="text-[10px] uppercase text-muted-foreground">Failed</div>
          <div className="text-xl font-bold text-destructive">{stats.failed}</div>
        </CardContent></Card>
      </div>

      <div className="flex flex-wrap gap-2 items-center">
        <Input
          placeholder="Filter by run / course / tier / error…"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="max-w-sm"
        />
        <Select value={range} onValueChange={setRange}>
          <SelectTrigger className="w-24"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="1h">Last 1h</SelectItem>
            <SelectItem value="24h">Last 24h</SelectItem>
            <SelectItem value="7d">Last 7d</SelectItem>
            <SelectItem value="30d">Last 30d</SelectItem>
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-40"><SelectValue placeholder="All statuses" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="done">Done</SelectItem>
            <SelectItem value="failed">Failed</SelectItem>
            <SelectItem value="skipped">Skipped</SelectItem>
            <SelectItem value="calling_model">In progress</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
          </SelectContent>
        </Select>
        <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading} className="gap-2 ml-auto">
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Refresh
        </Button>
      </div>

      <div className="grid lg:grid-cols-2 gap-3">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Runs ({filteredGroups.length})</CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto p-0">
            <table className="w-full text-xs">
              <thead className="text-left text-muted-foreground border-b">
                <tr>
                  <th className="py-2 px-3">Time</th>
                  <th className="py-2 px-3">Course</th>
                  <th className="py-2 px-3">Tiers</th>
                  <th className="py-2 px-3">Accepted</th>
                  <th className="py-2 px-3">Status</th>
                  <th className="py-2 px-3">Error</th>
                  <th className="py-2 px-3">Duration</th>
                </tr>
              </thead>
              <tbody>
                {filteredGroups.map((g) => {
                  const sel = selectedRunId === g.run_id;
                  return (
                    <tr
                      key={g.run_id}
                      onClick={() => setSelectedRunId(g.run_id)}
                      className={`border-b cursor-pointer hover:bg-muted/40 ${sel ? "bg-muted/60" : ""}`}
                    >
                      <td className="py-2 px-3 whitespace-nowrap font-mono">
                        {new Date(g.startedAt).toLocaleString()}
                      </td>
                      <td className="py-2 px-3" title={g.course_id}>{g.course_label}</td>
                      <td className="py-2 px-3 font-mono">{g.tiers.map((t) => t.tier).join(", ")}</td>
                      <td className="py-2 px-3 font-mono">{g.totalAccepted}/{g.totalRequested}</td>
                      <td className="py-2 px-3">
                        <Badge variant="outline" className={RUN_STATUS_BADGE[g.worstStatus] ?? ""}>
                          {g.worstStatus}
                        </Badge>
                      </td>
                      <td className="py-2 px-3 font-mono text-destructive">
                        {g.errorCodes.join(", ") || "—"}
                      </td>
                      <td className="py-2 px-3 font-mono text-muted-foreground">
                        {Math.round(g.durationMs / 100) / 10}s
                      </td>
                    </tr>
                  );
                })}
                {filteredGroups.length === 0 && (
                  <tr><td colSpan={7} className="py-6 text-center text-muted-foreground">No runs in this window.</td></tr>
                )}
              </tbody>
            </table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">
              {selectedGroup
                ? `Timeline · ${selectedGroup.course_label}`
                : "Select a run to see its timeline"}
            </CardTitle>
            {selectedGroup && (
              <Button variant="outline" size="sm" onClick={copyRunJson} className="gap-2">
                <Copy className="h-3 w-3" /> Copy JSON
              </Button>
            )}
          </CardHeader>
          <CardContent className="overflow-x-auto p-0">
            {selectedGroup && (
              <div className="px-4 py-2 border-b bg-muted/30 text-xs font-mono">
                run_id: {selectedGroup.run_id} · {selectedGroup.totalAccepted}/{selectedGroup.totalRequested}
                {selectedGroup.errorCodes.length > 0 && ` · ${selectedGroup.errorCodes.join(", ")}`}
              </div>
            )}
            {eventsLoading ? (
              <div className="p-6 text-center text-sm text-muted-foreground">Loading events…</div>
            ) : selectedRunId && events.length === 0 ? (
              <div className="p-6 text-center text-sm text-muted-foreground">
                No events recorded for this run. (Older runs predate the event log.)
              </div>
            ) : (
              <table className="w-full text-xs">
                <thead className="text-left text-muted-foreground border-b">
                  <tr>
                    <th className="py-2 px-2 w-6"></th>
                    <th className="py-2 px-2">Time</th>
                    <th className="py-2 px-2">Tier</th>
                    <th className="py-2 px-2">Att</th>
                    <th className="py-2 px-2">Step</th>
                    <th className="py-2 px-2">Status</th>
                    <th className="py-2 px-2">Message</th>
                    <th className="py-2 px-2">ms</th>
                  </tr>
                </thead>
                <tbody>
                  {events.map((e) => {
                    const open = !!expanded[e.id];
                    return (
                      <Fragment key={e.id}>
                        <tr className="border-b align-top">
                          <td className="py-2 px-2">
                            {(e.reason || (e.data && Object.keys(e.data).length > 0)) && (
                              <button onClick={() => toggle(e.id)} className="text-muted-foreground hover:text-foreground">
                                {open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                              </button>
                            )}
                          </td>
                          <td className="py-2 px-2 whitespace-nowrap font-mono">
                            {new Date(e.created_at).toLocaleTimeString()}
                          </td>
                          <td className="py-2 px-2 font-mono text-muted-foreground">{e.tier ?? "—"}</td>
                          <td className="py-2 px-2 font-mono text-muted-foreground">{e.attempt ?? "—"}</td>
                          <td className="py-2 px-2 font-mono">{e.step}</td>
                          <td className="py-2 px-2">
                            <Badge variant="outline" className={STATUS_BADGE[e.status] ?? ""}>
                              {e.status}
                            </Badge>
                          </td>
                          <td className="py-2 px-2 max-w-md">
                            <div className="truncate" title={e.message ?? ""}>{e.message ?? "—"}</div>
                          </td>
                          <td className="py-2 px-2 font-mono text-muted-foreground">{e.duration_ms ?? "—"}</td>
                        </tr>
                        {open && (
                          <tr className="border-b bg-muted/30">
                            <td></td>
                            <td colSpan={7} className="py-2 px-2">
                              {e.reason && (
                                <div className="mb-2">
                                  <div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">Reason</div>
                                  <pre className="text-[11px] bg-background border rounded p-2 whitespace-pre-wrap">{e.reason}</pre>
                                </div>
                              )}
                              {e.data && Object.keys(e.data).length > 0 && (
                                <div>
                                  <div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">Data</div>
                                  <pre className="text-[11px] bg-background border rounded p-2 overflow-x-auto">{JSON.stringify(e.data, null, 2)}</pre>
                                </div>
                              )}
                              {e.gateway_call_id && (
                                <div className="text-[11px] text-muted-foreground mt-1">
                                  gateway_call_id: <span className="font-mono">{e.gateway_call_id}</span>
                                </div>
                              )}
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                  {!selectedRunId && (
                    <tr><td colSpan={8} className="py-6 text-center text-muted-foreground">No run selected.</td></tr>
                  )}
                </tbody>
              </table>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default AdminDiagnosticRuns;
