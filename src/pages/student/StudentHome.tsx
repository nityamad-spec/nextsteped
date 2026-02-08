import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { useApp } from "@/contexts/AppContext";
import { mockTopics } from "@/data/mockData";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { BookOpen, Brain, Clock, ArrowRight, Sparkles, TrendingUp, Target, Flame, Users, BarChart3 } from "lucide-react";

const StudentHome = () => {
  const { studentProfile } = useApp();
  const navigate = useNavigate();

  const weakTopics = [...mockTopics].sort((a, b) => (a.mastery || 0) - (b.mastery || 0)).slice(0, 3);
  const avgMastery = Math.round(mockTopics.reduce((sum, t) => sum + (t.mastery || 0), 0) / mockTopics.length);

  return (
    <div className="p-6">
      {/* Welcome header */}
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="mb-6">
        <h1 className="font-heading text-3xl font-bold">
          Welcome back, {studentProfile?.name || "Student"}!
        </h1>
        <div className="mt-2 flex items-center gap-2">
          <Badge variant="outline" className="text-sm">{studentProfile?.learnerLevel || "Beginner"}</Badge>
          <span className="text-sm text-muted-foreground">• Operating Systems</span>
        </div>
      </motion.div>

      {/* Stats overview */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }} className="mb-6 grid gap-3 grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <BarChart3 className="h-4 w-4" />
            </div>
            <div>
              <p className="text-xl font-bold">{avgMastery}%</p>
              <p className="text-[11px] text-muted-foreground">Overall Mastery</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent/10 text-accent">
              <Flame className="h-4 w-4" />
            </div>
            <div>
              <p className="text-xl font-bold">4 days</p>
              <p className="text-[11px] text-muted-foreground">Learning Streak</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-success/10 text-success">
              <Users className="h-4 w-4" />
            </div>
            <div>
              <p className="text-xl font-bold">3</p>
              <p className="text-[11px] text-muted-foreground">Sessions This Week</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-destructive/10 text-destructive">
              <Target className="h-4 w-4" />
            </div>
            <div>
              <p className="text-xl font-bold">62%</p>
              <p className="text-[11px] text-muted-foreground">Exam Readiness</p>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Action cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 mb-6">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
          <Card className="group cursor-pointer transition-shadow hover:shadow-md h-full" onClick={() => navigate("/student/chat")}>
            <CardContent className="p-5">
              <div className="mb-3 flex items-center gap-2">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <BookOpen className="h-5 w-5" />
                </div>
                <Badge variant="secondary" className="text-xs">Continue</Badge>
              </div>
              <h3 className="font-medium">Continue where you left off</h3>
              <p className="mt-1 text-xs text-muted-foreground">Virtual Memory — Page Replacement Algorithms</p>
              <p className="mt-2 text-xs text-muted-foreground flex items-center gap-1"><Clock className="h-3 w-3" /> ~15 min remaining</p>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
          <Card className="group cursor-pointer transition-shadow hover:shadow-md h-full" onClick={() => navigate("/student/chat")}>
            <CardContent className="p-5">
              <div className="mb-3 flex items-center gap-2">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent/10 text-accent">
                  <Sparkles className="h-5 w-5" />
                </div>
                <Badge variant="secondary" className="text-xs">Recommended</Badge>
              </div>
              <h3 className="font-medium">CPU Scheduling Practice</h3>
              <p className="mt-1 text-xs text-muted-foreground">Round Robin & SJF comparison exercises</p>
              <p className="mt-2 text-xs text-muted-foreground flex items-center gap-1"><Clock className="h-3 w-3" /> 20 min</p>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
          <Card className="group cursor-pointer border-accent/20 transition-shadow hover:shadow-md h-full" onClick={() => navigate("/student/chat?mode=exam")}>
            <CardContent className="p-5">
              <div className="mb-3 flex items-center gap-2">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-destructive/10 text-destructive">
                  <Brain className="h-5 w-5" />
                </div>
                <Badge variant="destructive" className="text-xs">6 days</Badge>
              </div>
              <h3 className="font-medium">Exam 1 — Take a Simulation</h3>
              <p className="mt-1 text-xs text-muted-foreground">Midterm: Scheduling & Memory Management</p>
              <p className="mt-2 text-xs text-muted-foreground flex items-center gap-1"><Clock className="h-3 w-3" /> 60 min</p>
            </CardContent>
          </Card>
        </motion.div>
      </div>

      {/* Recommended topics & quick actions */}
      <div className="grid gap-6 lg:grid-cols-3">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.35 }} className="lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Target className="h-4 w-4 text-accent" /> Recommended Topics to Review
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {weakTopics.map((topic) => (
                <div key={topic.id} className="flex items-center gap-3 rounded-lg border p-3 cursor-pointer hover:bg-muted/50 transition-colors" onClick={() => navigate("/student/chat")}>
                  <div className="flex-1">
                    <div className="flex items-center justify-between mb-1">
                      <p className="text-sm font-medium">{topic.name}</p>
                      <span className="text-xs text-muted-foreground">{topic.mastery}%</span>
                    </div>
                    <Progress value={topic.mastery} className="h-1.5" />
                  </div>
                  <ArrowRight className="h-4 w-4 text-muted-foreground" />
                </div>
              ))}
            </CardContent>
          </Card>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }}>
          <Card className="h-full">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <TrendingUp className="h-4 w-4 text-primary" /> Quick Actions
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <Button onClick={() => navigate("/student/chat")} className="w-full justify-start gap-2" size="sm">
                <BookOpen className="h-4 w-4" /> Start Learning Session
              </Button>
              <Button variant="outline" onClick={() => navigate("/student/chat?mode=exam")} className="w-full justify-start gap-2" size="sm">
                <Brain className="h-4 w-4" /> Take Exam Simulation
              </Button>
              <Button variant="outline" onClick={() => navigate("/student/progress")} className="w-full justify-start gap-2" size="sm">
                <TrendingUp className="h-4 w-4" /> View Progress
              </Button>
            </CardContent>
          </Card>
        </motion.div>
      </div>
    </div>
  );
};

export default StudentHome;
