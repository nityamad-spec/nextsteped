import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MessageSquareHeart, Send, CheckCircle } from "lucide-react";

const ratingOptions = [
  { value: "5", label: "Strongly Agree" },
  { value: "4", label: "Agree" },
  { value: "3", label: "Neutral" },
  { value: "2", label: "Disagree" },
  { value: "1", label: "Strongly Disagree" },
];

const questions = [
  { id: "helpful", label: "I found the AI Teaching Assistant helpful in my learning." },
  { id: "easy_to_use", label: "The tool was easy to use and navigate." },
  { id: "easy_to_understand", label: "The explanations and responses were easy to understand." },
  { id: "would_use_again", label: "I would use this tool again if available at my university." },
  { id: "improved_understanding", label: "Using this tool improved my understanding of the course material." },
];

const Feedback = () => {
  const [ratings, setRatings] = useState<Record<string, string>>({});
  const [additionalComments, setAdditionalComments] = useState("");
  const [submitted, setSubmitted] = useState(false);

  const allAnswered = questions.every((q) => ratings[q.id]);

  const handleSubmit = () => {
    setSubmitted(true);
  };

  if (submitted) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center p-6">
        <Card className="w-full max-w-md text-center">
          <CardContent className="p-8">
            <CheckCircle className="mx-auto h-12 w-12 text-primary mb-4" />
            <h2 className="text-xl font-bold mb-2">Thank You!</h2>
            <p className="text-sm text-muted-foreground">
              Your feedback has been recorded. It helps us improve the learning experience for everyone.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="mb-8">
        <h1 className="font-heading text-3xl font-bold">Feedback</h1>
        <p className="text-muted-foreground">Share your experience with the AI Teaching Assistant</p>
      </div>

      <Card className="max-w-2xl">
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <MessageSquareHeart className="h-5 w-5" />
            </div>
            <div>
              <CardTitle>Quick Feedback</CardTitle>
              <CardDescription>Rate your experience with the tool — it only takes a minute</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {questions.map((q) => (
            <div key={q.id} className="space-y-2">
              <Label className="text-sm">{q.label}</Label>
              <Select value={ratings[q.id] || ""} onValueChange={(v) => setRatings((prev) => ({ ...prev, [q.id]: v }))}>
                <SelectTrigger>
                  <SelectValue placeholder="Select your response" />
                </SelectTrigger>
                <SelectContent>
                  {ratingOptions.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ))}

          <div className="space-y-2">
            <Label className="text-sm">Any additional comments or suggestions? (Optional)</Label>
            <Textarea
              placeholder="Share any thoughts on how we can improve..."
              value={additionalComments}
              onChange={(e) => setAdditionalComments(e.target.value)}
              rows={3}
            />
          </div>

          <Button onClick={handleSubmit} disabled={!allAnswered} className="w-full gap-2">
            <Send className="h-4 w-4" /> Submit Feedback
          </Button>
        </CardContent>
      </Card>
    </div>
  );
};

export default Feedback;
