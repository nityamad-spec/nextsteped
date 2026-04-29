import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { BookOpen, MoreHorizontal, ArrowRightLeft, Check, ChevronsUpDown, Trash2 } from "lucide-react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface CourseRow {
  id: string;
  name: string;
  course_code: string | null;
  term: string;
  enrollment_code: string;
  enrollment_open: boolean;
  published: boolean;
  created_at: string;
  teacher_id: string;
  teacher_name: string;
  teacher_email: string | null;
  student_count: number;
}

interface TeacherOption {
  id: string;
  name: string;
  email: string | null;
}

const AdminCourses = () => {
  const [courses, setCourses] = useState<CourseRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [teachers, setTeachers] = useState<TeacherOption[]>([]);

  // Transfer dialog state
  const [transferCourse, setTransferCourse] = useState<CourseRow | null>(null);
  const [selectedTeacherId, setSelectedTeacherId] = useState<string>("");
  const [keepAsCollaborator, setKeepAsCollaborator] = useState(true);
  const [comboOpen, setComboOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [impact, setImpact] = useState<{
    enrollments: number;
    collaborators: number;
    assessments: number;
    weeks: number;
  } | null>(null);

  // Delete dialog state
  const [deleteCourse, setDeleteCourse] = useState<CourseRow | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [deleteImpact, setDeleteImpact] = useState<typeof impact>(null);

  const loadCourses = async () => {
    const { data: coursesData } = await supabase
      .from("courses")
      .select("id, name, course_code, term, enrollment_code, enrollment_open, published, created_at, teacher_id");

    if (!coursesData) {
      setLoading(false);
      return;
    }

    const teacherIds = [...new Set(coursesData.map((c) => c.teacher_id))];
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, name, email")
      .in("id", teacherIds);

    const { data: enrollments } = await supabase.from("enrollments").select("course_id");

    const profileMap = Object.fromEntries((profiles || []).map((p) => [p.id, p]));
    const countMap: Record<string, number> = {};
    (enrollments || []).forEach((e) => {
      countMap[e.course_id] = (countMap[e.course_id] || 0) + 1;
    });

    setCourses(
      coursesData.map((c) => ({
        id: c.id,
        name: c.name,
        course_code: c.course_code,
        term: c.term,
        enrollment_code: c.enrollment_code,
        enrollment_open: c.enrollment_open,
        published: c.published,
        created_at: c.created_at,
        teacher_id: c.teacher_id,
        teacher_name: profileMap[c.teacher_id]?.name || "Unknown",
        teacher_email: profileMap[c.teacher_id]?.email || null,
        student_count: countMap[c.id] || 0,
      }))
    );
    setLoading(false);
  };

  const loadTeachers = async () => {
    const { data } = await supabase
      .from("profiles")
      .select("id, name, email")
      .eq("role", "teacher")
      .order("name");
    setTeachers((data || []) as TeacherOption[]);
  };

  useEffect(() => {
    loadCourses();
    loadTeachers();
  }, []);

  const openTransfer = async (course: CourseRow) => {
    setTransferCourse(course);
    setSelectedTeacherId("");
    setKeepAsCollaborator(true);
    setImpact(null);

    // Load impact summary
    const [enr, ct, aq, wk] = await Promise.all([
      supabase.from("enrollments").select("id", { count: "exact", head: true }).eq("course_id", course.id),
      supabase.from("course_teachers").select("id", { count: "exact", head: true }).eq("course_id", course.id),
      supabase.from("assessment_questions").select("id", { count: "exact", head: true }).eq("course_id", course.id),
      supabase.from("lesson_plan_weeks").select("id", { count: "exact", head: true }).eq("course_id", course.id),
    ]);
    setImpact({
      enrollments: enr.count || 0,
      collaborators: ct.count || 0,
      assessments: aq.count || 0,
      weeks: wk.count || 0,
    });
  };

  const eligibleTeachers = useMemo(
    () => teachers.filter((t) => t.id !== transferCourse?.teacher_id),
    [teachers, transferCourse]
  );

  const selectedTeacher = useMemo(
    () => eligibleTeachers.find((t) => t.id === selectedTeacherId) || null,
    [eligibleTeachers, selectedTeacherId]
  );

  const handleTransfer = async () => {
    if (!transferCourse || !selectedTeacherId) return;
    setSubmitting(true);
    try {
      const { data, error } = await supabase.functions.invoke("transfer-course-ownership", {
        body: {
          course_id: transferCourse.id,
          new_teacher_id: selectedTeacherId,
          keep_previous_as_collaborator: keepAsCollaborator,
        },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);

      const newOwner = eligibleTeachers.find((t) => t.id === selectedTeacherId);
      setCourses((prev) =>
        prev.map((c) =>
          c.id === transferCourse.id
            ? {
                ...c,
                teacher_id: selectedTeacherId,
                teacher_name: newOwner?.name || c.teacher_name,
                teacher_email: newOwner?.email || c.teacher_email,
              }
            : c
        )
      );
      toast.success(`Ownership transferred to ${newOwner?.name ?? "new teacher"}`);
      setTransferCourse(null);
    } catch (e: any) {
      toast.error(e?.message || "Transfer failed");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading)
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    );

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold tracking-tight text-foreground">All Courses</h2>
        <p className="text-muted-foreground">Browse all courses on the platform</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BookOpen className="h-5 w-5" />
            {courses.length} Courses
          </CardTitle>
        </CardHeader>
        <CardContent>
          {courses.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">No courses created yet</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Course</TableHead>
                  <TableHead>Code</TableHead>
                  <TableHead>Professor</TableHead>
                  <TableHead>Term</TableHead>
                  <TableHead>Students</TableHead>
                  <TableHead>Enrollment Code</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-[60px]">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {courses.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="font-medium">{c.name}</TableCell>
                    <TableCell className="text-muted-foreground">{c.course_code || "—"}</TableCell>
                    <TableCell>{c.teacher_name}</TableCell>
                    <TableCell>{c.term}</TableCell>
                    <TableCell>{c.student_count}</TableCell>
                    <TableCell>
                      <code className="text-xs bg-muted px-1.5 py-0.5 rounded">{c.enrollment_code}</code>
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1.5">
                        <Badge variant={c.published ? "default" : "secondary"} className="text-[10px]">
                          {c.published ? "Published" : "Draft"}
                        </Badge>
                        <Badge variant={c.enrollment_open ? "outline" : "secondary"} className="text-[10px]">
                          {c.enrollment_open ? "Open" : "Closed"}
                        </Badge>
                      </div>
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8">
                            <MoreHorizontal className="h-4 w-4" />
                            <span className="sr-only">Actions</span>
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => openTransfer(c)}>
                            <ArrowRightLeft className="mr-2 h-4 w-4" />
                            Transfer ownership
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!transferCourse} onOpenChange={(o) => !o && setTransferCourse(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Transfer course ownership</DialogTitle>
            <DialogDescription>
              Reassign this course to a different teacher. The new owner gains full edit access immediately.
            </DialogDescription>
          </DialogHeader>

          {transferCourse && (
            <div className="space-y-4">
              <div className="rounded-md border p-3 text-sm space-y-1">
                <div>
                  <span className="text-muted-foreground">Course: </span>
                  <span className="font-medium">{transferCourse.name}</span>
                  {transferCourse.course_code && (
                    <span className="text-muted-foreground"> ({transferCourse.course_code})</span>
                  )}
                </div>
                <div>
                  <span className="text-muted-foreground">Current owner: </span>
                  <span className="font-medium">{transferCourse.teacher_name}</span>
                  {transferCourse.teacher_email && (
                    <span className="text-muted-foreground"> · {transferCourse.teacher_email}</span>
                  )}
                </div>
              </div>

              <div className="space-y-2">
                <Label>New owner</Label>
                <Popover open={comboOpen} onOpenChange={setComboOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      role="combobox"
                      aria-expanded={comboOpen}
                      className="w-full justify-between font-normal"
                    >
                      {selectedTeacher
                        ? `${selectedTeacher.name}${selectedTeacher.email ? ` · ${selectedTeacher.email}` : ""}`
                        : "Select a teacher…"}
                      <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                    <Command>
                      <CommandInput placeholder="Search teachers…" />
                      <CommandList>
                        <CommandEmpty>No teachers found.</CommandEmpty>
                        <CommandGroup>
                          {eligibleTeachers.map((t) => (
                            <CommandItem
                              key={t.id}
                              value={`${t.name} ${t.email ?? ""}`}
                              onSelect={() => {
                                setSelectedTeacherId(t.id);
                                setComboOpen(false);
                              }}
                            >
                              <Check
                                className={cn(
                                  "mr-2 h-4 w-4",
                                  selectedTeacherId === t.id ? "opacity-100" : "opacity-0"
                                )}
                              />
                              <div className="flex flex-col">
                                <span>{t.name}</span>
                                {t.email && (
                                  <span className="text-xs text-muted-foreground">{t.email}</span>
                                )}
                              </div>
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
              </div>

              <div className="flex items-center gap-2">
                <Checkbox
                  id="keep-collab"
                  checked={keepAsCollaborator}
                  onCheckedChange={(v) => setKeepAsCollaborator(!!v)}
                />
                <Label htmlFor="keep-collab" className="font-normal cursor-pointer">
                  Keep previous owner as collaborator
                </Label>
              </div>

              <div className="rounded-md bg-muted/40 p-3 text-xs space-y-1">
                <div className="font-medium text-foreground">Impact</div>
                {impact ? (
                  <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-muted-foreground">
                    <div>Enrollments: <span className="text-foreground">{impact.enrollments}</span></div>
                    <div>Collaborators: <span className="text-foreground">{impact.collaborators}</span></div>
                    <div>Assessment questions: <span className="text-foreground">{impact.assessments}</span></div>
                    <div>Lesson plan weeks: <span className="text-foreground">{impact.weeks}</span></div>
                  </div>
                ) : (
                  <div className="text-muted-foreground">Loading…</div>
                )}
                <div className="text-muted-foreground pt-1">
                  All course content (enrollments, lesson plan, assessments) stays with the course.
                </div>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setTransferCourse(null)} disabled={submitting}>
              Cancel
            </Button>
            <Button onClick={handleTransfer} disabled={!selectedTeacherId || submitting}>
              {submitting ? "Transferring…" : "Transfer ownership"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AdminCourses;
