import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { ShieldCheck } from "lucide-react";
import { useApp } from "@/contexts/AppContext";
import { useStudentStatus } from "@/hooks/useStudentStatus";
import { useTASettings } from "@/hooks/useTASettings";
import { useEnrolledCourseId } from "@/hooks/useEnrolledCourseId";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Brain, BookOpen } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

const conceptMasteryData = [
  { name: "Variables & Types", mastery: 85 },
  { name: "Control Flow", mastery: 78 },
  { name: "Functions", mastery: 62 },
  { name: "Lists & Dicts", mastery: 0 },
  { name: "File Handling", mastery: 0 },
  { name: "OOP Basics", mastery: 0 },
  { name: "Error Handling", mastery: 0 },
  { name: "Modules", mastery: 55 },
];

const getMasteryColor = (mastery: number) => {
  if (mastery === 0) return "bg-background border text-muted-foreground";
  if (mastery >= 70) return "bg-primary text-primary-foreground";
  if (mastery >= 40) return "bg-primary/40 text-foreground";
  return "bg-destructive/20 text-destructive-foreground";
};

const StudentHome = () => {
  const { studentProfile, currentCourse } = useApp();
  const { profileData } = useStudentStatus();
  const enrolledCourseId = useEnrolledCourseId();
  const { taSettings } = useTASettings(enrolledCourseId);
  const { user } = useAuth();
  const navigate = useNavigate();
  const courseName = currentCourse?.name || "Intro to Python";
  const displayName = profileData?.name || studentProfile?.name || "Student";

  // Semester progress (mock)
  const totalWeeks = 16;
  const currentWeek = 6;
  const progressPct = Math.round((currentWeek / totalWeeks) * 100);

  return (
    <div className="p-6">
      {/* Welcome header */}
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="mb-4">
        <h1 className="font-heading text-3xl font-bold">
          Welcome back, {displayName}!
        </h1>
        <div className="mt-2 flex items-center gap-2">
          <Badge variant="outline" className="text-sm">{studentProfile?.learnerLevel || "Beginner"}</Badge>
          <span className="text-sm text-muted-foreground">{courseName}</span>
        </div>
      </motion.div>

      {/* Privacy notice */}
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.03 }} className="mb-5">
        <div className="flex items-center gap-2.5 rounded-lg border border-primary/20 bg-primary/5 px-4 py-2.5">
          <ShieldCheck className="h-4 w-4 shrink-0 text-primary" />
          <p className="text-xs text-muted-foreground">
            <span className="font-medium text-foreground">Your data is private & anonymized.</span>{" "}
            Your professor can only see aggregate class trends — never your individual chats, quiz answers, or performance data.
          </p>
        </div>
      </motion.div>

      {/* Course Progress */}
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }} className="mb-6">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <BookOpen className="h-4 w-4 text-primary" />
                <p className="text-sm font-medium">Course Progress</p>
              </div>
              <span className="text-sm text-muted-foreground">Week {currentWeek} of {totalWeeks}</span>
            </div>
            <Progress value={progressPct} className="h-2 mb-1" />
            <p className="text-xs text-muted-foreground">Semester in progress — check your lesson plan in the Content Library</p>
          </CardContent>
        </Card>
      </motion.div>

      {/* Concept Mastery Heat Map */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="mb-6">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <Brain className="h-4 w-4 text-primary" /> Concept Mastery Heat Map
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {conceptMasteryData.map((concept) => (
                <Tooltip key={concept.name}>
                  <TooltipTrigger asChild>
                    <div className={`rounded-lg p-3 text-center cursor-default transition-colors ${getMasteryColor(concept.mastery)}`}>
                      <p className="text-xs font-medium truncate">{concept.name}</p>
                      <p className="text-lg font-bold mt-1">{concept.mastery === 0 ? "—" : `${concept.mastery}%`}</p>
                    </div>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>{concept.name}: {concept.mastery === 0 ? "Not covered yet" : `${concept.mastery}% mastery`}</p>
                  </TooltipContent>
                </Tooltip>
              ))}
            </div>
            <div className="flex items-center justify-center gap-4 mt-3">
              <div className="flex items-center gap-1.5">
                <div className="h-3 w-3 rounded bg-background border" />
                <span className="text-[10px] text-muted-foreground">Not covered</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="h-3 w-3 rounded bg-primary/40" />
                <span className="text-[10px] text-muted-foreground">In progress</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="h-3 w-3 rounded bg-primary" />
                <span className="text-[10px] text-muted-foreground">Strong</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
};

export default StudentHome;
