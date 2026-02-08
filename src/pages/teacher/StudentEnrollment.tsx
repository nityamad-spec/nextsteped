import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useApp } from "@/contexts/AppContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Upload, ArrowRight, ArrowLeft, UserPlus, Copy } from "lucide-react";

const StudentEnrollment = () => {
  const { currentCourse, setTeacherOnboarded } = useApp();
  const navigate = useNavigate();
  const [diagnosticRequired, setDiagnosticRequired] = useState(true);
  const [weeklyNudges, setWeeklyNudges] = useState(true);
  const [csvUploaded, setCsvUploaded] = useState(false);
  const [copied, setCopied] = useState(false);

  const copyCode = () => {
    navigator.clipboard.writeText(currentCourse?.enrollmentCode || "NEXTOS301");
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleFinish = () => {
    setTeacherOnboarded(true);
    navigate("/teacher/courses/dashboard");
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-8">
      <div className="w-full max-w-3xl">
        <div className="mb-8 text-center">
          <h1 className="font-heading text-3xl font-bold">Student Enrollment</h1>
          <p className="text-muted-foreground">Add students to your course and configure onboarding</p>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><UserPlus className="h-5 w-5" /> Add Students</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-lg border bg-muted/30 p-4 text-center">
                <p className="text-sm font-medium">Course Enrollment Code</p>
                <div className="mt-2 flex items-center justify-center gap-2">
                  <span className="font-mono text-2xl font-bold text-primary">{currentCourse?.enrollmentCode || "NEXTOS301"}</span>
                  <button onClick={copyCode} className="rounded p-1 hover:bg-muted"><Copy className="h-4 w-4" /></button>
                </div>
                {copied && <p className="mt-1 text-xs text-primary">Copied!</p>}
              </div>

              <div className="text-center text-xs text-muted-foreground">or</div>

              <div
                onClick={() => setCsvUploaded(true)}
                className={`flex cursor-pointer flex-col items-center gap-2 rounded-lg border-2 border-dashed p-6 transition-colors ${
                  csvUploaded ? "border-primary/50 bg-primary/5" : "hover:border-primary/30"
                }`}
              >
                <Upload className="h-6 w-6 text-muted-foreground" />
                <span className="text-sm text-muted-foreground">{csvUploaded ? "Student roster uploaded (47 students)" : "Upload student roster (CSV)"}</span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Onboarding Settings</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <Label>Diagnostic Quiz Required</Label>
                  <p className="text-xs text-muted-foreground">Students take a placement quiz on first login</p>
                </div>
                <Switch checked={diagnosticRequired} onCheckedChange={setDiagnosticRequired} />
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <Label>Weekly Nudges</Label>
                  <p className="text-xs text-muted-foreground">Send weekly reminders to stay on track</p>
                </div>
                <Switch checked={weeklyNudges} onCheckedChange={setWeeklyNudges} />
              </div>
            </CardContent>
          </Card>

          <div className="flex justify-between">
            <Button variant="ghost" onClick={() => navigate("/teacher/setup/content")}>
              <ArrowLeft className="mr-2 h-4 w-4" /> Back
            </Button>
            <Button onClick={handleFinish}>
              Go to Dashboard <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default StudentEnrollment;
