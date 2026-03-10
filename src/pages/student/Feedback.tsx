import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { MessageSquareHeart, Send, CheckCircle, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

const NumberScale = ({
  value,
  onChange,
  lowLabel,
  highLabel,
}: {
  value: number | null;
  onChange: (v: number) => void;
  lowLabel: string;
  highLabel: string;
}) => (
  <div className="space-y-2">
    <div className="grid grid-cols-5 gap-2">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          onClick={() => onChange(n)}
          className={cn(
            "flex h-11 items-center justify-center rounded-lg border text-sm font-medium transition-all",
            value === n
              ? "border-primary bg-primary text-primary-foreground shadow-sm"
              : "border-border bg-background text-foreground hover:border-primary/50 hover:bg-primary/5"
          )}
        >
          {n}
        </button>
      ))}
    </div>
    <div className="flex justify-between text-xs text-muted-foreground">
      <span>{lowLabel}</span>
      <span>{highLabel}</span>
    </div>
  </div>
);

const ChipSelect = ({
  options,
  value,
  onChange,
}: {
  options: { value: string; label: string }[];
  value: string | null;
  onChange: (v: string) => void;
}) => (
  <div className="flex flex-col gap-2">
    {options.map((opt) => (
      <button
        key={opt.value}
        type="button"
        onClick={() => onChange(opt.value)}
        className={cn(
          "w-full rounded-lg border px-4 py-2.5 text-left text-sm font-medium transition-all",
          value === opt.value
            ? "border-primary bg-primary text-primary-foreground shadow-sm"
            : "border-border bg-background text-foreground hover:border-primary/50 hover:bg-primary/5"
        )}
      >
        {opt.label}
      </button>
    ))}
  </div>
);

const Feedback = () => {
  const { user } = useAuth();
  const [answers, setAnswers] = useState<Record<string, number | string | null>>({});
  const [additionalComments, setAdditionalComments] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const setAnswer = (key: string, value: number | string) =>
    setAnswers((prev) => ({ ...prev, [key]: value }));

  const allAnswered =
    answers.ease != null &&
    answers.clarity != null &&
    answers.understanding != null &&
    answers.difficulty_match != null &&
    answers.guided != null &&
    answers.comparison != null &&
    answers.usefulness != null;

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
        <p className="text-muted-foreground">Share your experience with NextStep</p>
      </div>

      <Card className="max-w-2xl">
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <MessageSquareHeart className="h-5 w-5" />
            </div>
            <div>
              <CardTitle>Quick Feedback</CardTitle>
              <CardDescription>Rate your experience — it only takes a minute</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-8">
          {/* Q1 */}
          <div className="space-y-3">
            <Label className="text-sm font-medium">How easy was NextStep to use?</Label>
            <NumberScale
              value={answers.ease as number | null}
              onChange={(v) => setAnswer("ease", v)}
              lowLabel="1 — Very hard to use"
              highLabel="5 — Very easy to use"
            />
          </div>

          {/* Q2 */}
          <div className="space-y-3">
            <Label className="text-sm font-medium">Were the explanations and responses easy to understand?</Label>
            <NumberScale
              value={answers.clarity as number | null}
              onChange={(v) => setAnswer("clarity", v)}
              lowLabel="1 — Very hard to understand"
              highLabel="5 — Very easy to understand"
            />
          </div>

          {/* Q3 */}
          <div className="space-y-3">
            <Label className="text-sm font-medium">Do you better understand the concepts/course material after using NextStep?</Label>
            <NumberScale
              value={answers.understanding as number | null}
              onChange={(v) => setAnswer("understanding", v)}
              lowLabel="1 — Not at all"
              highLabel="5 — Significantly better"
            />
          </div>

          {/* Q4 */}
          <div className="space-y-3">
            <Label className="text-sm font-medium">Did you find the difficulty of questions matched where you are in your learning?</Label>
            <NumberScale
              value={answers.difficulty_match as number | null}
              onChange={(v) => setAnswer("difficulty_match", v)}
              lowLabel="1 — Not at all"
              highLabel="5 — Perfectly matched"
            />
          </div>

          {/* Q5 */}
          <div className="space-y-3">
            <Label className="text-sm font-medium">NextStep guided you to find answers rather than giving them directly. How do you feel about this?</Label>
            <ChipSelect
              value={answers.guided as string | null}
              onChange={(v) => setAnswer("guided", v)}
              options={[
                { value: "loved", label: "Loved it — it made me think" },
                { value: "liked", label: "Liked it overall" },
                { value: "neutral", label: "Neutral" },
                { value: "disliked", label: "Didn't love it" },
                { value: "want_direct", label: "Didn't like it — I want direct answers" },
              ]}
            />
          </div>

          {/* Q6 */}
          <div className="space-y-3">
            <Label className="text-sm font-medium">Compared to how you normally study (YouTube, ChatGPT, tutors), NextStep is:</Label>
            <ChipSelect
              value={answers.comparison as string | null}
              onChange={(v) => setAnswer("comparison", v)}
              options={[
                { value: "much_better", label: "Much better" },
                { value: "somewhat_better", label: "Somewhat better" },
                { value: "same", label: "About the same" },
                { value: "worse", label: "Worse" },
              ]}
            />
          </div>

          {/* Q7 */}
          <div className="space-y-3">
            <Label className="text-sm font-medium">If NextStep were available for all your subjects in college, how useful would it be?</Label>
            <NumberScale
              value={answers.usefulness as number | null}
              onChange={(v) => setAnswer("usefulness", v)}
              lowLabel="1 — Not useful"
              highLabel="5 — Extremely useful"
            />
          </div>

          {/* Comments */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">Any additional comments or suggestions? (Optional)</Label>
            <Textarea
              placeholder="Share any thoughts on how we can improve..."
              value={additionalComments}
              onChange={(e) => setAdditionalComments(e.target.value)}
              rows={3}
            />
          </div>

          <Button onClick={() => setSubmitted(true)} disabled={!allAnswered} className="w-full gap-2">
            <Send className="h-4 w-4" /> Submit Feedback
          </Button>
        </CardContent>
      </Card>
    </div>
  );
};

export default Feedback;
