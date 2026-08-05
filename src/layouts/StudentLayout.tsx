import { useState } from "react";
import { Outlet, useNavigate } from "react-router-dom";
import { Home, Route, MessageSquare, FlaskConical, MessageSquareHeart } from "lucide-react";
import { useApp } from "@/contexts/AppContext";
import { NavLink } from "@/components/NavLink";
import { useIsMobile } from "@/hooks/use-mobile";
import StudentCourseSwitcher from "@/components/StudentCourseSwitcher";
import AddCourseDialog from "@/components/AddCourseDialog";
import { useEnrolledCourseId } from "@/hooks/useEnrolledCourseId";
import { useCourseProjectLabs } from "@/hooks/useCourseProjectLabs";

const studentNav = [
  { title: "Home", path: "/student/home", icon: Home },
  { title: "Learning Path", path: "/student/learning-path", icon: Route },
  { title: "Teaching Assistant", path: "/student/chat", icon: MessageSquare },
  { title: "Project Lab", path: "/student/project-lab", icon: FlaskConical },
  { title: "Feedback", path: "/student/feedback", icon: MessageSquareHeart },
];

const StudentLayout = () => {
  const { studentProfile } = useApp();
  const isMobile = useIsMobile();
  const [addCourseOpen, setAddCourseOpen] = useState(false);
  const enrolledCourseId = useEnrolledCourseId();
  const { labs: projectLabs, loading: labsLoading } = useCourseProjectLabs(enrolledCourseId, true);

  // Project Lab is professor-authored and optional: hide the tab entirely
  // when the active course has no published labs.
  const showProjectLab = !labsLoading && projectLabs.length > 0;
  const nav = studentNav.filter((i) => i.path !== "/student/project-lab" || showProjectLab);

  if (isMobile) {
    return (
      <div className="flex min-h-screen flex-col bg-background">
        <header className="flex items-center justify-between gap-3 border-b px-4 py-3">
          <div className="min-w-0 flex-1">
            <h1 className="font-heading text-lg font-bold">Next<span className="text-primary">Step</span></h1>
            <div className="mt-1">
              <StudentCourseSwitcher onAddCourse={() => setAddCourseOpen(true)} />
            </div>
          </div>
        </header>
        <main className="flex-1 overflow-auto">
          <Outlet />
        </main>
        <nav className="flex border-t bg-card">
          {nav.map((item) => (
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
        <AddCourseDialog open={addCourseOpen} onOpenChange={setAddCourseOpen} />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-background">
      <aside className="flex w-60 flex-col border-r bg-sidebar">
        <div className="border-b p-4">
          <h1 className="font-heading text-xl font-bold">Next<span className="text-primary">Step</span></h1>
          <p className="mt-0.5 text-xs text-muted-foreground">Student View</p>
          <div className="mt-3">
            <StudentCourseSwitcher onAddCourse={() => setAddCourseOpen(true)} />
          </div>
        </div>

        <nav className="flex-1 space-y-1 p-3">
          {nav.map((item) => (
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

        {studentProfile && (
          <div className="border-t p-4">
            <p className="text-xs text-muted-foreground">Logged in as</p>
            <p className="text-sm font-medium">{studentProfile.name}</p>
          </div>
        )}

      </aside>

      <main className="flex-1 overflow-auto">
        <Outlet />
      </main>

      <AddCourseDialog open={addCourseOpen} onOpenChange={setAddCourseOpen} />
    </div>
  );
};

export default StudentLayout;
