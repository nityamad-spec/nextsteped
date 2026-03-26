import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useApp } from "@/contexts/AppContext";
import { defaultStudyPrompt, defaultExamPrompt } from "@/data/mockData";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ArrowRight, ArrowLeft, MessageSquare, BookOpen, Brain, Info } from "lucide-react";
import SetupProgressBar from "@/components/SetupProgressBar";

const AITASettings = () => {
  const { taSettings, setTASettings } = useApp();
  const navigate = useNavigate();
  const [customStudyPrompt, setCustomStudyPrompt] = useState(taSettings.customStudyPrompt || "");
  const [customExamPrompt, setCustomExamPrompt] = useState(taSettings.customExamPrompt || "");

  const handleSave = () => {
    setTASettings({
      ...taSettings,
      customStudyPrompt,
      customExamPrompt,
    });
    navigate("/teacher/setup/exam-mode");
  };

  return (
    <div className="min-h-screen bg-background px-4 py-8">
      <div className="mx-auto w-full max-w-3xl">
        <SetupProgressBar currentStep={6} />
        <div className="mb-8 text-center">
          <h1 className="font-heading text-3xl font-bold">AI Teaching Assistant <span className="text-primary">Settings</span></h1>
          <p className="text-muted-foreground">Configure the AI instructions that guide how the Teaching Assistant interacts with your students</p>
        </div>

        <div className="space-y-6">
          {/* Guidelines */}
          <div className="flex items-start gap-3 rounded-lg border border-primary/20 bg-primary/5 px-4 py-3">
            <Info className="h-4 w-4 text-primary mt-0.5 shrink-0" />
            <div className="space-y-1">
              <p className="text-sm font-medium text-foreground">About Custom Instructions</p>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Each mode has built-in system instructions (shown below in gray). You can add <strong>custom instructions</strong> to tailor the AI's behavior to your specific course. Consider adding:
              </p>
              <ul className="text-xs text-muted-foreground space-y-0.5 mt-1 ml-3 list-disc">
                <li>How deep the AI should go when explaining concepts (brief overview vs. detailed breakdown)</li>
                <li>Specific ways to reference examples, frameworks, or terminology from your course</li>
                <li>Tone and language preferences (formal, conversational, encouraging)</li>
                <li>Topics to emphasize or de-emphasize based on your syllabus</li>
                <li>Course-specific context the AI should be aware of (e.g., prerequisites, student background)</li>
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

          {/* Exam Prep Mode Instructions */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Brain className="h-4 w-4 text-primary" /> Exam Prep Mode Instructions
              </CardTitle>
              <CardDescription>Controls how the AI behaves during exam preparation and practice questions</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">System Default Instructions</Label>
                <div className="rounded-lg border bg-muted/40 p-4">
                  <Textarea
                    value={defaultExamPrompt}
                    disabled
                    rows={6}
                    className="font-mono text-xs bg-transparent border-none p-0 opacity-60 cursor-not-allowed resize-none focus-visible:ring-0 focus-visible:ring-offset-0"
                  />
                </div>
                <p className="text-[11px] text-muted-foreground italic">These default instructions cannot be changed — they ensure fair and consistent exam preparation.</p>
              </div>

              <div className="space-y-2">
                <Label className="text-xs font-medium uppercase tracking-wider">Your Custom Instructions</Label>
                <Textarea
                  value={customExamPrompt}
                  onChange={(e) => setCustomExamPrompt(e.target.value)}
                  rows={5}
                  className="text-sm leading-relaxed"
                  placeholder="Add course-specific instructions for Exam Prep Mode here...&#10;&#10;Example: 'Focus exam questions on Modules 1-3 for midterm prep. Include at least one question about error handling in every practice set. Use Python 3.11 syntax in all code examples.'"
                />
                <p className="text-[11px] text-muted-foreground">These will be combined with the system defaults above to guide the AI during exam preparation.</p>
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
