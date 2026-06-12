import { Fragment, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ChevronDown, ChevronRight, RefreshCw } from "lucide-react";

interface CallRow {
  id: string;
  created_at: string;
  function_name: string;
  model: string | null;
  purpose: string | null;
  http_status: number | null;
  outcome: string;
  attempt: number | null;
  total_attempts: number | null;
  duration_ms: number | null;
  request_id: string | null;
  teacher_id: string | null;
  course_id: string | null;
  error_code: string | null;
  error_message: string | null;
  context: Record<string, unknown> | null;
}

const RANGES: Record<string, number> = {
  "1h": 60 * 60 * 1000,
  "24h": 24 * 60 * 60 * 1000,
  "7d": 7 * 24 * 60 * 60 * 1000,
};

const OUTCOME_BADGE: Record<string, string> = {
  ok: "border-primary/40 text-primary bg-primary/5",
  retryable: "border-amber-500/40 text-amber-600 bg-amber-500/5",
  client_error: "border-destructive/40 text-destructive bg-destructive/5",
  timeout: "border-destructive/40 text-destructive bg-destructive/5",
  network_error: "border-destructive/40 text-destructive bg-destructive/5",
  aborted: "border-muted-foreground/40 text-muted-foreground bg-muted/30",
};

const AiGatewayCallsTab = () => {
  const [rows, setRows] = useState<CallRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("");
  const [range, setRange] = useState("24h");
  const [functionFilter, setFunctionFilter] = useState("all");
  const [outcomeFilter, setOutcomeFilter] = useState("all");
  const [nonOkOnly, setNonOkOnly] = useState(false);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const toggle = (id: string) => setExpanded((e) => ({ ...e, [id]: !e[id] }));

  const load = async () => {
    setLoading(true);
    const since = new Date(Date.now() - RANGES[range]).toISOString();
    const { data } = await supabase
      .from("ai_gateway_call_log")
      .select("*")
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(500);
    setRows((data as CallRow[]) ?? []);
    setLoading(false);
  };

  useEffect(() => {
    void load();
    const t = setInterval(() => void load(), 15000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range]);

  const functions = useMemo(
    () => Array.from(new Set(rows.map((r) => r.function_name))).sort(),
    [rows],
  );

  const matchesFilter = (s: string) =>
    !filter || s.toLowerCase().includes(filter.toLowerCase());

  const filtered = rows.filter((r) => {
    if (functionFilter !== "all" && r.function_name !== functionFilter) return false;
    if (outcomeFilter !== "all" && r.outcome !== outcomeFilter) return false;
    if (nonOkOnly && r.outcome === "ok") return false;
    return (
      matchesFilter(r.function_name) ||
      matchesFilter(r.purpose ?? "") ||
      matchesFilter(r.request_id ?? "") ||
      matchesFilter(r.teacher_id ?? "") ||
      matchesFilter(r.course_id ?? "") ||
      matchesFilter(r.error_message ?? "") ||
      matchesFilter(r.error_code ?? "") ||
      matchesFilter(String(r.http_status ?? ""))
    );
  });

  const counts = useMemo(() => {
    const c = { ok: 0, retryable: 0, client_error: 0, timeout: 0, other: 0 };
    for (const r of rows) {
      if (r.outcome === "ok") c.ok++;
      else if (r.outcome === "retryable") c.retryable++;
      else if (r.outcome === "client_error") c.client_error++;
      else if (r.outcome === "timeout") c.timeout++;
      else c.other++;
    }
    return c;
  }, [rows]);

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
        <Card><CardContent className="p-3">
          <div className="text-[10px] uppercase text-muted-foreground">OK (2xx)</div>
          <div className="text-xl font-bold text-primary">{counts.ok}</div>
        </CardContent></Card>
        <Card><CardContent className="p-3">
          <div className="text-[10px] uppercase text-muted-foreground">Retryable (429/5xx)</div>
          <div className="text-xl font-bold text-amber-600">{counts.retryable}</div>
        </CardContent></Card>
        <Card><CardContent className="p-3">
          <div className="text-[10px] uppercase text-muted-foreground">Client error (4xx)</div>
          <div className="text-xl font-bold text-destructive">{counts.client_error}</div>
        </CardContent></Card>
        <Card><CardContent className="p-3">
          <div className="text-[10px] uppercase text-muted-foreground">Timeout</div>
          <div className="text-xl font-bold text-destructive">{counts.timeout}</div>
        </CardContent></Card>
        <Card><CardContent className="p-3">
          <div className="text-[10px] uppercase text-muted-foreground">Network/aborted</div>
          <div className="text-xl font-bold">{counts.other}</div>
        </CardContent></Card>
      </div>

      <div className="flex flex-wrap gap-2 items-center">
        <Input
          placeholder="Filter by function / purpose / request_id / status / error…"
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
          </SelectContent>
        </Select>
        <Select value={functionFilter} onValueChange={setFunctionFilter}>
          <SelectTrigger className="w-56"><SelectValue placeholder="All functions" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All functions</SelectItem>
            {functions.map((f) => <SelectItem key={f} value={f}>{f}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={outcomeFilter} onValueChange={setOutcomeFilter}>
          <SelectTrigger className="w-40"><SelectValue placeholder="All outcomes" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All outcomes</SelectItem>
            <SelectItem value="ok">OK</SelectItem>
            <SelectItem value="retryable">Retryable</SelectItem>
            <SelectItem value="client_error">Client error</SelectItem>
            <SelectItem value="timeout">Timeout</SelectItem>
            <SelectItem value="network_error">Network error</SelectItem>
            <SelectItem value="aborted">Aborted</SelectItem>
          </SelectContent>
        </Select>
        <Button
          variant={nonOkOnly ? "default" : "outline"}
          size="sm"
          onClick={() => setNonOkOnly((v) => !v)}
        >
          Non-200 only
        </Button>
        <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading} className="gap-2 ml-auto">
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Refresh
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">AI gateway calls ({filtered.length})</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="text-left text-muted-foreground border-b">
              <tr>
                <th className="py-2 pr-3 w-6"></th>
                <th className="py-2 pr-3">Time</th>
                <th className="py-2 pr-3">Function</th>
                <th className="py-2 pr-3">Model</th>
                <th className="py-2 pr-3">Purpose</th>
                <th className="py-2 pr-3">Attempt</th>
                <th className="py-2 pr-3">Status</th>
                <th className="py-2 pr-3">Outcome</th>
                <th className="py-2 pr-3">ms</th>
                <th className="py-2 pr-3">Request</th>
                <th className="py-2 pr-3">Error</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => {
                const isOpen = !!expanded[r.id];
                return (
                  <Fragment key={r.id}>
                    <tr className="border-b last:border-0 align-top">
                      <td className="py-2 pr-1">
                        <button
                          onClick={() => toggle(r.id)}
                          className="text-muted-foreground hover:text-foreground"
                          aria-label="Toggle context"
                        >
                          {isOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                        </button>
                      </td>
                      <td className="py-2 pr-3 whitespace-nowrap font-mono">
                        {new Date(r.created_at).toLocaleString()}
                      </td>
                      <td className="py-2 pr-3 font-mono">{r.function_name}</td>
                      <td className="py-2 pr-3 font-mono text-muted-foreground">{r.model ?? "—"}</td>
                      <td className="py-2 pr-3 font-mono text-muted-foreground">{r.purpose ?? "—"}</td>
                      <td className="py-2 pr-3 font-mono text-muted-foreground">
                        {r.attempt != null ? `${r.attempt}/${r.total_attempts ?? "?"}` : "—"}
                      </td>
                      <td className="py-2 pr-3 font-mono">{r.http_status ?? "—"}</td>
                      <td className="py-2 pr-3">
                        <Badge variant="outline" className={OUTCOME_BADGE[r.outcome] ?? ""}>
                          {r.outcome}
                        </Badge>
                      </td>
                      <td className="py-2 pr-3 font-mono text-muted-foreground">{r.duration_ms ?? "—"}</td>
                      <td className="py-2 pr-3 font-mono text-muted-foreground" title={r.request_id ?? ""}>
                        {r.request_id ? `${r.request_id.slice(0, 8)}…` : "—"}
                      </td>
                      <td className="py-2 pr-3 max-w-md">
                        {r.error_code && <div className="font-mono text-destructive">{r.error_code}</div>}
                        {r.error_message && <div className="text-muted-foreground truncate" title={r.error_message}>{r.error_message}</div>}
                      </td>
                    </tr>
                    {isOpen && (
                      <tr className="border-b bg-muted/30">
                        <td></td>
                        <td colSpan={10} className="py-2 pr-3">
                          <div className="grid gap-2 md:grid-cols-2">
                            <div>
                              <div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">Context</div>
                              <pre className="text-[11px] bg-background border rounded p-2 overflow-x-auto">{JSON.stringify(r.context ?? {}, null, 2)}</pre>
                            </div>
                            <div>
                              <div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">IDs</div>
                              <pre className="text-[11px] bg-background border rounded p-2 overflow-x-auto">{JSON.stringify({
                                request_id: r.request_id,
                                teacher_id: r.teacher_id,
                                course_id: r.course_id,
                              }, null, 2)}</pre>
                            </div>
                            {r.error_message && (
                              <div className="md:col-span-2">
                                <div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">Full error</div>
                                <pre className="text-[11px] bg-background border rounded p-2 overflow-x-auto whitespace-pre-wrap">{r.error_message}</pre>
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
              {filtered.length === 0 && (
                <tr><td colSpan={11} className="py-6 text-center text-muted-foreground">No AI gateway calls in this window.</td></tr>
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
};

export default AiGatewayCallsTab;
