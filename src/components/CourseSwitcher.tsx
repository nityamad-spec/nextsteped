import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Check, ChevronsUpDown, PlusCircle, BookOpen } from "lucide-react";
import { useApp } from "@/contexts/AppContext";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useTeacherNavPermissions } from "@/hooks/useTeacherNavPermissions";
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command, CommandEmpty, CommandGroup, CommandItem, CommandList, CommandSeparator,
} from "@/components/ui/command";
import { cn } from "@/lib/utils";


interface CourseRow {
  id: string;
  name: string;
  course_code: string | null;
  updated_at: string;
}

/**
 * Sidebar/header course switcher for professors with multiple courses.
 *
 * - Loads every course the teacher owns (or collaborates on) ordered by
 *   most-recently-updated.
 * - Selecting a course writes it to AppContext + localStorage and reloads
 *   so all hooks (useTeacherCourseId, useTeacherSetupStatus, useTASettings,
 *   etc.) re-resolve against the new active course.
 * - "Add new course" links to /teacher/courses/new.
 */
const CourseSwitcher = ({ collapsed }: { collapsed?: boolean }) => {
  const { user } = useAuth();
  const { currentCourse, setCurrentCourse } = useApp();
  const { canCreateCourses } = useTeacherNavPermissions();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [courses, setCourses] = useState<CourseRow[]>([]);
  const [loading, setLoading] = useState(true);


  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    const load = async () => {
      // Owned courses
      const { data: owned } = await supabase
        .from("courses")
        .select("id, name, course_code, updated_at")
        .eq("teacher_id", user.id);

      // Collaborator courses
      const { data: memberships } = await supabase
        .from("course_teachers")
        .select("course_id")
        .eq("teacher_id", user.id);

      const collabIds = (memberships ?? [])
        .map((m: any) => m.course_id)
        .filter((id: string) => !owned?.some((o: any) => o.id === id));

      let collaborated: CourseRow[] = [];
      if (collabIds.length > 0) {
        const { data } = await supabase
          .from("courses")
          .select("id, name, course_code, updated_at")
          .in("id", collabIds);
        collaborated = (data ?? []) as CourseRow[];
      }

      const all = [...((owned ?? []) as CourseRow[]), ...collaborated].sort(
        (a, b) => (b.updated_at > a.updated_at ? 1 : -1)
      );

      if (!cancelled) {
        setCourses(all);
        setLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [user]);

  const switchTo = (c: CourseRow) => {
    setCurrentCourse({ id: c.id, name: c.name } as any);
    localStorage.setItem("currentCourseId", c.id);
    setOpen(false);
    // Hard reload so every hook keyed on courseId re-fetches.
    window.location.assign("/teacher/courses/dashboard");
  };

  const activeId = currentCourse?.id || (typeof window !== "undefined" ? localStorage.getItem("currentCourseId") : null);
  const active = courses.find((c) => c.id === activeId) ?? courses[0];
  const label = active?.name ?? (loading ? "Loading…" : "No course");

  if (collapsed) {
    return (
      <button
        onClick={() => navigate("/teacher/courses/new")}
        className="inline-flex w-full items-center justify-center rounded-md border border-dashed border-primary/40 px-2 py-1.5 text-xs text-primary hover:bg-primary/5"
        title="Add new course"
      >
        <PlusCircle className="h-3.5 w-3.5" />
      </button>
    );
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          role="combobox"
          aria-expanded={open}
          className="flex w-full items-center justify-between gap-2 rounded-lg border bg-card px-3 py-2 text-left text-sm shadow-sm transition-colors hover:bg-muted/50"
        >
          <div className="flex min-w-0 items-center gap-2">
            <BookOpen className="h-4 w-4 shrink-0 text-primary" />
            <div className="min-w-0">
              <p className="truncate text-xs font-medium text-foreground">{label}</p>
              {active?.course_code && (
                <p className="truncate text-[10px] text-muted-foreground">{active.course_code}</p>
              )}
            </div>
          </div>
          <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-[260px] p-0" align="start">
        <Command>
          <CommandList>
            {courses.length === 0 && !loading && (
              <CommandEmpty>No courses yet.</CommandEmpty>
            )}
            {courses.length > 0 && (
              <CommandGroup heading="Your courses">
                {courses.map((c) => (
                  <CommandItem
                    key={c.id}
                    value={`${c.name} ${c.course_code ?? ""}`}
                    onSelect={() => switchTo(c)}
                    className="flex items-center gap-2"
                  >
                    <Check
                      className={cn(
                        "h-4 w-4",
                        c.id === activeId ? "opacity-100 text-primary" : "opacity-0"
                      )}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm">{c.name}</p>
                      {c.course_code && (
                        <p className="truncate text-[10px] text-muted-foreground">{c.course_code}</p>
                      )}
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
            <CommandSeparator />
            <CommandGroup>
              <CommandItem
                onSelect={() => {
                  setOpen(false);
                  navigate("/teacher/courses/new");
                }}
                className="gap-2 text-primary"
              >
                <PlusCircle className="h-4 w-4" />
                Add new course
              </CommandItem>
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
};

export default CourseSwitcher;
