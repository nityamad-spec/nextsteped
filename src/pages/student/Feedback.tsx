import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Send, Loader2, ExternalLink, ClipboardList, AlertCircle, Mail } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

const GOOGLE_SURVEY_URL = "https://docs.google.com/forms/d/e/1FAIpQLSd6J34THftst22jub9s9MyFqBFKESVA8MMqD_TplXjzeH_Zsg/viewform?usp=dialog";
const ISSUE_EMAIL = "info@nextsteped.com";

const Feedback = () => {
  const { user } = useAuth();
  const [openFeedback, setOpenFeedback] = useState("");
  const [openFeedbackSubmitting, setOpenFeedbackSubmitting] = useState(false);
  const [issueReport, setIssueReport] = useState("");

  const handleOpenFeedbackSubmit = async () => {
    if (!user || !openFeedback.trim()) return;
    setOpenFeedbackSubmitting(true);
    const { error } = await supabase.from("student_feedback").insert({
      student_id: user.id,
      additional_comments: openFeedback.trim(),
    });
    setOpenFeedbackSubmitting(false);
    if (error) {
      toast.error("Failed to submit feedback. Please try again.");
    } else {
      toast.success("Feedback submitted — thank you!");
      setOpenFeedback("");
    }
  };

  const handleIssueReport = () => {
    if (!issueReport.trim()) return;
    const subject = encodeURIComponent("NextStep issue report");
    const bodyLines = [
      issueReport.trim(),
      "",
      "---",
      user?.email ? `Reported by: ${user.email}` : "Reported by: (not signed in)",
    ];
    const body = encodeURIComponent(bodyLines.join("\n"));
    window.location.href = `mailto:${ISSUE_EMAIL}?subject=${subject}&body=${body}`;
    toast.success("Opening your email app…");
    setIssueReport("");
  };

  return (
    <div className="p-6">
      <div className="mb-8">
        <h1 className="font-heading text-3xl font-bold">Feedback</h1>
        <p className="text-muted-foreground">Share your experience with NextStep</p>
      </div>

      {/* Google Survey link */}
      <Card className="mb-6">
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <ClipboardList className="h-5 w-5" />
            </div>
            <div>
              <CardTitle className="text-base">NextStep Feedback Survey</CardTitle>
              <CardDescription>Help us improve by completing this short survey.</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <Button asChild size="sm">
            <a href={GOOGLE_SURVEY_URL} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="mr-2 h-4 w-4" />
              NextStep Feedback Survey
            </a>
          </Button>
        </CardContent>
      </Card>

      {/* Open-ended feedback — always available */}
      <Card className="mb-6">
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Send className="h-5 w-5" />
            </div>
            <div>
              <CardTitle className="text-base">Share Feedback Anytime</CardTitle>
              <CardDescription>Have a thought or suggestion? Let us know.</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <Textarea
            placeholder="Type your feedback here..."
            value={openFeedback}
            onChange={(e) => setOpenFeedback(e.target.value)}
            rows={5}
            className="w-full"
          />
          <Button
            size="sm"
            onClick={handleOpenFeedbackSubmit}
            disabled={!openFeedback.trim() || openFeedbackSubmitting}
          >
            {openFeedbackSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
            Submit Feedback
          </Button>
        </CardContent>
      </Card>

      {/* Report an issue — emails info@nextsteped.com */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-destructive/10 text-destructive">
              <AlertCircle className="h-5 w-5" />
            </div>
            <div>
              <CardTitle className="text-base">Report an Issue</CardTitle>
              <CardDescription>
                Found a bug or something not working? Send us the details and we'll take a look. Reports are emailed to{" "}
                <a href={`mailto:${ISSUE_EMAIL}`} className="underline underline-offset-2">
                  {ISSUE_EMAIL}
                </a>
                .
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <Textarea
            placeholder="Describe the issue — what you were doing, what happened, and what you expected."
            value={issueReport}
            onChange={(e) => setIssueReport(e.target.value)}
            rows={5}
            className="w-full"
          />
          <Button
            size="sm"
            onClick={handleIssueReport}
            disabled={!issueReport.trim()}
          >
            <Mail className="mr-2 h-4 w-4" />
            Email Issue Report
          </Button>
        </CardContent>
      </Card>
    </div>
  );
};

export default Feedback;
