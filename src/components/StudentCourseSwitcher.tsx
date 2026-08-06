import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Check, ChevronsUpDown, PlusCircle, BookOpen } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
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
  enrolled_at: string;
  suspended: boolean;
}

interface StudentCourseSwitcherProps {
  /** Called when the user picks "Add a Course" — host opens the modal. */
  onAddCourse: () => void;
}

const StudentCourseSwitcher = ({ onAddCourse }: StudentCourseSwitcherProps) => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [courses, setCourses] = useState<CourseRow[]>([]);
  const [activeId, setActiveId] = useState<string | null>(
    () => localStorage.getItem("enrolledCourseId")
  );
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    const load = async () => {
      const { data } = await supabase
        .from("enrollments")
        .select("course_id, enrolled_at, suspended_at, courses!inner(id, name, course_code)")
        .eq("student_id", user.id)
        .order("enrolled_at", { ascending: false });

      const rows: CourseRow[] = (data ?? []).map((e: any) => ({
        id: e.courses.id,
        name: e.courses.name,
        course_code: e.courses.course_code,
        enrolled_at: e.enrolled_at,
        suspended: !!e.suspended_at,
      }));
      if (!cancelled) {
        setCourses(rows);
        setLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [user]);

  const switchTo = async (c: CourseRow) => {
    if (!user) return;
    localStorage.setItem("enrolledCourseId", c.id);
    setActiveId(c.id);
    setOpen(false);
    await supabase.from("profiles").update({ active_course_id: c.id }).eq("id", user.id);

    if (c.suspended) {
      window.location.assign("/student/home");
      return;
    }

    // Check whether this course has a diagnostic; if not, go take it.
    const { data: diag } = await supabase
      .from("diagnostic_results")
      .select("id")
      .eq("student_id", user.id)
      .eq("course_id", c.id)
      .maybeSingle();

    if (!diag) {
      window.location.assign(`/student/diagnostic?course=${c.id}`);
    } else {
      window.location.assign("/student/home");
    }
  };


  const active = courses.find(c => c.id === activeId) ?? courses[0];
  const label = active?.name ?? (loading ? "Loading…" : "No course");

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
                    className={cn("flex items-center gap-2", c.suspended && "opacity-60")}
                  >
                    <Check
                      className={cn(
                        "h-4 w-4",
                        c.id === (active?.id ?? null) ? "opacity-100 text-primary" : "opacity-0",
                      )}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm">{c.name}</p>
                      {c.suspended ? (
                        <p className="truncate text-[10px] text-destructive">
                          Suspended — contact your professor
                        </p>
                      ) : c.course_code ? (
                        <p className="truncate text-[10px] text-muted-foreground">{c.course_code}</p>
                      ) : null}
                    </div>

                  </CommandItem>
                ))}
              </CommandGroup>
            )}
            <CommandSeparator />
            <CommandGroup>
              <CommandItem
                onSelect={() => { setOpen(false); onAddCourse(); }}
                className="gap-2 text-primary"
              >
                <PlusCircle className="h-4 w-4" />
                Add a Course
              </CommandItem>
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
};

export default StudentCourseSwitcher;
