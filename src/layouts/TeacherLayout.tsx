import { Outlet, useNavigate, useLocation } from "react-router-dom";
import { useEffect } from "react";
import { BookOpen, HelpCircle, Library, MessageSquare, ListChecks, Lock, BarChart3 } from "lucide-react";
import { useApp } from "@/contexts/AppContext";
import { NavLink } from "@/components/NavLink";
import { useIsMobile } from "@/hooks/use-mobile";
import { useTeacherSetupStatus } from "@/hooks/useTeacherSetupStatus";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import CourseSwitcher from "@/components/CourseSwitcher";

interface NavItem {
  title: string;
  path: string;
  icon: typeof BookOpen;
  alwaysUnlocked?: boolean;
}

const teacherNav: NavItem[] = [
  { title: "Course Setup", path: "/teacher/setup", icon: ListChecks, alwaysUnlocked: true },
  { title: "Course Dashboard", path: "/teacher/courses/dashboard", icon: BookOpen },
  { title: "Course Analytics", path: "/teacher/courses/analytics", icon: BarChart3 },
  { title: "Course Assistant", path: "/teacher/chat", icon: MessageSquare },
  { title: "Lesson Plan & Resources", path: "/teacher/content-library", icon: Library },
  { title: "Support", path: "/teacher/support", icon: HelpCircle, alwaysUnlocked: true },
];

// Routes that remain accessible regardless of setup completion. Anything
// else inside TeacherLayout is gated until setup is fully complete.
const ALWAYS_OPEN_PATHS = [
  "/teacher/setup",
  "/teacher/support",
];

const TeacherLayout = () => {
  const { currentCourse } = useApp();
  const navigate = useNavigate();
  const location = useLocation();
  const isMobile = useIsMobile();
  const { loading: setupLoading, isComplete: setupComplete } = useTeacherSetupStatus();

  // Hard gate: if the professor lands on a non-setup route while setup is
  // incomplete, force them back to /teacher/setup.
  useEffect(() => {
    if (setupLoading) return;
    if (setupComplete) return;
    const path = location.pathname;
    const allowed = ALWAYS_OPEN_PATHS.some((p) => path === p || path.startsWith(p + "/"));
    if (!allowed) navigate("/teacher/setup", { replace: true });
  }, [setupLoading, setupComplete, location.pathname, navigate]);

  const isLocked = (item: NavItem) => !item.alwaysUnlocked && !setupComplete;


  if (isMobile) {
    return (
      <div className="flex min-h-screen flex-col bg-background">
        <header className="flex flex-col gap-2 border-b px-4 py-3">
          <div className="flex items-center justify-between">
            <h1 className="font-heading text-lg font-bold">Next<span className="text-primary">Step</span></h1>
          </div>
          <CourseSwitcher />
        </header>
        <main className="flex-1 overflow-auto">
          <Outlet />
        </main>
        <nav className="flex border-t bg-card">
          {teacherNav.map((item) => {
            const locked = isLocked(item);
            if (locked) {
              return (
                <Tooltip key={item.path}>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      className="flex flex-1 flex-col items-center gap-1 py-2 text-muted-foreground/50 cursor-not-allowed relative"
                    >
                      <item.icon className="h-5 w-5" />
                      <Lock className="absolute top-1 right-1/3 h-2.5 w-2.5" />
                      <span className="text-[10px]">{item.title.split(" ")[0]}</span>
                    </button>
                  </TooltipTrigger>
                  <TooltipContent>Complete your Course Setup to unlock this.</TooltipContent>
                </Tooltip>
              );
            }
            return (
              <NavLink key={item.path} to={item.path} end={false}
                className="flex flex-1 flex-col items-center gap-1 py-2 text-muted-foreground"
                activeClassName="text-primary"
              >
                <item.icon className="h-5 w-5" />
                <span className="text-[10px]">{item.title.split(" ")[0]}</span>
              </NavLink>
            );
          })}
        </nav>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-background">
      <aside className="flex w-60 flex-col border-r bg-sidebar">
        <div className="border-b p-4 space-y-3">
          <div>
            <h1 className="font-heading text-xl font-bold">Next<span className="text-primary">Step</span></h1>
            <p className="mt-0.5 text-xs text-muted-foreground">Professor View</p>
          </div>
          <CourseSwitcher />
        </div>

        <nav className="flex-1 space-y-1 p-3">
          {teacherNav.map((item) => {
            const locked = isLocked(item);
            if (locked) {
              return (
                <Tooltip key={item.path}>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-sidebar-foreground/40 cursor-not-allowed"
                    >
                      <item.icon className="h-4 w-4" />
                      <span className="flex-1 text-left">{item.title}</span>
                      <Lock className="h-3.5 w-3.5" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="right">Complete your Course Setup to unlock this.</TooltipContent>
                </Tooltip>
              );
            }
            return (
              <NavLink
                key={item.path}
                to={item.path}
                end={false}
                className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-sidebar-foreground transition-colors hover:bg-sidebar-accent"
                activeClassName="bg-sidebar-accent text-primary font-medium"
              >
                <item.icon className="h-4 w-4" />
                {item.title}
              </NavLink>
            );
          })}
        </nav>

      </aside>

      <main className="flex-1 overflow-auto">
        <Outlet />
      </main>
    </div>
  );
};

export default TeacherLayout;
