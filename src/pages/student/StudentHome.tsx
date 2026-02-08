import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { useApp } from "@/contexts/AppContext";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { BookOpen, Brain, Clock, ArrowRight, Sparkles, TrendingUp } from "lucide-react";

const StudentHome = () => {
  const { studentProfile } = useApp();
  const navigate = useNavigate();

  return (
    <div className="p-6">
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="mb-8">
        <h1 className="font-heading text-3xl font-bold">
          Welcome back, {studentProfile?.name || "Student"}!
        </h1>
        <div className="mt-2 flex items-center gap-2">
          <Badge variant="outline" className="text-sm">{studentProfile?.learnerLevel || "Beginner"}</Badge>
          <span className="text-sm text-muted-foreground">• Operating Systems</span>
        </div>
      </motion.div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
          <Card className="group cursor-pointer transition-shadow hover:shadow-md" onClick={() => navigate("/student/chat")}>
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
          <Card className="group cursor-pointer transition-shadow hover:shadow-md" onClick={() => navigate("/student/chat")}>
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
          <Card className="group cursor-pointer border-accent/20 transition-shadow hover:shadow-md" onClick={() => navigate("/student/chat?mode=exam")}>
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

      <div className="mt-8 flex flex-wrap gap-3">
        <Button onClick={() => navigate("/student/chat")} className="gap-2">
          <BookOpen className="h-4 w-4" /> Start Learning Session
        </Button>
        <Button variant="outline" onClick={() => navigate("/student/chat?mode=exam")} className="gap-2">
          <Brain className="h-4 w-4" /> Take Exam Simulation
        </Button>
      </div>

      <div className="mt-8">
        <Card>
          <CardContent className="flex items-center gap-4 p-4">
            <TrendingUp className="h-5 w-5 text-primary" />
            <div>
              <p className="text-sm font-medium">Weekly Progress</p>
              <p className="text-xs text-muted-foreground">3 sessions completed • 2.5 hours studied • 4-day streak 🔥</p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default StudentHome;