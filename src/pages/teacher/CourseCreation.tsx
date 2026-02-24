import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Check, X, ArrowRight, ArrowLeft, Sparkles, Loader2, Calendar, BookOpen, Newspaper, ChevronDown, ChevronUp, ThumbsUp } from "lucide-react";

type WeekPlan = {
  week: number;
  dates: string;
  topic: string;
  resources: string[];
};

type CaseStudy = {
  id: string;
  title: string;
  description: string;
  week: number;
  accepted: boolean | null;
};

type AdditionalResource = {
  id: string;
  title: string;
  source: string;
  type: "news" | "article" | "video" | "tool";
  relevance: string;
  accepted: boolean | null;
};

const semesterPlan: WeekPlan[] = [
  { week: 1, dates: "Jan 13 & 15", topic: "Introduction to OS Concepts & Process Lifecycle", resources: ["Textbook Ch. 1-2", "AICTE Module 1 Guide"] },
  { week: 2, dates: "Jan 20 & 22", topic: "Process Scheduling: FCFS, SJF, Round Robin", resources: ["Textbook Ch. 3", "Scheduling Simulator"] },
  { week: 3, dates: "Jan 27 & 29", topic: "Advanced Scheduling & Real-World Applications", resources: ["K8s Scheduling Case Study", "Lab: Scheduling Algorithms"] },
  { week: 4, dates: "Feb 3 & 5", topic: "Threads & Concurrency Fundamentals", resources: ["Textbook Ch. 4", "POSIX Threads Tutorial"] },
  { week: 5, dates: "Feb 10 & 12", topic: "Synchronization: Mutexes, Semaphores, Monitors", resources: ["Textbook Ch. 5", "Producer-Consumer Lab"] },
  { week: 6, dates: "Feb 17 & 19", topic: "Deadlock Prevention & Detection", resources: ["Textbook Ch. 6", "Deadlock Visualization Tool"] },
  { week: 7, dates: "Feb 24 & 26", topic: "Midterm Review & Exam", resources: ["Review Sheet", "Practice Exam"] },
  { week: 8, dates: "Mar 3 & 5", topic: "Physical & Virtual Memory Concepts", resources: ["Textbook Ch. 7", "Memory Hierarchy Slides"] },
  { week: 9, dates: "Mar 10 & 12", topic: "Paging, Segmentation & Address Translation", resources: ["Textbook Ch. 8", "Page Table Simulator"] },
  { week: 10, dates: "Mar 17 & 19", topic: "Memory Allocation Strategies", resources: ["Lab: Build a Memory Allocator in C", "Textbook Ch. 9"] },
  { week: 11, dates: "Mar 24 & 26", topic: "File System Design & Implementation", resources: ["Textbook Ch. 10-11", "EXT4 Case Study"] },
  { week: 12, dates: "Mar 31 & Apr 2", topic: "Modern Storage: NVMe, SSDs & I/O Systems", resources: ["Industry White Paper", "Storage Benchmark Lab"] },
  { week: 13, dates: "Apr 7 & 9", topic: "Security & Protection in Operating Systems", resources: ["Textbook Ch. 14", "CVE Case Studies"] },
  { week: 14, dates: "Apr 14 & 16", topic: "Virtualization & Cloud OS Concepts", resources: ["Hypervisor Comparison Article", "Docker Lab"] },
  { week: 15, dates: "Apr 21 & 23", topic: "Emerging Trends: WASM Runtimes, Unikernels", resources: ["Research Papers", "Hands-On Demo"] },
  { week: 16, dates: "Apr 28 & 30", topic: "Final Review & Exam", resources: ["Comprehensive Review", "Practice Final"] },
];

const initialCaseStudies: CaseStudy[] = [
  { id: "cs1", title: "Kubernetes Pod Scheduling Under Load", description: "Real-world case exploring how K8s schedules containers across nodes — maps to CPU scheduling concepts.", week: 3, accepted: null },
  { id: "cs2", title: "The 2023 CrowdStrike Kernel Crash", description: "Analyze a kernel-level bug that caused global outages — covers process management and OS protection.", week: 6, accepted: null },
  { id: "cs3", title: "Building a Mini File System in C", description: "Interactive coding exercise where students implement a simplified file system with inodes and directories.", week: 11, accepted: null },
  { id: "cs4", title: "AWS Memory Optimization at Scale", description: "How AWS tunes virtual memory for millions of EC2 instances — ties into paging and memory management.", week: 10, accepted: null },
  { id: "cs5", title: "Race Condition Bug in a Banking App", description: "Interactive debugging exercise tracing a concurrency bug in a simulated banking transaction system.", week: 5, accepted: null },
];

