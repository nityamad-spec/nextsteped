import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { mockSyllabusRecommendations } from "@/data/mockData";
import { SyllabusRecommendation } from "@/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Check, X, ArrowRight, ArrowLeft, Sparkles, Loader2 } from "lucide-react";

const CourseCreation = () => {
  const navigate = useNavigate();
  const [phase, setPhase] = useState<"review" | "updated">("review");
  const [recommendations, setRecommendations] = useState<SyllabusRecommendation[]>(mockSyllabusRecommendations);
  const [generating, setGenerating] = useState(false);

  const toggleRecommendation = (id: string, accepted: boolean) => {
    setRecommendations((prev) =>
      prev.map((r) => (r.id === id ? { ...r, accepted } : r))
    );
  };

  const handleApproveAll = () => {
    setRecommendations((prev) => prev.map((r) => ({ ...r, accepted: true })));
  };

  const handleRejectAll = () => {
    setRecommendations((prev) => prev.map((r) => ({ ...r, accepted: false })));
  };

  const handleFinishReview = () => {
    setGenerating(true);
    setTimeout(() => {
      setGenerating(false);
      setPhase("updated");
    }, 2000);
  };

  const approvedCount = recommendations.filter((r) => r.accepted === true).length;

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-8">
      <div className="w-full max-w-3xl">
        <div className="mb-8 text-center">
          <h1 className="font-heading text-3xl font-bold">
            Next<span className="text-primary">Step</span>
          </h1>
          <p className="mt-2 text-muted-foreground">AI-powered syllabus review and recommendations</p>
        </div>

        {phase === "review" && !generating && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between flex-wrap gap-3">
                  <div>
                    <CardTitle className="flex items-center gap-2"><Sparkles className="h-5 w-5 text-accent" /> AI Syllabus Review</CardTitle>
                    <CardDescription>We've analyzed your syllabus and teaching materials. Here are our suggestions.</CardDescription>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={handleApproveAll}>Approve All</Button>
                    <Button variant="ghost" size="sm" onClick={handleRejectAll}>Reject All</Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {recommendations.map((rec) => (
                  <div key={rec.id} className={`rounded-lg border p-4 transition-colors ${rec.accepted === true ? "border-primary/30 bg-primary/5" : rec.accepted === false ? "opacity-50" : ""}`}>
                    <div className="mb-2 flex items-center justify-between">
                      <Badge variant="secondary">{rec.category}</Badge>
                      <div className="flex gap-1">
                        <button onClick={() => toggleRecommendation(rec.id, true)} className={`rounded-md p-1.5 transition-colors ${rec.accepted === true ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}>
                          <Check className="h-4 w-4" />
                        </button>
                        <button onClick={() => toggleRecommendation(rec.id, false)} className={`rounded-md p-1.5 transition-colors ${rec.accepted === false ? "bg-destructive text-destructive-foreground" : "hover:bg-muted"}`}>
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                    <p className="mb-1 text-sm text-muted-foreground line-through">{rec.original}</p>
                    <p className="text-sm font-medium">{rec.suggestion}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{rec.reason}</p>
                  </div>
                ))}
                <div className="flex justify-between pt-2">
                  <Button variant="ghost" onClick={() => navigate("/teacher/onboarding")}>
                    <ArrowLeft className="mr-2 h-4 w-4" /> Back
                  </Button>
                  <Button onClick={handleFinishReview}>
                    Approve & Generate Updated Syllabus <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        )}

        {generating && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col items-center justify-center py-20">
            <Loader2 className="h-10 w-10 animate-spin text-primary mb-4" />
            <p className="text-lg font-medium">Generating updated syllabus...</p>
            <p className="text-sm text-muted-foreground mt-1">Incorporating {approvedCount} approved recommendation{approvedCount !== 1 ? "s" : ""}</p>
          </motion.div>
        )}

        {phase === "updated" && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
            <Card>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <Check className="h-5 w-5 text-primary" />
                  <CardTitle>Updated Syllabus Generated</CardTitle>
                </div>
                <CardDescription>Your syllabus has been updated with the approved changes</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="rounded-lg border bg-muted/30 p-5 space-y-4">
                  <div>
                    <h3 className="text-sm font-semibold text-foreground mb-2">Module 1: Process Management & Scheduling</h3>
                    <ul className="text-xs text-muted-foreground space-y-1 list-disc pl-4">
                      <li>Introduction to OS concepts and process lifecycle</li>
                      <li>CPU Scheduling: FCFS, SJF, Round Robin, Priority</li>
                      <li><span className="text-primary font-medium">NEW:</span> Container orchestration concepts (K8s scheduling) as real-world application</li>
                    </ul>
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-foreground mb-2">Module 2: Memory Management</h3>
                    <ul className="text-xs text-muted-foreground space-y-1 list-disc pl-4">
                      <li>Physical and virtual memory concepts</li>
                      <li>Paging, segmentation, and address translation</li>
                      <li><span className="text-primary font-medium">NEW:</span> Hands-on lab — implement a simple memory allocator in C</li>
                    </ul>
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-foreground mb-2">Module 3: Storage & I/O</h3>
                    <ul className="text-xs text-muted-foreground space-y-1 list-disc pl-4">
                      <li>File system design and implementation</li>
                      <li><span className="text-primary font-medium">NEW:</span> NVMe, SSDs, and modern storage architectures</li>
                      <li><span className="text-primary font-medium">NEW:</span> Project-based assessment — design a mini file system</li>
                    </ul>
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-foreground mb-2">Module 4: Concurrency & Synchronization</h3>
                    <ul className="text-xs text-muted-foreground space-y-1 list-disc pl-4">
                      <li>Threads, mutexes, semaphores, monitors</li>
                      <li>Deadlock prevention and detection</li>
                    </ul>
                  </div>
                </div>

                <div className="rounded-lg bg-primary/5 border border-primary/20 p-3">
                  <p className="text-xs text-primary font-medium">✨ {approvedCount} improvement{approvedCount !== 1 ? "s" : ""} incorporated into your syllabus</p>
                </div>

                <div className="flex justify-between pt-2">
                  <Button variant="ghost" onClick={() => setPhase("review")}>
                    <ArrowLeft className="mr-2 h-4 w-4" /> Back to Review
                  </Button>
                  <Button onClick={() => navigate("/teacher/setup/settings")}>
                    Configure AI TA Settings <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        )}
      </div>
    </div>
  );
};

export default CourseCreation;
