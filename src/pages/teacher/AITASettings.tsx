import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useTASettings } from "@/hooks/useTASettings";
import { useTeacherCourseId } from "@/hooks/useTeacherCourseId";
import { defaultStudyPrompt } from "@/data/mockData";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ArrowRight, ArrowLeft, BookOpen, Info } from "lucide-react";
import SetupProgressBar from "@/components/SetupProgressBar";

const AITASettings = () => {
  const courseId = useTeacherCourseId();
  const { taSettings, loading, saveTASettings } = useTASettings(courseId);
  const navigate = useNavigate();
  const [customStudyPrompt, setCustomStudyPrompt] = useState("");

  useEffect(() => {
    if (!loading) {
      setCustomStudyPrompt(taSettings.customStudyPrompt || "");
    }
  }, [loading, taSettings]);

  const handleSave = async () => {
    try {
      await saveTASettings({
        ...taSettings,
        customStudyPrompt,
      });
      navigate("/teacher/setup/exam-mode");
    } catch {
      toast.error("Failed to save settings. Please try again.");
    }
  };

  return (
    <div className="min-h-screen bg-background px-4 py-8">
      <div className="mx-auto w-full max-w-3xl">
        <SetupProgressBar currentStep={7} />

        <div className="mb-8 text-center">
          <h1 className="font-heading text-3xl font-bold">AI Study Assistant <span className="text-primary">Settings</span></h1>
          <p className="text-muted-foreground">Configure the AI instructions that guide how the Teaching Assistant interacts with your students in Study Mode</p>
        </div>

        <div className="space-y-6">
          {/* Guidelines */}
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

          {/* Study Mode Instructions */}
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
                  placeholder="Add course-specific instructions for Study Mode here...&#10;&#10;Example: 'When explaining data structures, always relate them to real-world analogies. Encourage students to think about time complexity before writing code. Reference the textbook chapters when applicable.'"
                />
                <p className="text-[11px] text-muted-foreground">These will be combined with the system defaults above to guide the AI.</p>
              </div>
            </CardContent>
          </Card>

          <div className="flex justify-between">
            <Button variant="ghost" onClick={() => navigate("/teacher/setup/diagnostic")}>
              <ArrowLeft className="mr-2 h-4 w-4" /> Back
            </Button>
            <Button onClick={handleSave}>
              Continue to Exam Mode <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AITASettings;
