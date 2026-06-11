import { useState, useEffect } from "react";
import { useApp } from "@/contexts/AppContext";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Save, Calendar, UserPlus, Upload, Copy, FileText, Target, Loader2 } from "lucide-react";
import { toast } from "sonner";

const SettingsIntegrity = () => {
  const { currentCourse } = useApp();
  const { user } = useAuth();
  const [saved, setSaved] = useState(false);

  const [publishSection, setPublishSection] = useState("");
  const [startDate, setStartDate] = useState(currentCourse?.startDate || "");
  const [endDate, setEndDate] = useState(currentCourse?.endDate || "");
  const [weeklyNudges, setWeeklyNudges] = useState(true);
  const [csvUploaded, setCsvUploaded] = useState(false);
  const [copied, setCopied] = useState(false);
  const [dbEnrollmentCode, setDbEnrollmentCode] = useState<string | null>(null);

  const [courseId, setCourseId] = useState<string | null>(null);
  const [objectivesText, setObjectivesText] = useState("");
  const [objectivesLoading, setObjectivesLoading] = useState(true);
  const [objectivesSaving, setObjectivesSaving] = useState(false);
  const [objectivesSavedAt, setObjectivesSavedAt] = useState<Date | null>(null);

  useEffect(() => {
    const loadObjectives = async () => {
      setObjectivesLoading(true);
      let id = currentCourse?.id ?? null;
      if (!id && user?.id) {
        const { data } = await supabase
          .from("courses")
          .select("id")
          .eq("teacher_id", user.id)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        id = data?.id ?? null;
      }
      if (!id) { setObjectivesLoading(false); return; }
      setCourseId(id);
      const { data } = await supabase
        .from("courses")
        .select("objectives")
        .eq("id", id)
        .maybeSingle();
      const arr = Array.isArray(data?.objectives) ? (data!.objectives as string[]) : [];
      setObjectivesText(arr.join("\n"));
      setObjectivesLoading(false);
    };
    loadObjectives();
  }, [currentCourse?.id, user?.id]);

  const objectivesList = objectivesText
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);

  const saveObjectives = async () => {
    if (!courseId) {
      toast.error("No course found to update");
      return;
    }
    setObjectivesSaving(true);
    const { error } = await supabase
      .from("courses")
      .update({ objectives: objectivesList })
      .eq("id", courseId);
    setObjectivesSaving(false);
    if (error) {
      toast.error(`Failed to save: ${error.message}`);
      return;
    }
    setObjectivesSavedAt(new Date());
    toast.success("Course objectives saved");
  };


  useEffect(() => {
    const fetchCode = async () => {
      const courseId = currentCourse?.id;
      if (courseId) {
        const { data } = await supabase
          .from("courses")
          .select("enrollment_code")
          .eq("id", courseId)
          .maybeSingle();
        if (data?.enrollment_code) { setDbEnrollmentCode(data.enrollment_code); return; }
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
    fetchCode();
  }, [currentCourse?.id, user?.id]);

  const enrollmentCode = dbEnrollmentCode || currentCourse?.enrollmentCode || "—";

  const copyCode = () => {
    navigator.clipboard.writeText(enrollmentCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSave = () => {
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="p-6">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="font-heading text-3xl font-bold">Settings</h1>
          <p className="text-muted-foreground">Manage course schedule, enrollment, and preferences</p>
        </div>
        <Button onClick={handleSave}>
          <Save className="mr-2 h-4 w-4" /> {saved ? "Saved!" : "Save Changes"}
        </Button>
      </div>

      <div className="space-y-6">
        {/* Course Objectives */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Target className="h-5 w-5" /> Course Objectives</CardTitle>
            <CardDescription>One objective per line. Saved as a list.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Textarea
              value={objectivesText}
              onChange={(e) => setObjectivesText(e.target.value)}
              rows={8}
              placeholder={objectivesLoading ? "Loading…" : "e.g. Understand variables and data types\nWrite functions and use control flow\n…"}
              disabled={objectivesLoading || objectivesSaving}
              className="font-mono text-sm"
            />
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
              <span>
                {objectivesList.length} objective{objectivesList.length === 1 ? "" : "s"}
                {objectivesSavedAt && ` · Saved ${objectivesSavedAt.toLocaleTimeString()}`}
              </span>
              <Button size="sm" onClick={saveObjectives} disabled={objectivesLoading || objectivesSaving || !courseId}>
                {objectivesSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                Save Objectives
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Publish Settings */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Calendar className="h-5 w-5" /> Publish Settings</CardTitle>
            <CardDescription>Configure course sections and schedule</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-2">
                <Label>Sections</Label>
                <Select value={publishSection} onValueChange={setPublishSection}>
                  <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Sections</SelectItem>
                    {(currentCourse?.sections ?? []).length === 0 ? (
                      <SelectItem value="__none__" disabled>No sections added yet</SelectItem>
                    ) : (
                      (currentCourse?.sections ?? []).map((s) => (
                        <SelectItem key={s} value={s}>{s}</SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Start Date</Label>
                <Input type="date" value={startDate} onChange={(e) => { setStartDate(e.target.value); setSaved(false); }} />
              </div>
              <div className="space-y-2">
                <Label>End Date</Label>
                <Input type="date" value={endDate} onChange={(e) => { setEndDate(e.target.value); setSaved(false); }} />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Student Enrollment */}
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

            <div className="text-center text-xs text-muted-foreground">or</div>

            <div className="rounded-lg border bg-primary/5 p-4 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <FileText className="h-4 w-4 text-primary" />
                  <span className="text-sm font-medium">student_roster_fall2025.csv</span>
                </div>
                <Badge variant="secondary" className="text-xs">47 students</Badge>
              </div>
              <p className="text-xs text-muted-foreground">Uploaded during initial setup</p>
            </div>

            <div
              onClick={() => setCsvUploaded(true)}
              className="flex cursor-pointer flex-col items-center gap-2 rounded-lg border-2 border-dashed p-6 transition-colors hover:border-primary/30"
            >
              <Upload className="h-6 w-6 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">Upload additional roster (CSV)</span>
            </div>

            <div className="space-y-3 pt-2">
              <div className="flex items-center justify-between">
                <div>
                  <Label>Weekly Nudges</Label>
                  <p className="text-xs text-muted-foreground">Send weekly reminders to stay on track</p>
                </div>
                <Switch checked={weeklyNudges} onCheckedChange={setWeeklyNudges} />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default SettingsIntegrity;