const initialResources: AdditionalResource[] = [
  { id: "r1", title: "How Google Redesigned Its Scheduling Algorithm (2024)", source: "ACM Queue", type: "article", relevance: "Directly relates to Week 2-3 scheduling topics with industry context", accepted: null },
  { id: "r2", title: "The Rise of eBPF in Modern Operating Systems", source: "LWN.net", type: "article", relevance: "Cutting-edge OS kernel technology relevant to Weeks 13-15", accepted: null },
  { id: "r3", title: "Memory Safety in Rust vs C for OS Development", source: "The Register", type: "news", relevance: "Industry debate on OS programming languages — timely for memory management weeks", accepted: null },
  { id: "r4", title: "MIT 6.S081 xv6 Labs (Open Courseware)", source: "MIT OCW", type: "tool", relevance: "Hands-on OS labs students can use for supplementary practice", accepted: null },
  { id: "r5", title: "NVIDIA GPU Virtualization Deep Dive", source: "NVIDIA Developer Blog", type: "article", relevance: "Modern virtualization context for Week 14", accepted: null },
];

const replacementCaseStudies: CaseStudy[] = [
  { id: "cs6", title: "Netflix Chaos Monkey: Testing OS Resilience", description: "How Netflix intentionally crashes processes to build resilient systems.", week: 6, accepted: null },
  { id: "cs7", title: "Linux OOM Killer in Production", description: "Real incidents where the Linux Out-of-Memory killer caused unexpected behavior in production systems.", week: 9, accepted: null },
];

const replacementResources: AdditionalResource[] = [
  { id: "r6", title: "Apple's Transition to ARM: OS Implications", source: "Ars Technica", type: "article", relevance: "Architecture-level OS changes for Apple Silicon — relevant to memory and scheduling", accepted: null },
  { id: "r7", title: "WebAssembly System Interface (WASI) Spec Update", source: "W3C", type: "news", relevance: "Emerging OS abstraction layer — ties to Week 15 on WASM runtimes", accepted: null },
];

