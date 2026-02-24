import { useState } from "react";
import { useApp } from "@/contexts/AppContext";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Settings, Lightbulb, ShieldCheck, Save, Calendar, UserPlus, Upload, Copy, FileText } from "lucide-react";

const SettingsIntegrity = () => {
  const { taSettings, setTASettings, currentCourse } = useApp();
  const [settings, setSettings] = useState(taSettings);
  const [saved, setSaved] = useState(false);

  // Publish & Enrollment state
  const [publishSection, setPublishSection] = useState("");
  const [startDate, setStartDate] = useState(currentCourse?.startDate || "");
  const [endDate, setEndDate] = useState(currentCourse?.endDate || "");
  const [weeklyNudges, setWeeklyNudges] = useState(true);
  const [csvUploaded, setCsvUploaded] = useState(false);
  const [copied, setCopied] = useState(false);

  const update = (partial: Partial<typeof settings>) => {
    setSettings((s) => ({ ...s, ...partial }));
    setSaved(false);
  };

  const copyCode = () => {
    navigator.clipboard.writeText(currentCourse?.enrollmentCode || "NEXTOS301");
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSave = () => {
    setTASettings({ ...settings });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="p-6">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="font-heading text-3xl font-bold">Settings / Integrity</h1>
          <p className="text-muted-foreground">Adjust AI TA behavior, academic integrity, and course enrollment</p>
        </div>
        <Button onClick={handleSave}>
          <Save className="mr-2 h-4 w-4" /> {saved ? "Saved!" : "Save Changes"}
        </Button>
      </div>

      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Lightbulb className="h-5 w-5" /> Learning Behavior</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <Label className="text-sm font-medium">Hint Ladder</Label>
                <p className="text-xs text-muted-foreground">Gradually reveal hints instead of giving answers directly</p>
              </div>
              <Switch checked={settings.hintLadder} onCheckedChange={(v) => update({ hintLadder: v })} />
            </div>

            <div className="space-y-3">
              <Label className="text-sm font-medium">Knowledge Sources</Label>
              <div className="grid gap-2 sm:grid-cols-2">
                <button
                  onClick={() => update({ knowledgeSources: "uploaded" })}
                  className={`rounded-lg border p-3 text-left text-sm transition-colors ${settings.knowledgeSources === "uploaded" ? "border-primary bg-primary/5" : "hover:bg-muted"}`}
                >
                  <span className="font-medium">Uploaded Docs Only</span>
                  <p className="mt-1 text-xs text-muted-foreground">AI answers only from your course materials</p>
                </button>
                <button
                  onClick={() => update({ knowledgeSources: "uploaded_and_web" })}
                  className={`rounded-lg border p-3 text-left text-sm transition-colors ${settings.knowledgeSources === "uploaded_and_web" ? "border-primary bg-primary/5" : "hover:bg-muted"}`}
                >
                  <div className="flex items-center gap-2">
                    <span className="font-medium">Uploaded + Web Sources</span>
                    <Badge className="text-[10px]">Recommended</Badge>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">Supplements with reputable external resources</p>
                </button>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><ShieldCheck className="h-5 w-5" /> Academic Integrity</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <Label className="text-sm font-medium">Plagiarism / Similarity Warnings</Label>
                <p className="text-xs text-muted-foreground">Flags potential academic integrity issues during exam prep</p>
              </div>
              <Switch checked={settings.plagiarismWarnings} onCheckedChange={(v) => update({ plagiarismWarnings: v })} />
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
                    <SelectItem value="a">Section A</SelectItem>
                    <SelectItem value="b">Section B</SelectItem>
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
                <span className="font-mono text-2xl font-bold text-primary">{currentCourse?.enrollmentCode || "NEXTOS301"}</span>
                <button onClick={copyCode} className="rounded p-1 hover:bg-muted"><Copy className="h-4 w-4" /></button>
              </div>
              {copied && <p className="mt-1 text-xs text-primary">Copied!</p>}
            </div>

            <div className="text-center text-xs text-muted-foreground">or</div>

            {/* Current roster - always visible */}
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

            {/* Upload additional roster */}
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
