import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useTeacherCourseId } from "@/hooks/useTeacherCourseId";
import { useTASettings } from "@/hooks/useTASettings";
import { useAuth } from "@/contexts/AuthContext";
import { markStepCompleted } from "@/lib/setupProgress";
import { defaultStudyPrompt } from "@/data/mockData";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { BookOpen, Info, ArrowLeft } from "lucide-react";
import SetupModuleNav from "@/components/SetupModuleNav";

const AIAssistantAndSettings = () => {
  const navigate = useNavigate();
  const courseId = useTeacherCourseId();
  const { user } = useAuth();
  const { taSettings, loading, saveTASettings } = useTASettings(courseId);

  const [customStudyPrompt, setCustomStudyPrompt] = useState("");

  useEffect(() => {
    if (!loading) setCustomStudyPrompt(taSettings.customStudyPrompt || "");
  }, [loading, taSettings]);

  const handleSaveAll = async () => {
    try {
      await saveTASettings({ ...taSettings, customStudyPrompt });
      if (user?.id) await markStepCompleted(user.id, "ai-settings", courseId);
      toast.success("Settings saved");
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
          <h1 className="font-heading text-3xl font-bold">AI Assistant Settings</h1>
          <p className="text-muted-foreground mt-1">
            Configure how your Student AI TA behaves in Study Mode.
          </p>
        </div>

        <section className="space-y-4">
          <div>
            <h2 className="text-lg font-semibold">Student AI TA Configuration</h2>
            <p className="text-sm text-muted-foreground">Guardrails, tone, and content guidance for the student-facing AI tutor.</p>
          </div>

          <div className="flex items-start gap-3 rounded-lg border border-primary/20 bg-primary/5 px-4 py-3">
            <Info className="h-4 w-4 text-primary mt-0.5 shrink-0" />
            <div className="space-y-1">
              <p className="text-sm font-medium text-foreground">About Custom Instructions</p>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Add any <strong>course-specific or professor-specific context</strong> the AI should know when helping your students. For example:
              </p>
              <ul className="text-xs text-muted-foreground space-y-0.5 mt-1 ml-3 list-disc">
                <li>Textbook or reference materials students should be directed to</li>
                <li>Prerequisites or background knowledge students are expected to have</li>
                <li>Topics that are out of scope for this course</li>
              </ul>
            </div>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <BookOpen className="h-4 w-4 text-primary" /> Study Mode Instructions
              </CardTitle>
              <CardDescription>Controls how the AI behaves when students are studying and asking questions</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">System Default Instructions</Label>
                <div className="rounded-lg border bg-muted/40 p-4">
                  <Textarea
                    value={defaultStudyPrompt}
                    disabled
                    rows={6}
                    className="font-mono text-xs bg-transparent border-none p-0 opacity-60 cursor-not-allowed resize-none focus-visible:ring-0 focus-visible:ring-offset-0"
                  />
                </div>
                <p className="text-[11px] text-muted-foreground italic">These default instructions cannot be changed — they ensure the AI maintains consistent, safe teaching behavior.</p>
              </div>

              <div className="space-y-2">
                <Label className="text-xs font-medium uppercase tracking-wider">Your Custom Instructions</Label>
                <Textarea
                  value={customStudyPrompt}
                  onChange={(e) => setCustomStudyPrompt(e.target.value)}
                  rows={5}
                  className="text-sm leading-relaxed"
                  placeholder="Add course-specific instructions for Study Mode here..."
                />
                <p className="text-[11px] text-muted-foreground">These will be combined with the system defaults above to guide the AI.</p>
              </div>
            </CardContent>
          </Card>
        </section>

        <SetupModuleNav
          nextPath="/teacher/setup/exam-mode"
          nextLabel="Save & Continue to Exam Mode"
          onNext={handleSaveAll}
        />
      </div>
    </div>
  );
};

export default AIAssistantAndSettings;
