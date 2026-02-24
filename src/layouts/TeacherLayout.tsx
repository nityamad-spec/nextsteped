import { Outlet, useNavigate, useLocation } from "react-router-dom";
import { BookOpen, Users, ClipboardCheck, Settings, HelpCircle, LogOut, Send, MessageSquare, FileText } from "lucide-react";
import { useApp } from "@/contexts/AppContext";
import { NavLink } from "@/components/NavLink";
import { useIsMobile } from "@/hooks/use-mobile";
import { Button } from "@/components/ui/button";

const teacherNav = [
  { title: "Courses", path: "/teacher/courses/dashboard", icon: BookOpen },
  { title: "Student Insights", path: "/teacher/insights", icon: Users },
  { title: "Teaching Plan", path: "/teacher/teaching-plan", icon: FileText },
  { title: "Assessments", path: "/teacher/assessments", icon: ClipboardCheck },
  { title: "Settings / Integrity", path: "/teacher/settings", icon: Settings },
  { title: "Support", path: "/teacher/support", icon: HelpCircle },
];

const TeacherLayout = () => {
  const { currentCourse, resetAll } = useApp();
  const navigate = useNavigate();
  const location = useLocation();
  const isMobile = useIsMobile();

  const handleLogout = () => {
    resetAll();
    navigate("/");
  };

  if (isMobile) {
    return (
      <div className="flex min-h-screen flex-col bg-background">
        <header className="flex items-center justify-between border-b px-4 py-3">
          <div>
            <h1 className="font-heading text-lg font-bold">Next<span className="text-primary">Step</span></h1>
            {currentCourse && <p className="text-xs text-muted-foreground">{currentCourse.name}</p>}
          </div>
          <button onClick={handleLogout} className="text-muted-foreground"><LogOut className="h-5 w-5" /></button>
        </header>
        <main className="flex-1 overflow-auto">
          <Outlet />
        </main>
        <nav className="flex border-t bg-card">
          {teacherNav.slice(0, 5).map((item) => (
            <NavLink key={item.path} to={item.path} end={false}
              className="flex flex-1 flex-col items-center gap-1 py-2 text-muted-foreground"
              activeClassName="text-primary"
            >
              <item.icon className="h-5 w-5" />
              <span className="text-[10px]">{item.title.split(" ")[0]}</span>
            </NavLink>
          ))}
        </nav>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-background">
      <aside className="flex w-60 flex-col border-r bg-sidebar">
        <div className="border-b p-4">
          <h1 className="font-heading text-xl font-bold">Next<span className="text-primary">Step</span></h1>
          <p className="mt-0.5 text-xs text-muted-foreground">Professor View</p>
          {currentCourse && (
            <p className="mt-1 text-xs font-medium text-primary">{currentCourse.name}</p>
          )}
        </div>

        <nav className="flex-1 space-y-1 p-3">
          {teacherNav.map((item) => (
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
          ))}
        </nav>

        {/* Quick Actions */}
        <div className="border-t p-3 space-y-1.5">
          <p className="px-3 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Quick Actions</p>
          <Button variant="ghost" size="sm" className="w-full justify-start gap-2 text-sm text-sidebar-foreground">
            <Send className="h-3.5 w-3.5" /> Broadcast Message
          </Button>
          <Button variant="ghost" size="sm" className="w-full justify-start gap-2 text-sm text-sidebar-foreground">
            <BookOpen className="h-3.5 w-3.5" /> Push Practice Set
          </Button>
          <Button variant="ghost" size="sm" className="w-full justify-start gap-2 text-sm text-sidebar-foreground">
            <MessageSquare className="h-3.5 w-3.5" /> Add Concept Note
          </Button>
        </div>

        <div className="border-t p-3 space-y-1">
          <button onClick={handleLogout} className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-muted-foreground hover:bg-sidebar-accent">
            <LogOut className="h-4 w-4" />
            Switch Role
          </button>
        </div>
      </aside>

      <main className="flex-1 overflow-auto">
        <Outlet />
      </main>
    </div>
  );
};

export default TeacherLayout;
