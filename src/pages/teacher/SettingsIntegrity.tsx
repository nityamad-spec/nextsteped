import { useState } from "react";
import { useApp } from "@/contexts/AppContext";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Settings, Lightbulb, ShieldCheck, Save } from "lucide-react";

const SettingsIntegrity = () => {
  const { taSettings, setTASettings } = useApp();
  const [settings, setSettings] = useState(taSettings);
  const [examLength, setExamLength] = useState(taSettings.examTimeLimit || 60);
  const [examQuestionTypes, setExamQuestionTypes] = useState("mixed");
  const [saved, setSaved] = useState(false);

  const update = (partial: Partial<typeof settings>) => {
    setSettings((s) => ({ ...s, ...partial }));
    setSaved(false);
  };

  const handleSave = () => {
    setTASettings({ ...settings, examTimeLimit: examLength, examQuestionMix: examQuestionTypes });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="p-6">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="font-heading text-3xl font-bold">Settings / Integrity</h1>
          <p className="text-muted-foreground">Adjust AI TA behavior, exam rules, and academic integrity settings</p>
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

      </div>
    </div>
  );
};

export default SettingsIntegrity;
