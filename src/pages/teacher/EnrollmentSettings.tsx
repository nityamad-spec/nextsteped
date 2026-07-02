import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useApp } from "@/contexts/AppContext";
import { useAuth } from "@/contexts/AuthContext";
import { useTeacherCourseId } from "@/hooks/useTeacherCourseId";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Calendar, UserPlus, Upload, Copy, ArrowLeft, Trash2, Download, AlertTriangle } from "lucide-react";
import SetupModuleNav from "@/components/SetupModuleNav";
import { markStepCompleted } from "@/lib/setupProgress";

type RosterEntry = { id: string; email: string; full_name: string | null; university: string | null };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function parseCsv(text: string): { email: string; full_name: string | null; university: string | null }[] {
  const rows: { email: string; full_name: string | null; university: string | null }[] = [];
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length === 0) return rows;
  // Detect header
  const first = lines[0].toLowerCase();
  let emailIdx = 0;
  let nameIdx = -1;
  let uniIdx = -1;
  let start = 0;
  if (first.includes("email")) {
    const headers = lines[0].split(",").map((h) => h.trim().toLowerCase());
    emailIdx = headers.findIndex((h) => h === "email" || h === "email_address" || h === "e-mail");
    nameIdx = headers.findIndex((h) => h === "name" || h === "full_name" || h === "fullname" || h === "student_name");
    uniIdx = headers.findIndex((h) => h === "university" || h === "school" || h === "institution" || h === "college");
    if (emailIdx === -1) emailIdx = 0;
    start = 1;
  }
  for (let i = start; i < lines.length; i++) {
    const cols = lines[i].split(",").map((c) => c.trim().replace(/^"|"$/g, ""));
    const email = (cols[emailIdx] || "").trim().toLowerCase();
    const name = nameIdx >= 0 ? (cols[nameIdx] || "").trim() : "";
    const uni = uniIdx >= 0 ? (cols[uniIdx] || "").trim() : "";
    if (email) rows.push({ email, full_name: name || null, university: uni || null });
  }
  return rows;
}


