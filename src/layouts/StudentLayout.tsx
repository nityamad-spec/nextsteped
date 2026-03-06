import { Outlet, useNavigate, useLocation } from "react-router-dom";
import { Home, MessageSquare, Mic, TrendingUp, Briefcase, LogOut, BookOpen, Brain } from "lucide-react";
import { useApp } from "@/contexts/AppContext";
import { availableCourses } from "@/data/mockData";
import { NavLink } from "@/components/NavLink";
import { useIsMobile } from "@/hooks/use-mobile";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

const studentNav = [
  { title: "Home", path: "/student/home", icon: Home, enabled: true },
  { title: "Teaching Assistant Chat", path: "/student/chat", icon: MessageSquare, enabled: true },
  { title: "Progress", path: "/student/progress", icon: TrendingUp, enabled: false, badge: "Soon" },
];

const StudentLayout = () => {
  const { currentCourse, studentProfile, resetAll } = useApp();
  const courseName = currentCourse?.name || availableCourses.find(c => c.code === studentProfile?.courseCode)?.name || "Course";
  const navigate = useNavigate();
  const location = useLocation();
  const isMobile = useIsMobile();

  const handleLogout = () => {
    resetAll();
    navigate("/");
  };

  const handleStartLearning = () => {
    navigate("/student/chat?mode=learning&newchat=true");
  };

  const handleExamSimulation = () => {
    navigate("/student/chat?mode=exam&newchat=true");
  };

  if (isMobile) {
    return (
      <div className="flex min-h-screen flex-col bg-background">
        <header className="flex items-center justify-between border-b px-4 py-3">
          <div>
            <h1 className="font-heading text-lg font-bold">Next<span className="text-primary">Step</span></h1>
            <p className="text-xs text-muted-foreground">{courseName}</p>
          </div>
          <button onClick={handleLogout} className="text-muted-foreground"><LogOut className="h-5 w-5" /></button>
        </header>
        <main className="flex-1 overflow-auto">
          <Outlet />
        </main>
        <nav className="flex border-t bg-card">
          {studentNav.map((item) => (
            <NavLink
              key={item.path}
              to={item.enabled ? item.path : "#"}
              end={false}
              className={`flex flex-1 flex-col items-center gap-1 py-2 ${item.enabled ? "text-muted-foreground" : "text-muted-foreground/40 pointer-events-none"}`}
              activeClassName="text-primary"
              onClick={(e) => !item.enabled && e.preventDefault()}
            >
              <div className="relative">
                <item.icon className="h-5 w-5" />
                {item.badge && (
                  <span className="absolute -right-3 -top-1 rounded-full bg-muted px-1 text-[7px] font-medium text-muted-foreground">{item.badge}</span>
                )}
              </div>
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
          <p className="mt-0.5 text-xs text-muted-foreground">Student View</p>
          <p className="mt-1 text-xs font-medium text-primary">{courseName}</p>
        </div>

        <nav className="flex-1 space-y-1 p-3">
          {studentNav.map((item) => (
            item.enabled ? (
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
            ) : (
              <div
                key={item.path}
                className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-muted-foreground/40 cursor-not-allowed"
              >
                <item.icon className="h-4 w-4" />
                {item.title}
                <Badge variant="secondary" className="ml-auto text-[10px]">{item.badge}</Badge>
              </div>
            )
          ))}
        </nav>

        {/* Quick Actions */}
        <div className="border-t p-3 space-y-1.5">
          <p className="px-3 text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Quick Actions</p>
          <Button onClick={handleStartLearning} className="w-full justify-start gap-2" size="sm" variant="ghost">
            <BookOpen className="h-4 w-4" /> Start Learning Session
          </Button>
          <Button variant="ghost" onClick={handleExamSimulation} className="w-full justify-start gap-2" size="sm">
            <Brain className="h-4 w-4" /> Exam Simulation
          </Button>
          <Button variant="ghost" onClick={() => navigate("/student/progress")} className="w-full justify-start gap-2" size="sm">
            <TrendingUp className="h-4 w-4" /> View Progress
          </Button>
        </div>

        {studentProfile && (
          <div className="border-t p-4">
            <p className="text-xs text-muted-foreground">Logged in as</p>
            <p className="text-sm font-medium">{studentProfile.name}</p>
            <Badge variant="outline" className="mt-1 text-xs">{studentProfile.learnerLevel}</Badge>
          </div>
        )}

        <div className="border-t p-3">
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

export default StudentLayout;
