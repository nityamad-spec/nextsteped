import { Fragment, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { RefreshCw, Check, AlertCircle, ChevronDown, ChevronRight, Play } from "lucide-react";
import { toast } from "sonner";

interface WipeRow {
  id: string;
  course_id: string;
  user_id: string;
  dry_run: boolean;
  ok: boolean;
  started_at: string;
  finished_at: string;
  duration_ms: number;
  steps: Record<string, { status: string; durationMs: number; error?: string; errorCode?: string; details?: any }>;
  error: string | null;
  created_at: string;
  userEmail?: string | null;
}

const WipeAuditTab = () => {
  const [rows, setRows] = useState<WipeRow[]>([]);
  const [filter, setFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const toggle = (id: string) => setExpanded((e) => ({ ...e, [id]: !e[id] }));

  // Dry-run runner
  const [drCourseId, setDrCourseId] = useState("");
  const [drPath, setDrPath] = useState("");
  const [drWipeChat, setDrWipeChat] = useState(false);
  const [drRunning, setDrRunning] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("wipe_audit_log" as any)
      .select("*")
      .order("created_at", { ascending: false })
      .limit(100);
    const baseRows = (data as unknown as WipeRow[]) ?? [];
    const ids = Array.from(new Set(baseRows.map((r) => r.user_id).filter(Boolean)));
    let emailById = new Map<string, string | null>();
    if (ids.length > 0) {
      const { data: profs } = await supabase
        .from("profiles")
        .select("id, email")
        .in("id", ids);
      emailById = new Map((profs ?? []).map((p: any) => [p.id, p.email ?? null]));
    }
    setRows(baseRows.map((r) => ({ ...r, userEmail: emailById.get(r.user_id) ?? null })));
    setLoading(false);
  };


  useEffect(() => { void load(); }, []);

  const runDryRun = async () => {
    if (!drCourseId || !drPath) {
      toast.error("courseId and syllabusStoragePath are required");
      return;
    }
    setDrRunning(true);
    try {
      const { data, error } = await supabase.functions.invoke("wipe-syllabus-cascade", {
        body: { courseId: drCourseId, syllabusStoragePath: drPath, wipeChat: drWipeChat, dryRun: true },
      });
      if (error) toast.error(`Dry-run failed: ${error.message}`);
      else if ((data as any)?.ok === false) toast.error(`Dry-run reported failures: ${(data as any).error}`);
      else toast.success("Dry-run complete — see log below");
      await load();
    } catch (e: any) {
      toast.error(e?.message ?? "Dry-run threw");
    } finally {
      setDrRunning(false);
    }
  };

  const matches = (s: string) => !filter || s.toLowerCase().includes(filter.toLowerCase());
  const filtered = rows.filter((r) =>
    matches(r.course_id) || matches(r.user_id) || matches(r.userEmail ?? "") || matches(r.error ?? "") || matches(r.id),
  );


  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Run dry-run wipe</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-1">
              <Label className="text-xs">courseId</Label>
              <Input value={drCourseId} onChange={(e) => setDrCourseId(e.target.value)} placeholder="uuid…" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">syllabusStoragePath</Label>
              <Input value={drPath} onChange={(e) => setDrPath(e.target.value)} placeholder="<courseId>/syllabus/…pdf" />
            </div>
          </div>
          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2 text-xs">
              <Checkbox checked={drWipeChat} onCheckedChange={(v) => setDrWipeChat(!!v)} />
              Include chat sessions
            </label>
            <Button size="sm" onClick={runDryRun} disabled={drRunning} className="gap-2">
              <Play className={`h-4 w-4 ${drRunning ? "animate-pulse" : ""}`} /> Dry-run
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Dry-run counts rows and files that would be removed without changing data. Result is appended to the audit log below.
          </p>
        </CardContent>
      </Card>

      <div className="flex items-center justify-between">
        <Input
          placeholder="Filter by course_id / user / error / id…"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="max-w-md"
        />
        <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading} className="gap-2">
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Refresh
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Recent wipes ({filtered.length})</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="text-left text-muted-foreground border-b">
              <tr>
                <th className="py-2 pr-3 w-6"></th>
                <th className="py-2 pr-3">Time</th>
                <th className="py-2 pr-3">Course</th>
                <th className="py-2 pr-3">User</th>
                <th className="py-2 pr-3">Mode</th>
                <th className="py-2 pr-3">Result</th>
                <th className="py-2 pr-3">Duration</th>
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
                        <button onClick={() => toggle(r.id)} className="text-muted-foreground hover:text-foreground">
                          {isOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                        </button>
                      </td>
                      <td className="py-2 pr-3 whitespace-nowrap font-mono">
                        {new Date(r.created_at).toLocaleString()}
                      </td>
                      <td className="py-2 pr-3 font-mono text-muted-foreground" title={r.course_id}>
                        {r.course_id.slice(0, 8)}…
                      </td>
                      <td className="py-2 pr-3 font-mono text-muted-foreground" title={r.user_id}>
                        {r.user_id.slice(0, 8)}…
                      </td>
                      <td className="py-2 pr-3">
                        <Badge variant={r.dry_run ? "outline" : "secondary"}>
                          {r.dry_run ? "dry-run" : "live"}
                        </Badge>
                      </td>
                      <td className="py-2 pr-3">
                        {r.ok ? (
                          <Badge variant="outline" className="gap-1 border-primary/40 text-primary bg-primary/5">
                            <Check className="h-3 w-3" /> OK
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="gap-1 border-destructive/40 text-destructive bg-destructive/5">
                            <AlertCircle className="h-3 w-3" /> FAIL
                          </Badge>
                        )}
                      </td>
                      <td className="py-2 pr-3 font-mono text-muted-foreground">{r.duration_ms}ms</td>
                      <td className="py-2 pr-3 max-w-md">{r.error ?? "—"}</td>
                    </tr>
                    {isOpen && (
                      <tr className="border-b bg-muted/30">
                        <td></td>
                        <td colSpan={7} className="py-2 pr-3">
                          <div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">Steps</div>
                          <table className="w-full text-[11px]">
                            <thead className="text-muted-foreground">
                              <tr>
                                <th className="text-left pr-3">Step</th>
                                <th className="text-left pr-3">Status</th>
                                <th className="text-left pr-3">ms</th>
                                <th className="text-left pr-3">Error code</th>
                                <th className="text-left pr-3">Details / error</th>
                              </tr>
                            </thead>
                            <tbody>
                              {Object.entries(r.steps).map(([id, s]) => (
                                <tr key={id} className="border-t border-border/40">
                                  <td className="pr-3 font-mono">{id}</td>
                                  <td className="pr-3">
                                    <Badge
                                      variant="outline"
                                      className={
                                        s.status === "ok"
                                          ? "border-primary/40 text-primary"
                                          : s.status === "skipped"
                                            ? "text-muted-foreground"
                                            : "border-destructive/40 text-destructive"
                                      }
                                    >
                                      {s.status}
                                    </Badge>
                                  </td>
                                  <td className="pr-3 font-mono text-muted-foreground">{s.durationMs}</td>
                                  <td className="pr-3 font-mono">{s.errorCode ?? "—"}</td>
                                  <td className="pr-3">
                                    {s.error ? (
                                      <span className="text-destructive">{s.error}</span>
                                    ) : (
                                      <pre className="text-[10px] text-muted-foreground whitespace-pre-wrap">
                                        {s.details ? JSON.stringify(s.details) : "—"}
                                      </pre>
                                    )}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
              {filtered.length === 0 && (
                <tr><td colSpan={8} className="py-6 text-center text-muted-foreground">No wipe audit entries.</td></tr>
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
};

export default WipeAuditTab;
