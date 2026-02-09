import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useApp } from "@/contexts/AppContext";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowRight, ArrowLeft, Eye, MessageSquare, Lightbulb, BookOpen, Clock } from "lucide-react";

const AITASettings = () => {
  const { taSettings, setTASettings } = useApp();
  const navigate = useNavigate();
  const [settings, setSettings] = useState(taSettings);

  const update = (partial: Partial<typeof settings>) => {
    setSettings((s) => ({ ...s, ...partial }));
  };

  const handleSave = () => {
    setTASettings(settings);
    navigate("/teacher/setup/content");
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-8">
      <div className="w-full max-w-3xl">
        <div className="mb-8 text-center">
          <h1 className="font-heading text-3xl font-bold">AI TA Settings</h1>
          <p className="text-muted-foreground">Configure how the AI Teaching Assistant interacts with your students</p>
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

              <div className="flex items-center justify-between">
                <div>
                  <Label className="text-sm font-medium">Plagiarism / Similarity Warnings</Label>
                  <p className="text-xs text-muted-foreground">Flags potential academic integrity issues only during exam prep test module</p>
                </div>
                <Switch checked={settings.plagiarismWarnings} onCheckedChange={(v) => update({ plagiarismWarnings: v })} />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><BookOpen className="h-5 w-5" /> Exam Simulation Rules</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-3 rounded-lg border border-dashed border-muted-foreground/30 bg-muted/30 p-6">
                <Clock className="h-8 w-8 text-muted-foreground" />
                <div>
                  <p className="text-sm font-medium text-muted-foreground">To Be Determined</p>
                  <p className="text-xs text-muted-foreground">Exam simulation rules (time limits, difficulty, question mix) will be configurable in a future update.</p>
                </div>
                <Badge variant="secondary" className="ml-auto shrink-0">TBD</Badge>
              </div>
            </CardContent>
          </Card>

          {/* Student Experience Preview — stacked below */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base"><Eye className="h-4 w-4" /> Student Experience Preview</CardTitle>
              <CardDescription>What students will see based on your settings</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="rounded-lg border bg-muted/30 p-4">
                <div className="mb-3 flex items-center gap-2">
                  <MessageSquare className="h-4 w-4 text-primary" />
                  <span className="text-sm font-medium">AI TA Chat</span>
                </div>
                <div className="space-y-3">
                  <div className="rounded-lg bg-primary/10 p-3 text-xs">
                    <p className="font-medium text-primary">AI TA</p>
                    <p className="mt-1 text-foreground">I can help you understand this concept! Let me break it down step by step...</p>
                    {settings.hintLadder && <p className="mt-1 italic text-muted-foreground">💡 Hint available — try first!</p>}
                  </div>
                  <div className="flex flex-wrap gap-1">
                    <Badge variant="outline" className="text-[10px]">Ask for Hint</Badge>
                    <Badge variant="outline" className="text-[10px]">Show Steps</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Knowledge: {settings.knowledgeSources === "uploaded" ? "Course materials only" : "Course materials + web sources"}
                    {settings.plagiarismWarnings && " · Plagiarism warnings active in exam mode"}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="flex justify-between">
            <Button variant="ghost" onClick={() => navigate("/teacher/setup/syllabus")}>
              <ArrowLeft className="mr-2 h-4 w-4" /> Back
            </Button>
            <Button onClick={handleSave}>
              Review Generated Content <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AITASettings;
