import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Send, Loader2, ExternalLink, ClipboardList } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

const GOOGLE_SURVEY_URL = "https://forms.gle/PLACEHOLDER";

const Feedback = () => {
  const { user } = useAuth();
  const [openFeedback, setOpenFeedback] = useState("");
  const [openFeedbackSubmitting, setOpenFeedbackSubmitting] = useState(false);

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

  return (
    <div className="p-6">
      <div className="mb-8">
        <h1 className="font-heading text-3xl font-bold">Feedback</h1>
        <p className="text-muted-foreground">Share your experience with NextStep</p>
      </div>

      {/* Google Survey link */}
      <Card className="max-w-2xl mb-6">
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <ClipboardList className="h-5 w-5" />
            </div>
            <div>
              <CardTitle className="text-base">Course Survey</CardTitle>
              <CardDescription>Help us improve by completing this short survey.</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <Button asChild size="sm">
            <a href={GOOGLE_SURVEY_URL} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="mr-2 h-4 w-4" />
              Open Survey
            </a>
          </Button>
        </CardContent>
      </Card>

      {/* Open-ended feedback — always available */}
      <Card className="max-w-2xl">
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Send className="h-5 w-5" />
            </div>
            <div>
              <CardTitle className="text-base">Share Feedback Anytime</CardTitle>
              <CardDescription>Have a thought, suggestion, or issue? Let us know.</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <Textarea
            placeholder="Type your feedback here..."
            value={openFeedback}
            onChange={(e) => setOpenFeedback(e.target.value)}
            rows={3}
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
    </div>
  );
};

export default Feedback;
