import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useApp } from "@/contexts/AppContext";
import { mockContentItems } from "@/data/mockData";
import { ContentItem } from "@/types";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Check, Flag, RefreshCw, ArrowRight, ArrowLeft, Plus, Calendar, UserPlus, Upload, Copy, Info } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const ContentReview = () => {
  const navigate = useNavigate();
  const { currentCourse, setTeacherOnboarded } = useApp();

  // Content review state
  const [items, setItems] = useState<ContentItem[]>(mockContentItems);

  // Publish settings state
  const [publishSection, setPublishSection] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  // Enrollment state
  const [diagnosticRequired, setDiagnosticRequired] = useState(true);
  const [weeklyNudges, setWeeklyNudges] = useState(true);
  const [csvUploaded, setCsvUploaded] = useState(false);
  const [copied, setCopied] = useState(false);

  const toggleApprove = (id: string) => {
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, approved: !i.approved } : i)));
  };
  const toggleFlag = (id: string) => {
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, flagged: !i.flagged } : i)));
  };

  const copyCode = () => {
    navigator.clipboard.writeText(currentCourse?.enrollmentCode || "NEXTOS301");
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleFinish = () => {
    setTeacherOnboarded(true);
    navigate("/teacher/courses/dashboard");
  };

  const renderItem = (item: ContentItem) => (
    <div key={item.id} className={`rounded-lg border p-4 ${item.flagged ? "border-destructive/30 bg-destructive/5" : item.approved ? "border-primary/20" : ""}`}>
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Badge variant={item.difficulty === "Easy" ? "secondary" : item.difficulty === "Hard" ? "destructive" : "outline"} className="text-xs">
            {item.difficulty}
          </Badge>
          <span className="text-xs text-muted-foreground">{item.topic}</span>
        </div>
        <div className="flex gap-1">
          <button onClick={() => toggleApprove(item.id)} className={`rounded p-1.5 transition-colors ${item.approved ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}>
            <Check className="h-3.5 w-3.5" />
          </button>
          <button onClick={() => toggleFlag(item.id)} className={`rounded p-1.5 transition-colors ${item.flagged ? "bg-destructive text-destructive-foreground" : "hover:bg-muted"}`}>
            <Flag className="h-3.5 w-3.5" />
          </button>
          <button className="rounded p-1.5 hover:bg-muted"><RefreshCw className="h-3.5 w-3.5" /></button>
        </div>
      </div>
      <h4 className="text-sm font-medium">{item.title}</h4>
      <p className="mt-1 text-xs text-muted-foreground">{item.content}</p>
    </div>
  );

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-8">
      <div className="w-full max-w-4xl space-y-8">
        {/* Section 1: Review Generated Content */}
        <div>
          <div className="mb-6 flex items-center justify-between">
            <div>
              <h1 className="font-heading text-3xl font-bold">Review Generated Content</h1>
              <p className="text-muted-foreground">Approve, edit, or flag AI-generated course content</p>
            </div>
            <Button variant="outline" size="sm"><Plus className="mr-1 h-4 w-4" /> Add Custom</Button>
          </div>

          {/* Personalization note */}
          <div className="mb-6 flex items-start gap-3 rounded-lg border border-primary/20 bg-primary/5 p-4">
            <Info className="h-5 w-5 text-primary mt-0.5 shrink-0" />
            <div>
              <p className="text-sm font-medium text-foreground">This is a starting set of content</p>
              <p className="text-xs text-muted-foreground">
                This is not an exhaustive list of problems, questions, or explanations. Content will be dynamically adjusted and personalized based on individual student responses and performance throughout the course.
              </p>
            </div>
          </div>

          <Tabs defaultValue="lessons">
            <TabsList className="mb-6">
              <TabsTrigger value="lessons">Lesson Plan</TabsTrigger>
              <TabsTrigger value="practice">Practice Problems</TabsTrigger>
              <TabsTrigger value="exam">Exam Simulation</TabsTrigger>
            </TabsList>

            <TabsContent value="lessons" className="space-y-3">
              {items.filter((i) => i.type === "concept").map(renderItem)}
            </TabsContent>
            <TabsContent value="practice" className="space-y-3">
              {items.filter((i) => i.type === "practice").map(renderItem)}
            </TabsContent>
            <TabsContent value="exam" className="space-y-3">
              {items.filter((i) => i.type === "exam").map(renderItem)}
            </TabsContent>
          </Tabs>
        </div>

        {/* Section 2: Publish Settings */}
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
                    <SelectItem value="a">Section A</SelectItem>
                    <SelectItem value="b">Section B</SelectItem>
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

        {/* Section 3: Student Enrollment */}
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

            <div
              onClick={() => setCsvUploaded(true)}
              className={`flex cursor-pointer flex-col items-center gap-2 rounded-lg border-2 border-dashed p-6 transition-colors ${
                csvUploaded ? "border-primary/50 bg-primary/5" : "hover:border-primary/30"
              }`}
            >
              <Upload className="h-6 w-6 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">{csvUploaded ? "Student roster uploaded (47 students)" : "Upload student roster (CSV)"}</span>
            </div>

            <div className="space-y-3 pt-2">
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

export default ContentReview;
