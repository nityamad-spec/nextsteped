import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Upload,
  ClipboardList,
  Brain,
  Bot,
  GraduationCap,
  UserPlus,
  Lock,
  Check,
  CircleDashed,
  CircleDot,
  Layers,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useTeacherCourseId } from "@/hooks/useTeacherCourseId";
import { supabase } from "@/integrations/supabase/client";

type Status = "Not Started" | "In Progress" | "Complete";

interface CardDef {
  id: string;
  title: string;
  description: string;
  icon: typeof Upload;
  path: string;
}

const CARDS: CardDef[] = [
  { id: "upload", title: "Upload Course Materials", description: "Upload your syllabus and any supporting teaching materials.", icon: Upload, path: "/teacher/setup/upload" },
  { id: "concept-review", title: "Concept Review", description: "Review concepts extracted from your materials before generating the lesson plan.", icon: Layers, path: "/teacher/setup/concept-review" },
  { id: "lesson-plan", title: "Generate Lesson Plan", description: "Generate a structured weekly lesson plan based on your confirmed concepts.", icon: ClipboardList, path: "/teacher/setup/lesson-plan" },
  { id: "diagnostic", title: "Approve Diagnostic Quiz", description: "Review and approve the AI-generated diagnostic quiz for your students.", icon: Brain, path: "/teacher/setup/diagnostic" },
  { id: "ai-settings", title: "AI Assistant Settings", description: "Configure the AI TA for your students and access your own professor AI assistant.", icon: Bot, path: "/teacher/setup/ai-settings" },
  { id: "exam-mode", title: "Exam Mode Settings", description: "Set up and customise the exam mode experience for your students.", icon: GraduationCap, path: "/teacher/setup/exam-mode" },
  { id: "enrollment", title: "Enrollment & Course Settings", description: "Configure your course schedule, sections, enrollment code, and student roster.", icon: UserPlus, path: "/teacher/setup/enrollment" },
];

// Track per-user "card opened" state in localStorage to drive In Progress status
const openedKey = (uid: string) => `setup-opened:${uid}`;
const getOpened = (uid: string): Record<string, boolean> => {
  try { return JSON.parse(localStorage.getItem(openedKey(uid)) || "{}"); } catch { return {}; }
};

