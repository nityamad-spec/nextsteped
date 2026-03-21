import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useApp } from "@/contexts/AppContext";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { ArrowRight, ArrowLeft, Calendar, UserPlus, Upload, Copy, Info, Check } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import SetupProgressBar from "@/components/SetupProgressBar";

const PublishEnrollment = () => {
  const navigate = useNavigate();
  const { currentCourse, setTeacherOnboarded } = useApp();

  const courseSections = currentCourse?.sections || [];
  const hasMultipleSections = courseSections.length > 1;

  const [publishSection, setPublishSection] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [weeklyNudges, setWeeklyNudges] = useState(true);
  const [csvUploaded, setCsvUploaded] = useState<Record<string, boolean>>({});
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

  const handleCsvUpload = (section?: string) => {
    const key = section || "all";
    setCsvUploaded((prev) => ({ ...prev, [key]: true }));
  };

  return (
    <div className="min-h-screen bg-background px-4 py-8">
      <div className="mx-auto w-full max-w-4xl space-y-8">
        <SetupProgressBar currentStep={6} />
        <div>
          <h1 className="font-heading text-3xl font-bold">Publish & Enroll Students</h1>
          <p className="text-muted-foreground">Configure publish settings and add students to your course</p>
        </div>

        {/* Publish Settings */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Calendar className="h-5 w-5" /> Publish Settings</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-2">
                <Label>Sections</Label>
                <Select value={publishSection} onValueChange={setPublishSection}>
                  <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Sections</SelectItem>
                    {courseSections.map((s) => (
                      <SelectItem key={s} value={s}>{s}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
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

        {/* Student Enrollment */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><UserPlus className="h-5 w-5" /> Student Enrollment</CardTitle>
            <CardDescription>Add students and configure onboarding settings</CardDescription>
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

            {/* Roster format info */}
            <div className="flex items-start gap-3 rounded-lg border border-primary/20 bg-primary/5 p-4">
              <Info className="h-5 w-5 text-primary mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-medium text-foreground">Student Roster Format</p>
                <p className="text-xs text-muted-foreground">
                  The uploaded student roster should include <strong>Student Full Name</strong> and <strong>Roll Number</strong> for each student. Accepted formats: CSV or Excel.
                </p>
              </div>
            </div>

            {/* Upload per section or single upload */}
            {hasMultipleSections ? (
              <div className="space-y-3">
                <p className="text-sm font-medium text-muted-foreground">Upload a roster for each section:</p>
                {courseSections.map((section) => (
                  <div
                    key={section}
                    onClick={() => handleCsvUpload(section)}
                    className={`flex cursor-pointer items-center gap-3 rounded-lg border-2 border-dashed p-4 transition-colors ${
                      csvUploaded[section] ? "border-primary/50 bg-primary/5" : "hover:border-primary/30"
                    }`}
                  >
                    {csvUploaded[section] ? (
                      <Check className="h-5 w-5 text-primary shrink-0" />
                    ) : (
                      <Upload className="h-5 w-5 text-muted-foreground shrink-0" />
                    )}
                    <div>
                      <p className="text-sm font-medium">{section}</p>
                      <p className="text-xs text-muted-foreground">
                        {csvUploaded[section] ? "Roster uploaded" : "Click to upload student roster (CSV)"}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div
                onClick={() => handleCsvUpload()}
                className={`flex cursor-pointer flex-col items-center gap-2 rounded-lg border-2 border-dashed p-6 transition-colors ${
                  csvUploaded["all"] ? "border-primary/50 bg-primary/5" : "hover:border-primary/30"
                }`}
              >
                <Upload className="h-6 w-6 text-muted-foreground" />
                <span className="text-sm text-muted-foreground">{csvUploaded["all"] ? "Student roster uploaded" : "Upload student roster (CSV)"}</span>
              </div>
            )}

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

        {/* Navigation */}
        <div className="flex justify-between pb-8">
          <Button variant="ghost" onClick={() => navigate("/teacher/setup/settings")}>
            <ArrowLeft className="mr-2 h-4 w-4" /> Back
          </Button>
          <Button onClick={handleFinish}>
            Publish & Go to Dashboard <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
};

export default PublishEnrollment;
