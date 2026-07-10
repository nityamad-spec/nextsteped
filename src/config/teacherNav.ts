import { BookOpen, HelpCircle, Library, MessageSquare, ListChecks, BarChart3 } from "lucide-react";
import type { LucideIcon } from "lucide-react";

export interface TeacherNavItem {
  title: string;
  path: string;
  icon: LucideIcon;
  /** Cannot be gated by setup completion (still respected by admin nav permissions). */
  alwaysUnlocked?: boolean;
  /** Cannot be hidden by admin nav permissions. */
  alwaysVisible?: boolean;
}

export const TEACHER_NAV: TeacherNavItem[] = [
  { title: "Course Setup", path: "/teacher/setup", icon: ListChecks, alwaysUnlocked: true, alwaysVisible: true },
  { title: "Course Dashboard", path: "/teacher/courses/dashboard", icon: BookOpen },
  { title: "Course Assistant", path: "/teacher/chat", icon: MessageSquare },
  { title: "Lesson Plan & Resources", path: "/teacher/content-library", icon: Library },
  { title: "Course Analytics", path: "/teacher/analytics", icon: BarChart3 },
  { title: "Support", path: "/teacher/support", icon: HelpCircle, alwaysUnlocked: true, alwaysVisible: true },
];
