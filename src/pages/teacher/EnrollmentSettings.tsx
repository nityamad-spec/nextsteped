import { useState, useEffect } from "react";
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
import { Calendar, UserPlus, Upload, Copy, FileText, ArrowLeft } from "lucide-react";
import SetupModuleNav from "@/components/SetupModuleNav";
import { markStepCompleted } from "@/lib/setupProgress";

const EnrollmentSettings = () => {
  const navigate = useNavigate();
  const courseId = useTeacherCourseId();
  const { currentCourse } = useApp();
  const { user } = useAuth();

  const [startDate, setStartDate] = useState(currentCourse?.startDate || "");
  const [endDate, setEndDate] = useState(currentCourse?.endDate || "");
  const [csvUploaded, setCsvUploaded] = useState(false);
  const [copied, setCopied] = useState(false);
  const [dbEnrollmentCode, setDbEnrollmentCode] = useState<string | null>(null);

  useEffect(() => {
    const fetchCode = async () => {
      const id = currentCourse?.id || courseId;
      if (id) {
        const { data } = await supabase
          .from("courses")
          .select("enrollment_code")
          .eq("id", id)
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
  }, [currentCourse?.id, courseId, user?.id]);

  const enrollmentCode = dbEnrollmentCode || currentCourse?.enrollmentCode || "—";

  const copyCode = () => {
    navigator.clipboard.writeText(enrollmentCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSave = async () => {
    try {
      const id = currentCourse?.id || courseId;
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

          </CardContent>
        </Card>

        <SetupModuleNav nextLabel="Save & Finish" finishMode onNext={handleSave} />
      </div>
    </div>
  );
};

export default EnrollmentSettings;