const EnrollmentSettings = () => {
  const navigate = useNavigate();
  const courseId = useTeacherCourseId();
  const { currentCourse } = useApp();
  const { user } = useAuth();

  const [startDate, setStartDate] = useState(currentCourse?.startDate || "");
  const [endDate, setEndDate] = useState(currentCourse?.endDate || "");
  const [copied, setCopied] = useState(false);
  const [dbEnrollmentCode, setDbEnrollmentCode] = useState<string | null>(null);
  const [roster, setRoster] = useState<RosterEntry[]>([]);
  const [enforcement, setEnforcement] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [manualEmails, setManualEmails] = useState("");
  const [adding, setAdding] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const effectiveCourseId = currentCourse?.id || courseId;

  useEffect(() => {
    const fetchCourse = async () => {
      if (effectiveCourseId) {
        const { data } = await supabase
          .from("courses")
          .select("enrollment_code, roster_enforcement")
          .eq("id", effectiveCourseId)
          .maybeSingle();
        if (data?.enrollment_code) setDbEnrollmentCode(data.enrollment_code);
        setEnforcement(!!(data as any)?.roster_enforcement);
        return;
      }
      if (user?.id) {
        const { data } = await supabase
          .from("courses")
          .select("enrollment_code")
          .eq("teacher_id", user.id)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (data?.enrollment_code) setDbEnrollmentCode(data.enrollment_code);
      }
    };
    fetchCourse();
  }, [effectiveCourseId, user?.id]);

  const loadRoster = useCallback(async () => {
    if (!effectiveCourseId) return;
    const { data, error } = await supabase
      .from("course_roster_allowlist")
      .select("id, email, full_name, university")
      .eq("course_id", effectiveCourseId)
      .order("created_at", { ascending: false });
    if (!error && data) setRoster(data as RosterEntry[]);
  }, [effectiveCourseId]);

  useEffect(() => { loadRoster(); }, [loadRoster]);

  const enrollmentCode = dbEnrollmentCode || currentCourse?.enrollmentCode || "—";

  const copyCode = () => {
    navigator.clipboard.writeText(enrollmentCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleFile = async (file: File) => {
    if (!effectiveCourseId) {
      toast.error("Course not loaded yet. Please try again.");
      return;
    }
    setUploading(true);
    try {
      const text = await file.text();
      const parsed = parseCsv(text);
      if (parsed.length === 0) {
        toast.error("No rows found in the CSV.");
        return;
      }
      const seen = new Set<string>();
      const valid: { email: string; full_name: string | null; university: string | null }[] = [];
      let invalid = 0;
      for (const r of parsed) {
        if (!EMAIL_RE.test(r.email)) { invalid++; continue; }
        if (seen.has(r.email)) continue;
        seen.add(r.email);
        valid.push(r);
      }
      if (valid.length === 0) {
        toast.error(`No valid emails found (${invalid} invalid rows).`);
        return;
      }
      const rows = valid.map((r) => ({
        course_id: effectiveCourseId,
        email: r.email,
        full_name: r.full_name,
        university: r.university,
        added_by: user?.id ?? null,
        source: "csv",
      }));
      // Batch upsert
      const batchSize = 500;
      let inserted = 0;
      for (let i = 0; i < rows.length; i += batchSize) {
        const batch = rows.slice(i, i + batchSize);
        const { error } = await supabase
          .from("course_roster_allowlist")
          .upsert(batch, { onConflict: "course_id,email" });
        if (error) throw error;
        inserted += batch.length;
      }
      toast.success(`Added ${inserted} email${inserted === 1 ? "" : "s"} to roster${invalid ? ` (${invalid} skipped)` : ""}.`);
      await loadRoster();
      if (!enforcement) {
        toast.info("Tip: turn on 'Restrict signups to roster' to enforce.", { duration: 6000 });
      }
    } catch (e: any) {
      console.error(e);
      toast.error(e?.message || "Failed to upload roster.");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const handleManualAdd = async () => {
    if (!effectiveCourseId) {
      toast.error("Course not loaded yet. Please try again.");
      return;
    }
    const tokens = manualEmails.split(/[\s,;]+/).map((t) => t.trim().toLowerCase()).filter(Boolean);
    if (tokens.length === 0) {
      toast.error("Enter at least one email.");
      return;
    }
    const existing = new Set(roster.map((r) => r.email.toLowerCase()));
    const seen = new Set<string>();
    const valid: string[] = [];
    let invalid = 0;
    let duplicates = 0;
    for (const t of tokens) {
      if (!EMAIL_RE.test(t)) { invalid++; continue; }
      if (seen.has(t)) { duplicates++; continue; }
      seen.add(t);
      if (existing.has(t)) { duplicates++; continue; }
      valid.push(t);
    }
    if (valid.length === 0) {
      toast.error(`No new valid emails (${invalid} invalid, ${duplicates} duplicate).`);
      return;
    }
    setAdding(true);
    try {
      const rows = valid.map((email) => ({
        course_id: effectiveCourseId,
        email,
        full_name: null,
        university: null,
        added_by: user?.id ?? null,
        source: "manual",
      }));
      const batchSize = 500;
      for (let i = 0; i < rows.length; i += batchSize) {
        const batch = rows.slice(i, i + batchSize);
        const { error } = await supabase
          .from("course_roster_allowlist")
          .upsert(batch, { onConflict: "course_id,email" });
        if (error) throw error;
      }
      const parts = [`Added ${valid.length}`];
      if (duplicates) parts.push(`${duplicates} duplicate${duplicates === 1 ? "" : "s"}`);
      if (invalid) parts.push(`${invalid} invalid`);
      toast.success(parts.join(", ") + ".");
      setManualEmails("");
      await loadRoster();
      if (!enforcement) {
        toast.info("Tip: turn on 'Restrict signups to roster' to enforce.", { duration: 6000 });
      }
    } catch (e: any) {
      console.error(e);
      toast.error(e?.message || "Failed to add emails.");
    } finally {
      setAdding(false);
    }
  };

  const deleteEntry = async (id: string) => {
    const { error } = await supabase.from("course_roster_allowlist").delete().eq("id", id);
    if (error) { toast.error("Failed to remove entry."); return; }
    setRoster((r) => r.filter((x) => x.id !== id));
  };

  const [clearing, setClearing] = useState(false);
  const clearRoster = async () => {
    if (!effectiveCourseId || roster.length === 0) return;
    setClearing(true);
    try {
      const { error } = await supabase
        .from("course_roster_allowlist")
        .delete()
        .eq("course_id", effectiveCourseId);
      if (error) throw error;
      setRoster([]);
      toast.success("Cleared all roster entries.");
    } catch (e: any) {
      toast.error(e?.message || "Failed to clear roster.");
    } finally {
      setClearing(false);
    }
  };

  const toggleEnforcement = async (val: boolean) => {
    if (!effectiveCourseId) return;
    setEnforcement(val);
    const { error } = await supabase
      .from("courses")
      .update({ roster_enforcement: val } as any)
      .eq("id", effectiveCourseId);
    if (error) {
      toast.error("Failed to update enforcement setting.");
      setEnforcement(!val);
    } else {
      toast.success(val ? "Roster enforcement enabled." : "Roster enforcement disabled.");
    }
  };

  const downloadTemplate = () => {
    const csv = "email,full_name,university\nstudent@example.edu,Jane Doe,Example University\n";
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "roster_template.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleSave = async () => {
    try {
      const id = effectiveCourseId;
      if (id) {
        const updates: { start_date?: string | null; end_date?: string | null } = {};
        if (startDate) updates.start_date = startDate;
        if (endDate) updates.end_date = endDate;
        if (Object.keys(updates).length > 0) {
          const { error } = await supabase.from("courses").update(updates).eq("id", id);
          if (error) throw error;
        }
      }
      if (user?.id) await markStepCompleted(user.id, "enrollment", id || courseId, { source: "EnrollmentSettings.save" });
      toast.success("Enrollment settings saved");
    } catch {
      toast.error("Failed to save settings. Please try again.");
      throw new Error("save failed");
    }
  };

  const visibleRoster = showAll ? roster : roster.slice(0, 8);

  return (
    <div className="min-h-screen bg-background p-6 md:p-8">
      <div className="mx-auto max-w-3xl space-y-8">
        <div>
          <Button variant="outline" size="sm" onClick={() => navigate("/teacher/setup")} className="gap-2 mb-4">
            <ArrowLeft className="h-4 w-4" /> Back to Course Setup
          </Button>
          <h1 className="font-heading text-3xl font-bold">Enrollment & Course Settings</h1>
          <p className="text-muted-foreground mt-1">
            Configure your course schedule, sections, enrollment code, and student roster.
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Calendar className="h-5 w-5" /> Publish Settings</CardTitle>
            <CardDescription>Configure course sections and schedule</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Start Date</Label>
                <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>End Date</Label>
                <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><UserPlus className="h-5 w-5" /> Student Enrollment</CardTitle>
            <CardDescription>Manage student roster and onboarding settings</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-lg border bg-muted/30 p-4 text-center">
              <p className="text-sm font-medium">Course Enrollment Code</p>
              <div className="mt-2 flex items-center justify-center gap-2">
                <span className="font-mono text-2xl font-bold text-primary">{enrollmentCode}</span>
                <button onClick={copyCode} className="rounded p-1 hover:bg-muted"><Copy className="h-4 w-4" /></button>
              </div>
              {copied && <p className="mt-1 text-xs text-primary">Copied!</p>}
            </div>

            <div className="text-center text-xs text-muted-foreground">and / or</div>

            {/* Roster summary */}
            <div className="rounded-lg border p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">Approved Roster</p>
                  <p className="text-xs text-muted-foreground">
                    {roster.length === 0
                      ? "No emails on the roster yet."
                      : `${roster.length} email${roster.length === 1 ? "" : "s"} approved.`}
                  </p>
                </div>
                <Badge variant="secondary" className="text-xs">{roster.length}</Badge>
              </div>

              <div className="flex items-center justify-between rounded-md bg-muted/40 p-3">
                <div className="pr-4">
                  <Label htmlFor="enforce" className="text-sm font-medium">Restrict signups to roster</Label>
                  <p className="text-xs text-muted-foreground">When on, only emails in the roster can sign up with the enrollment code.</p>
                </div>
                <Switch id="enforce" checked={enforcement} onCheckedChange={toggleEnforcement} />
              </div>

              {enforcement && roster.length === 0 && (
                <Alert variant="destructive">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertDescription>
                    Enforcement is on but the roster is empty — no one can sign up. Upload a CSV or turn enforcement off.
                  </AlertDescription>
                </Alert>
              )}

              {roster.length > 0 && (
                <div className="space-y-1 max-h-64 overflow-y-auto">
                  {visibleRoster.map((r) => (
                    <div key={r.id} className="flex items-center justify-between rounded px-2 py-1 text-sm hover:bg-muted/50">
                      <div className="min-w-0 flex-1 truncate">
                        <span className="font-mono text-xs">{r.email}</span>
                        {r.full_name && <span className="ml-2 text-xs text-muted-foreground">— {r.full_name}</span>}
                        {r.university && <span className="ml-2 text-xs text-muted-foreground">· {r.university}</span>}
                      </div>
                      <button onClick={() => deleteEntry(r.id)} className="ml-2 rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                  {roster.length > 8 && (
                    <button onClick={() => setShowAll((s) => !s)} className="w-full text-xs text-primary hover:underline pt-1">
                      {showAll ? "Show less" : `Show all ${roster.length}`}
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Manual entry */}
            <div className="rounded-lg border p-4 space-y-2">
              <Label htmlFor="manual-emails" className="text-sm font-medium">Add emails manually</Label>
              <Textarea
                id="manual-emails"
                value={manualEmails}
                onChange={(e) => setManualEmails(e.target.value)}
                placeholder="Paste or type emails — one per line, or separated by commas/semicolons/spaces"
                rows={4}
                disabled={adding}
              />
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs text-muted-foreground">
                  Names/universities aren't supported here — use the CSV upload for those.
                </p>
                <Button
                  size="sm"
                  onClick={handleManualAdd}
                  disabled={adding || !manualEmails.trim()}
                >
                  {adding ? "Adding…" : "Add to roster"}
                </Button>
              </div>
            </div>

            {/* Upload */}
            <input
              ref={fileRef}
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleFile(f);
              }}
            />
            <div
              onClick={() => !uploading && fileRef.current?.click()}
              className="flex cursor-pointer flex-col items-center gap-2 rounded-lg border-2 border-dashed p-6 transition-colors hover:border-primary/30"
            >
              <Upload className="h-6 w-6 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">
                {uploading ? "Uploading…" : "Upload roster CSV (email, full_name, university)"}
              </span>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); downloadTemplate(); }}
                className="text-xs text-primary hover:underline inline-flex items-center gap-1"
              >
                <Download className="h-3 w-3" /> Download CSV template
              </button>
            </div>

          </CardContent>
        </Card>

        <SetupModuleNav nextLabel="Save & Finish" finishMode onNext={handleSave} />
      </div>
    </div>
  );
};

export default EnrollmentSettings;