const StatusBadge = ({ status }: { status: Status }) => {
  if (status === "Complete") {
    return (
      <Badge variant="outline" className="gap-1 border-primary/40 text-primary bg-primary/5">
        <Check className="h-3 w-3" /> Complete
      </Badge>
    );
  }
  if (status === "In Progress") {
    return (
      <Badge variant="outline" className="gap-1 border-warning/40 text-warning bg-warning/5">
        <CircleDot className="h-3 w-3" /> In Progress
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="gap-1 text-muted-foreground">
      <CircleDashed className="h-3 w-3" /> Not Started
    </Badge>
  );
};

const CourseSetup = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const courseId = useTeacherCourseId();
  const [statuses, setStatuses] = useState<Record<string, Status>>({
    upload: "Not Started",
    "concept-review": "Not Started",
    "lesson-plan": "Not Started",
    diagnostic: "Not Started",
    "ai-settings": "Not Started",
    "exam-mode": "Not Started",
    enrollment: "Not Started",
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    const fetchStatuses = async () => {
      setLoading(true);
      const opened = getOpened(user.id);
      const next: Record<string, Status> = {
        upload: "Not Started",
        "concept-review": "Not Started",
        "lesson-plan": "Not Started",
        diagnostic: "Not Started",
        "ai-settings": "Not Started",
        "exam-mode": "Not Started",
        enrollment: "Not Started",
      };

      // Card 1 (Upload): Complete only if at least one syllabus file actually exists.
      const { data: syllabusFiles } = await supabase
        .from("course_material_files")
        .select("id")
        .eq("teacher_id", user.id)
        .eq("folder_type", "syllabus")
        .limit(1);
      if (syllabusFiles && syllabusFiles.length > 0) {
        next.upload = "Complete";
      } else if (opened.upload) {
        next.upload = "In Progress";
      }

      // Card 2 (Lesson Plan): Complete ONLY if the teacher has explicitly published the plan.
      // We do NOT treat a draft as In Progress unless the teacher actually opened the module.
      try {
        const { data: published } = await supabase.storage
          .from("course-materials")
          .download(`${user.id}/lesson-plan/published-plan.json`);
        if (published) {
          next["lesson-plan"] = "Complete";
        } else if (opened["lesson-plan"]) {
          next["lesson-plan"] = "In Progress";
        }
      } catch {
        if (opened["lesson-plan"]) next["lesson-plan"] = "In Progress";
      }

      if (courseId) {
        // Card 2 (Concept Review): Complete if at least one concept exists for the course.
        const { data: cr } = await supabase
          .from("concepts")
          .select("id")
          .eq("course_id", courseId)
          .limit(1);
        if (cr && cr.length > 0) next["concept-review"] = "Complete";
        else if (opened["concept-review"]) next["concept-review"] = "In Progress";

        // Card 4 (Diagnostic): Complete only if questions exist for the course.
        const { data: dq } = await supabase
          .from("diagnostic_questions")
          .select("id")
          .eq("course_id", courseId)
          .limit(1);
        if (dq && dq.length > 0) next.diagnostic = "Complete";
        else if (opened.diagnostic) next.diagnostic = "In Progress";

        // Cards 5 & 6 (TA settings)
        const { data: ta } = await supabase
          .from("course_ta_settings")
          .select("custom_study_prompt, exam_enabled, exam_approved")
          .eq("course_id", courseId)
          .maybeSingle();
        const aiDone = !!(ta?.custom_study_prompt && ta.custom_study_prompt.trim().length > 0);
        const examDone = !!(ta?.exam_enabled || ta?.exam_approved);
        next["ai-settings"] = aiDone ? "Complete" : opened["ai-settings"] ? "In Progress" : "Not Started";
        next["exam-mode"] = examDone ? "Complete" : opened["exam-mode"] ? "In Progress" : "Not Started";
      } else {
        if (opened["concept-review"]) next["concept-review"] = "In Progress";
        if (opened.diagnostic) next.diagnostic = "In Progress";
        if (opened["ai-settings"]) next["ai-settings"] = "In Progress";
        if (opened["exam-mode"]) next["exam-mode"] = "In Progress";
      }

      // Card 6 (Enrollment): no DB-backed completion criteria yet — track via opened state.
      if (opened.enrollment) next.enrollment = "In Progress";

      setStatuses(next);
      setLoading(false);
    };
    fetchStatuses();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, courseId]);

  const isLessonPlanLocked = statuses.upload !== "Complete";

  const handleOpen = (cardId: string, locked: boolean, path: string) => {
    if (locked || !user) return;
    const opened = getOpened(user.id);
    opened[cardId] = true;
    localStorage.setItem(openedKey(user.id), JSON.stringify(opened));
    navigate(path);
  };

  return (
    <div className="p-6 md:p-8">
      <div className="mb-8">
        <h1 className="font-heading text-3xl font-bold">Course Setup</h1>
        <p className="text-muted-foreground mt-1">
          Complete each step to launch your course. You can revisit any module at any time.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {CARDS.map((c, idx) => {
          const status = statuses[c.id];
          const locked = c.id === "lesson-plan" && isLessonPlanLocked;
          const Icon = c.icon;
          return (
            <Card
              key={c.id}
              onClick={() => handleOpen(c.id, locked, c.path)}
              className={`relative aspect-square transition-all ${
                locked
                  ? "opacity-60 cursor-not-allowed"
                  : "cursor-pointer hover:shadow-md hover:border-primary/40"
              }`}
            >
              <CardContent className="p-5 h-full flex flex-col">
                <div className="flex items-start justify-between mb-4">
                  <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${
                    locked ? "bg-muted text-muted-foreground" : "bg-primary/10 text-primary"
                  }`}>
                    {locked ? <Lock className="h-5 w-5" /> : <Icon className="h-5 w-5" />}
                  </div>
                  <span className="text-xs font-mono text-muted-foreground">Step {idx + 1}</span>
                </div>
                <h3 className="font-semibold text-base text-foreground mb-1.5 leading-tight">{c.title}</h3>
                <p className="text-xs text-muted-foreground leading-relaxed flex-1">
                  {locked ? "Upload your syllabus in Step 1 to unlock this." : c.description}
                </p>
                <div className="mt-4">
                  {loading ? (
                    <span className="text-[10px] text-muted-foreground">Checking…</span>
                  ) : (
                    <StatusBadge status={status} />
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
};

export default CourseSetup;
