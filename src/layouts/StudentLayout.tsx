import { Outlet, useNavigate } from "react-router-dom";
import { Home, MessageSquare, LogOut, MessageSquareHeart } from "lucide-react";
import { useApp } from "@/contexts/AppContext";
import { useAuth } from "@/contexts/AuthContext";
import { NavLink } from "@/components/NavLink";
import { useIsMobile } from "@/hooks/use-mobile";

const studentNav = [
  { title: "Home", path: "/student/home", icon: Home },
  { title: "Teaching Assistant Chat", path: "/student/chat", icon: MessageSquare },
  { title: "Feedback", path: "/student/feedback", icon: MessageSquareHeart },
];

const StudentLayout = () => {
  const { currentCourse, studentProfile, resetAll } = useApp();
  const { signOut } = useAuth();
  const courseName = currentCourse?.name || "Course";
  const navigate = useNavigate();
  const isMobile = useIsMobile();

  const handleLogout = async () => {
    await signOut();
    resetAll();
    navigate("/");
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
              to={item.path}
              end={false}
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

        {studentProfile && (
          <div className="border-t p-4">
            <p className="text-xs text-muted-foreground">Logged in as</p>
            <p className="text-sm font-medium">{studentProfile.name}</p>
          </div>
        )}

        <div className="border-t p-3">
          <button onClick={handleLogout} className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-muted-foreground hover:bg-sidebar-accent">
            <LogOut className="h-4 w-4" />
            Sign Out
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
