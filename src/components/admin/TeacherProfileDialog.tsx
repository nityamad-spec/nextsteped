import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Users, BookOpen, Plus, Trash2, ArrowUpDown, ShieldCheck } from "lucide-react";
import { TEACHER_NAV } from "@/config/teacherNav";
import { TEACHER_NAV_ALWAYS_ON } from "@/hooks/useTeacherNavPermissions";

interface TeacherLite {
  id: string;
  name: string;
  email: string | null;
  department: string | null;
  created_at: string;
}

interface CourseRow {
  id: string;
  name: string;
  course_code: string | null;
  role: "owner" | "collaborator";
  student_count: number;
}

interface Props {
  teacher: TeacherLite | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onChanged?: () => void;
}

export default function TeacherProfileDialog({ teacher, open, onOpenChange, onChanged }: Props) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [courses, setCourses] = useState<CourseRow[]>([]);
  const [allowedPaths, setAllowedPaths] = useState<string[]>([]);
  const [canCreateCourses, setCanCreateCourses] = useState<boolean>(false);
  const [savingPerms, setSavingPerms] = useState(false);


  // Ownership transfer / remove state
  const [ownerActionCourse, setOwnerActionCourse] = useState<CourseRow | null>(null);
  const [ownerActionKind, setOwnerActionKind] = useState<"transfer" | "remove" | null>(null);
  const [transferTargetId, setTransferTargetId] = useState<string>("");
  const [otherTeachers, setOtherTeachers] = useState<{ id: string; name: string; email: string | null }[]>([]);
  const [processing, setProcessing] = useState(false);

  // Add course state
  const [addOpen, setAddOpen] = useState(false);
  const [availableCourses, setAvailableCourses] = useState<{ id: string; name: string; course_code: string | null }[]>([]);
  const [addCourseId, setAddCourseId] = useState<string>("");

  useEffect(() => {
    if (!open || !teacher) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      const [ownedRes, collabRes, permRes, teachersRes] = await Promise.all([
        supabase.from("courses").select("id, name, course_code").eq("teacher_id", teacher.id),
        supabase.from("course_teachers").select("course_id, role, courses:course_id(id, name, course_code)").eq("teacher_id", teacher.id),
        supabase.from("teacher_nav_permissions").select("allowed_paths, can_create_courses").eq("teacher_id", teacher.id).maybeSingle(),
        supabase.from("profiles").select("id, name, email").eq("role", "teacher").neq("id", teacher.id),
      ]);

      const owned: CourseRow[] = (ownedRes.data || []).map((c: any) => ({
        id: c.id, name: c.name, course_code: c.course_code, role: "owner", student_count: 0,
      }));
      const collab: CourseRow[] = (collabRes.data || [])
        .filter((r: any) => r.courses)
        .map((r: any) => ({
          id: r.courses.id, name: r.courses.name, course_code: r.courses.course_code,
          role: "collaborator", student_count: 0,
        }));
      const merged = [...owned, ...collab];

      // student counts
      const ids = merged.map((c) => c.id);
      if (ids.length > 0) {
        const { data: enr } = await supabase.from("enrollments").select("course_id").in("course_id", ids);
        const counts: Record<string, number> = {};
        (enr || []).forEach((e: any) => { counts[e.course_id] = (counts[e.course_id] || 0) + 1; });
        merged.forEach((c) => { c.student_count = counts[c.id] || 0; });
      }

      if (cancelled) return;
      setCourses(merged);
      setAllowedPaths(((permRes.data?.allowed_paths as string[] | undefined) ?? [...TEACHER_NAV_ALWAYS_ON]));
      setCanCreateCourses(Boolean(permRes.data?.can_create_courses));

      setOtherTeachers(teachersRes.data || []);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [open, teacher]);

  const refresh = async () => {
    if (!teacher) return;
    const [ownedRes, collabRes] = await Promise.all([
      supabase.from("courses").select("id, name, course_code").eq("teacher_id", teacher.id),
      supabase.from("course_teachers").select("course_id, role, courses:course_id(id, name, course_code)").eq("teacher_id", teacher.id),
    ]);
    const owned: CourseRow[] = (ownedRes.data || []).map((c: any) => ({
      id: c.id, name: c.name, course_code: c.course_code, role: "owner", student_count: 0,
    }));
    const collab: CourseRow[] = (collabRes.data || [])
      .filter((r: any) => r.courses)
      .map((r: any) => ({
        id: r.courses.id, name: r.courses.name, course_code: r.courses.course_code,
        role: "collaborator", student_count: 0,
      }));
    const merged = [...owned, ...collab];
    const ids = merged.map((c) => c.id);
    if (ids.length > 0) {
      const { data: enr } = await supabase.from("enrollments").select("course_id").in("course_id", ids);
      const counts: Record<string, number> = {};
      (enr || []).forEach((e: any) => { counts[e.course_id] = (counts[e.course_id] || 0) + 1; });
      merged.forEach((c) => { c.student_count = counts[c.id] || 0; });
    }
    setCourses(merged);
    onChanged?.();
  };

  const togglePath = (path: string, checked: boolean) => {
    setAllowedPaths((prev) => {
      const set = new Set(prev);
      if (checked) set.add(path); else set.delete(path);
      // always-on
      for (const p of TEACHER_NAV_ALWAYS_ON) set.add(p);
      return Array.from(set);
    });
  };

  const savePermissions = async () => {
    if (!teacher || !user) return;
    setSavingPerms(true);
    const payload = {
      teacher_id: teacher.id,
      allowed_paths: Array.from(new Set([...allowedPaths, ...TEACHER_NAV_ALWAYS_ON])),
      can_create_courses: canCreateCourses,
      updated_by: user.id,
      updated_at: new Date().toISOString(),
    };

    const { error } = await supabase
      .from("teacher_nav_permissions")
      .upsert(payload, { onConflict: "teacher_id" });
    setSavingPerms(false);
    if (error) {
      toast({ title: "Save failed", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Navigation access updated" });
  };

  // --- Course role/remove handlers ---
  const promoteCollaboratorToOwner = async (course: CourseRow) => {
    if (!teacher) return;
    setProcessing(true);
    const { error } = await supabase.functions.invoke("transfer-course-ownership", {
      body: { course_id: course.id, new_teacher_id: teacher.id, keep_previous_as_collaborator: true },
    });
    setProcessing(false);
    if (error) {
      toast({ title: "Promote failed", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Promoted to owner", description: `${teacher.name} now owns ${course.name}.` });
    refresh();
  };

  const openOwnerAction = (course: CourseRow, kind: "transfer" | "remove") => {
    setOwnerActionCourse(course);
    setOwnerActionKind(kind);
    setTransferTargetId("");
  };

  const confirmOwnerAction = async () => {
    if (!ownerActionCourse || !ownerActionKind) return;
    if (!transferTargetId) {
      toast({ title: "Select a teacher", variant: "destructive" });
      return;
    }
    setProcessing(true);
    // Transfer ownership. If "remove", the outgoing owner should NOT stay as collaborator.
    const { error } = await supabase.functions.invoke("transfer-course-ownership", {
      body: {
        course_id: ownerActionCourse.id,
        new_teacher_id: transferTargetId,
        keep_previous_as_collaborator: ownerActionKind === "transfer",
      },
    });
    if (error) {
      setProcessing(false);
      toast({ title: "Failed", description: error.message, variant: "destructive" });
      return;
    }
    setProcessing(false);
    toast({
      title: ownerActionKind === "remove" ? "Removed from course" : "Ownership changed",
    });
    setOwnerActionCourse(null);
    setOwnerActionKind(null);
    refresh();
  };

  const removeCollaborator = async (course: CourseRow) => {
    if (!teacher) return;
    setProcessing(true);
    const { error } = await supabase
      .from("course_teachers")
      .delete()
      .eq("course_id", course.id)
      .eq("teacher_id", teacher.id);
    setProcessing(false);
    if (error) {
      toast({ title: "Remove failed", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Removed from course" });
    refresh();
  };

  const openAddCourse = async () => {
    if (!teacher) return;
    setAddCourseId("");
    setAddOpen(true);
    const existing = new Set(courses.map((c) => c.id));
    const { data } = await supabase.from("courses").select("id, name, course_code").order("name");
    setAvailableCourses((data || []).filter((c: any) => !existing.has(c.id)));
  };

  const confirmAddCourse = async () => {
    if (!teacher || !addCourseId) return;
    setProcessing(true);
    const { error } = await supabase
      .from("course_teachers")
      .insert({ course_id: addCourseId, teacher_id: teacher.id, role: "collaborator" });
    setProcessing(false);
    if (error) {
      toast({ title: "Add failed", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Added as collaborator" });
    setAddOpen(false);
    refresh();
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-3xl max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              {teacher?.name || "Teacher"}
            </DialogTitle>
            <DialogDescription asChild>
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs pt-1">
                <span>Email: <span className="text-foreground">{teacher?.email || "—"}</span></span>
                <span>Department: <span className="text-foreground">{teacher?.department || "—"}</span></span>
                {teacher?.created_at && (
                  <span>Joined: <span className="text-foreground">{new Date(teacher.created_at).toLocaleDateString()}</span></span>
                )}
              </div>
            </DialogDescription>
          </DialogHeader>

          <Tabs defaultValue="courses" className="flex-1 min-h-0 flex flex-col overflow-hidden">
            <TabsList>
              <TabsTrigger value="courses"><BookOpen className="h-4 w-4 mr-1.5" />Courses</TabsTrigger>
              <TabsTrigger value="access"><ShieldCheck className="h-4 w-4 mr-1.5" />Navigation Access</TabsTrigger>
            </TabsList>

            <TabsContent value="courses" className="flex-1 min-h-0 overflow-auto space-y-3">
              <div className="flex justify-end">
                <Button size="sm" variant="outline" onClick={openAddCourse}>
                  <Plus className="h-4 w-4 mr-1.5" /> Add to course
                </Button>
              </div>
              {loading ? (
                <Skeleton className="h-40 w-full" />
              ) : courses.length === 0 ? (
                <p className="text-sm text-muted-foreground py-8 text-center">Not part of any course.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Course</TableHead>
                      <TableHead>Role</TableHead>
                      <TableHead>Students</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {courses.map((c) => (
                      <TableRow key={c.id}>
                        <TableCell>
                          <div className="font-medium">{c.name}</div>
                          {c.course_code && <div className="text-xs text-muted-foreground">{c.course_code}</div>}
                        </TableCell>
                        <TableCell>
                          <Badge variant={c.role === "owner" ? "default" : "secondary"} className="text-[10px]">
                            {c.role === "owner" ? "Owner" : "Collaborator"}
                          </Badge>
                        </TableCell>
                        <TableCell><Badge variant="outline" className="text-[10px]">{c.student_count}</Badge></TableCell>
                        <TableCell className="text-right space-x-1">
                          {c.role === "collaborator" ? (
                            <>
                              <Button size="sm" variant="ghost" disabled={processing}
                                onClick={() => promoteCollaboratorToOwner(c)}>
                                <ArrowUpDown className="h-3.5 w-3.5 mr-1" /> Make owner
                              </Button>
                              <Button size="sm" variant="ghost" className="text-destructive"
                                disabled={processing} onClick={() => removeCollaborator(c)}>
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </>
                          ) : (
                            <>
                              <Button size="sm" variant="ghost" disabled={processing}
                                onClick={() => openOwnerAction(c, "transfer")}>
                                <ArrowUpDown className="h-3.5 w-3.5 mr-1" /> Transfer
                              </Button>
                              <Button size="sm" variant="ghost" className="text-destructive"
                                disabled={processing} onClick={() => openOwnerAction(c, "remove")}>
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </TabsContent>

            <TabsContent value="access" className="flex-1 min-h-0 overflow-auto space-y-3">
              <div className="rounded-md border bg-muted/30 p-3 text-xs text-muted-foreground">
                Unchecked pages are hidden entirely from this teacher&apos;s sidebar and blocked from direct URL access.
                Course Setup and Support are always visible.
              </div>
              <div className="space-y-2">
                {TEACHER_NAV.map((item) => {
                  const forced = item.alwaysVisible === true;
                  const checked = forced || allowedPaths.includes(item.path);
                  return (
                    <label key={item.path}
                      className="flex items-center gap-3 rounded-lg border p-3 cursor-pointer hover:bg-muted/40">
                      <Checkbox
                        checked={checked}
                        disabled={forced || savingPerms}
                        onCheckedChange={(v) => togglePath(item.path, !!v)}
                      />
                      <item.icon className="h-4 w-4 text-muted-foreground" />
                      <div className="flex-1">
                        <div className="text-sm font-medium">{item.title}</div>
                        <div className="text-xs text-muted-foreground">{item.path}</div>
                        {item.path === "/teacher/setup" && !forced && (
                          <div className="text-[11px] text-muted-foreground/80 mt-1">
                            Automatically shown while any of this teacher&apos;s courses still needs setup.
                          </div>
                        )}
                      </div>
                      {forced && <Badge variant="outline" className="text-[10px]">Always visible</Badge>}
                    </label>
                  );
                })}
              </div>
              <div className="flex justify-end">
                <Button onClick={savePermissions} disabled={savingPerms}>
                  {savingPerms ? "Saving…" : "Save access"}
                </Button>
              </div>
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>

      {/* Owner action (transfer or remove) confirmation */}
      <AlertDialog
        open={!!ownerActionCourse}
        onOpenChange={(o) => { if (!o) { setOwnerActionCourse(null); setOwnerActionKind(null); } }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {ownerActionKind === "remove" ? "Remove owner from course" : "Transfer ownership"}
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                <p>
                  {ownerActionKind === "remove"
                    ? `Every course needs an owner. Choose a teacher to take over ${ownerActionCourse?.name} — ${teacher?.name} will be removed from the course entirely.`
                    : `Choose the new owner of ${ownerActionCourse?.name}. ${teacher?.name} will remain as a collaborator.`}
                </p>
                <Select value={transferTargetId} onValueChange={setTransferTargetId}>
                  <SelectTrigger><SelectValue placeholder="Select a teacher…" /></SelectTrigger>
                  <SelectContent>
                    {otherTeachers.length === 0 ? (
                      <div className="px-2 py-1.5 text-sm text-muted-foreground">No other teachers available</div>
                    ) : otherTeachers.map((t) => (
                      <SelectItem key={t.id} value={t.id}>
                        {t.name}{t.email ? ` — ${t.email}` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={processing}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={!transferTargetId || processing}
              onClick={(e) => { e.preventDefault(); confirmOwnerAction(); }}
            >
              {processing ? "Working…" : "Confirm"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Add to course */}
      <AlertDialog open={addOpen} onOpenChange={setAddOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Add {teacher?.name} to a course</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                <p>They will be added as a collaborator.</p>
                <Select value={addCourseId} onValueChange={setAddCourseId}>
                  <SelectTrigger><SelectValue placeholder="Select a course…" /></SelectTrigger>
                  <SelectContent>
                    {availableCourses.length === 0 ? (
                      <div className="px-2 py-1.5 text-sm text-muted-foreground">No other courses available</div>
                    ) : availableCourses.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}{c.course_code ? ` — ${c.course_code}` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={processing}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={!addCourseId || processing}
              onClick={(e) => { e.preventDefault(); confirmAddCourse(); }}
            >
              {processing ? "Adding…" : "Add"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