const CourseCreation = () => {
  const navigate = useNavigate();
  const [phase, setPhase] = useState<"generating" | "plan">("generating");
  const [caseStudies, setCaseStudies] = useState<CaseStudy[]>(initialCaseStudies);
  const [resources, setResources] = useState<AdditionalResource[]>(initialResources);
  const [expandedWeeks, setExpandedWeeks] = useState<number[]>([1]);
  const [csReplacementIdx, setCsReplacementIdx] = useState(0);
  const [resReplacementIdx, setResReplacementIdx] = useState(0);

  // Auto-advance from generating
  useState(() => {
    setTimeout(() => setPhase("plan"), 2500);
  });

  const toggleWeek = (week: number) => {
    setExpandedWeeks((prev) => prev.includes(week) ? prev.filter((w) => w !== week) : [...prev, week]);
  };

  const handleCaseStudyAction = (id: string, accepted: boolean) => {
    if (!accepted) {
      // Remove and replace
      const replacement = replacementCaseStudies[csReplacementIdx % replacementCaseStudies.length];
      setCsReplacementIdx((i) => i + 1);
      setCaseStudies((prev) => prev.map((cs) => cs.id === id ? { ...replacement, id: `cs_new_${Date.now()}` } : cs));
    } else {
      setCaseStudies((prev) => prev.map((cs) => cs.id === id ? { ...cs, accepted: true } : cs));
    }
  };

  const handleResourceAction = (id: string, accepted: boolean) => {
    if (!accepted) {
      const replacement = replacementResources[resReplacementIdx % replacementResources.length];
      setResReplacementIdx((i) => i + 1);
      setResources((prev) => prev.map((r) => r.id === id ? { ...replacement, id: `r_new_${Date.now()}` } : r));
    } else {
      setResources((prev) => prev.map((r) => r.id === id ? { ...r, accepted: true } : r));
    }
  };

  const typeColors: Record<string, string> = {
    news: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400",
    article: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
    video: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
    tool: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
  };

  if (phase === "generating") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4 py-8">
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col items-center justify-center py-20">
          <Loader2 className="h-10 w-10 animate-spin text-primary mb-4" />
          <p className="text-lg font-medium">Generating your AI Teaching Plan...</p>
          <p className="text-sm text-muted-foreground mt-1">Analyzing your syllabus, AICTE guidelines, and teaching materials</p>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-start justify-center bg-background px-4 py-8">
      <div className="w-full max-w-4xl space-y-6">
        <div className="text-center">
          <h1 className="font-heading text-3xl font-bold">
            Next<span className="text-primary">Step</span>
          </h1>
          <p className="mt-2 text-muted-foreground">AI Teaching Plan</p>
        </div>

        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-accent" />
              <CardTitle className="text-xl">AI Teaching Plan</CardTitle>
            </div>
            <CardDescription>
              We've analyzed your existing teaching plan, syllabus, AICTE guidelines, and uploaded materials. Below is a semester-long lesson plan with our recommendations for enriching your course.
            </CardDescription>
          </CardHeader>
        </Card>

        {/* Semester Lesson Plan */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg"><Calendar className="h-5 w-5" /> Semester Lesson Plan</CardTitle>
            <CardDescription>16 weeks · 2 classes per week · Click a week to expand details</CardDescription>
          </CardHeader>
          <CardContent className="space-y-1">
            {semesterPlan.map((wp) => {
              const isExpanded = expandedWeeks.includes(wp.week);
              const weekCases = caseStudies.filter((cs) => cs.week === wp.week);
              return (
                <div key={wp.week} className="rounded-lg border">
                  <button
                    onClick={() => toggleWeek(wp.week)}
                    className="flex w-full items-center justify-between px-4 py-3 text-left hover:bg-muted/50 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <Badge variant="secondary" className="font-mono text-xs">W{wp.week}</Badge>
                      <div>
                        <p className="text-sm font-medium">{wp.topic}</p>
                        <p className="text-xs text-muted-foreground">{wp.dates}</p>
                      </div>
                    </div>
                    {isExpanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                  </button>
                  {isExpanded && (
                    <div className="border-t px-4 py-3 space-y-2 bg-muted/20">
                      <div>
                        <p className="text-xs font-medium text-muted-foreground mb-1">Resources</p>
                        <ul className="text-xs space-y-0.5 list-disc pl-4">
                          {wp.resources.map((r, i) => <li key={i}>{r}</li>)}
                        </ul>
                      </div>
                      {weekCases.length > 0 && (
                        <div>
                          <p className="text-xs font-medium text-muted-foreground mb-1">Case Studies / Exercises</p>
                          {weekCases.map((cs) => (
                            <div key={cs.id} className="text-xs bg-background rounded p-2 border flex items-start justify-between gap-2">
                              <div>
                                <span className="font-medium">{cs.title}</span>
                                <p className="text-muted-foreground mt-0.5">{cs.description}</p>
                              </div>
                              {cs.accepted === true && <Check className="h-4 w-4 text-primary shrink-0 mt-0.5" />}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </CardContent>
        </Card>

        {/* Case Studies & Interactive Exercises */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg"><BookOpen className="h-5 w-5" /> Recommended Case Studies & Exercises</CardTitle>
            <CardDescription>Additional case studies and coding/interactive exercises to include in your classes. Mark helpful ones or dismiss to get new suggestions.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {caseStudies.map((cs) => (
              <motion.div
                key={cs.id}
                layout
                initial={{ opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                className={`rounded-lg border p-4 transition-colors ${cs.accepted ? "border-primary/30 bg-primary/5" : ""}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <p className="text-sm font-medium">{cs.title}</p>
                      <Badge variant="outline" className="text-[10px]">Week {cs.week}</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">{cs.description}</p>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <button
                      onClick={() => handleCaseStudyAction(cs.id, true)}
                      className={`rounded-md p-1.5 transition-colors ${cs.accepted ? "bg-primary text-primary-foreground" : "hover:bg-muted border"}`}
                      title="Mark as helpful"
                    >
                      <ThumbsUp className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => handleCaseStudyAction(cs.id, false)}
                      className="rounded-md p-1.5 hover:bg-destructive/10 hover:text-destructive border transition-colors"
                      title="Dismiss and get new suggestion"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              </motion.div>
            ))}
          </CardContent>
        </Card>

        {/* Additional Resources & News */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg"><Newspaper className="h-5 w-5" /> Additional Resources & Industry Context</CardTitle>
            <CardDescription>Timely resources, news, and articles to make your course more applicable to real-world and industry contexts. Select useful ones or dismiss to get replacements.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {resources.map((r) => (
              <motion.div
                key={r.id}
                layout
                initial={{ opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                className={`rounded-lg border p-4 transition-colors ${r.accepted ? "border-primary/30 bg-primary/5" : ""}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <p className="text-sm font-medium">{r.title}</p>
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${typeColors[r.type]}`}>{r.type}</span>
                    </div>
                    <p className="text-xs text-muted-foreground">{r.source}</p>
                    <p className="text-xs text-muted-foreground mt-1 italic">{r.relevance}</p>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <button
                      onClick={() => handleResourceAction(r.id, true)}
                      className={`rounded-md p-1.5 transition-colors ${r.accepted ? "bg-primary text-primary-foreground" : "hover:bg-muted border"}`}
                      title="Mark as helpful / will use"
                    >
                      <ThumbsUp className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => handleResourceAction(r.id, false)}
                      className="rounded-md p-1.5 hover:bg-destructive/10 hover:text-destructive border transition-colors"
                      title="Dismiss and get new suggestion"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              </motion.div>
            ))}
          </CardContent>
        </Card>

        {/* Navigation */}
        <div className="flex justify-between pb-8">
          <Button variant="ghost" onClick={() => navigate("/teacher/onboarding")}>
            <ArrowLeft className="mr-2 h-4 w-4" /> Back
          </Button>
          <Button onClick={() => navigate("/teacher/setup/settings")}>
            Configure AI TA Settings <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
};

export default CourseCreation;
