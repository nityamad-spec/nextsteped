import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { GraduationCap, MoreHorizontal, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";

interface CourseEnrollment {
  courseId: string;
  name: string;
  mastery: string | null;
  enrolledAt: string;
}

interface StudentGroup {
  key: string;
  profileIds: string[]; // all profile ids merged into this row
  primaryProfileId: string; // most recent profile id (used for delete)
  name: string;
  email: string | null;
  roll_number: string | null;
  created_at: string; // earliest profile creation
  courses: CourseEnrollment[];
}

const AdminStudents = () => {
  const [students, setStudents] = useState<StudentGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [target, setTarget] = useState<StudentGroup | null>(null);
  const [confirmText, setConfirmText] = useState("");
  const [deleting, setDeleting] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    const fetch = async () => {
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, name, email, roll_number, created_at")
        .eq("role", "student")
        .order("created_at", { ascending: false });

      if (!profiles) { setLoading(false); return; }

      const studentIds = profiles.map(p => p.id);
      const idFilter = studentIds.length ? studentIds : ["__none__"];

      const [{ data: enrollments }, { data: masteryRows }] = await Promise.all([
        supabase
          .from("enrollments")
          .select("student_id, course_id, enrolled_at")
          .in("student_id", idFilter),
        supabase
          .from("student_course_mastery")
          .select("student_id, course_id, learner_level")
          .in("student_id", idFilter),
      ]);

      const courseIds = [...new Set((enrollments || []).map(e => e.course_id))];
      const { data: courses } = courseIds.length
        ? await supabase.from("courses").select("id, name").in("id", courseIds)
        : { data: [] };

      const courseMap = Object.fromEntries((courses || []).map(c => [c.id, c.name]));
      const masteryMap = new Map<string, string>();
      (masteryRows || []).forEach(m => {
        masteryMap.set(`${m.student_id}:${m.course_id}`, m.learner_level);
      });

      const enrollmentsByStudent = new Map<string, CourseEnrollment[]>();
      (enrollments || []).forEach(e => {
        const arr = enrollmentsByStudent.get(e.student_id) || [];
        arr.push({
          courseId: e.course_id,
          name: courseMap[e.course_id] || "Unknown",
          mastery: masteryMap.get(`${e.student_id}:${e.course_id}`) || null,
          enrolledAt: e.enrolled_at,
        });
        enrollmentsByStudent.set(e.student_id, arr);
      });

      // Group profiles by lowercased email (fallback to profile id when null).
      const groups = new Map<string, StudentGroup>();
      // profiles ordered created_at desc → first occurrence is the most recent.
      for (const p of profiles) {
        const key = p.email ? `email:${p.email.trim().toLowerCase()}` : `id:${p.id}`;
        const existing = groups.get(key);
        const profileCourses = enrollmentsByStudent.get(p.id) || [];
        if (!existing) {
          groups.set(key, {
            key,
            profileIds: [p.id],
            primaryProfileId: p.id,
            name: p.name,
            email: p.email,
            roll_number: p.roll_number,
            created_at: p.created_at,
            courses: [...profileCourses],
          });
        } else {
          existing.profileIds.push(p.id);
          existing.courses.push(...profileCourses);
          // keep earliest created_at
          if (new Date(p.created_at) < new Date(existing.created_at)) {
            existing.created_at = p.created_at;
          }
          // fill missing roll number from another profile if needed
          if (!existing.roll_number && p.roll_number) existing.roll_number = p.roll_number;
        }
      }

      // Sort each student's courses by enrolledAt desc and dedupe by courseId.
      const final = Array.from(groups.values()).map(g => {
        const seen = new Set<string>();
        const deduped: CourseEnrollment[] = [];
        for (const c of g.courses.sort((a, b) => new Date(b.enrolledAt).getTime() - new Date(a.enrolledAt).getTime())) {
          if (seen.has(c.courseId)) continue;
          seen.add(c.courseId);
          deduped.push(c);
        }
        g.courses = deduped;
        return g;
      });

      // Sort students by most recent profile creation desc
      final.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

      setStudents(final);
      setLoading(false);
    };
    fetch();
  }, []);

  const handleDelete = async () => {
    if (!target) return;
    setDeleting(true);
    const { data, error } = await supabase.functions.invoke("delete-user", {
      body: { user_id: target.primaryProfileId, role: "student" },
    });
    setDeleting(false);
    if (error || (data as any)?.error) {
      toast({ title: "Delete failed", description: (data as any)?.error || error?.message, variant: "destructive" });
      return;
    }
    toast({ title: "Student deleted", description: `${target.name} has been removed.` });
    setStudents(prev => prev.filter(s => s.key !== target.key));
    setTarget(null);
    setConfirmText("");
  };

  if (loading) return <div className="space-y-4"><Skeleton className="h-8 w-48" /><Skeleton className="h-64 w-full" /></div>;

  const expectedConfirm = (target?.email || target?.name || "").trim();
  const confirmOk = confirmText.trim().toLowerCase() === expectedConfirm.toLowerCase() && expectedConfirm.length > 0;

  return (
    <TooltipProvider>
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold tracking-tight text-foreground">All Students</h2>
        <p className="text-muted-foreground">Browse all registered students</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><GraduationCap className="h-5 w-5" />{students.length} Students</CardTitle>
        </CardHeader>
        <CardContent>
          {students.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">No students registered yet</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Roll Number</TableHead>
                  <TableHead>Courses</TableHead>
                  <TableHead>Joined</TableHead>
                  <TableHead className="w-[50px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {students.map(s => {
                  const multiAccount = s.profileIds.length > 1;
                  return (
                  <TableRow key={s.key}>
                    <TableCell className="font-medium align-top">{s.name}</TableCell>
                    <TableCell className="text-muted-foreground align-top">
                      {s.email || "—"}
                      {multiAccount && (
                        <Badge variant="outline" className="ml-2 text-[10px]">{s.profileIds.length} accounts</Badge>
                      )}
                    </TableCell>
                    <TableCell className="align-top">{s.roll_number || "—"}</TableCell>
                    <TableCell className="align-top">
                      {s.courses.length === 0 ? (
                        <span className="text-muted-foreground">Not enrolled</span>
                      ) : (
                        <div className="space-y-1">
                          {s.courses.map(c => (
                            <div key={c.courseId} className="flex items-center gap-2 text-sm">
                              <span className="font-medium">{c.name}</span>
                              {c.mastery ? (
                                <Badge variant="outline" className="text-[10px]">{c.mastery}</Badge>
                              ) : (
                                <span className="text-[10px] text-muted-foreground">no mastery</span>
                              )}
                              <span className="text-xs text-muted-foreground">
                                joined {new Date(c.enrolledAt).toLocaleDateString()}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm align-top">
                      {new Date(s.created_at).toLocaleDateString()}
                    </TableCell>
                    <TableCell className="align-top">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          {multiAccount ? (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <div>
                                  <DropdownMenuItem disabled className="text-muted-foreground">
                                    <Trash2 className="h-4 w-4 mr-2" /> Delete user
                                  </DropdownMenuItem>
                                </div>
                              </TooltipTrigger>
                              <TooltipContent>Multiple accounts share this email — resolve in DB</TooltipContent>
                            </Tooltip>
                          ) : (
                            <DropdownMenuItem
                              className="text-destructive focus:text-destructive"
                              onClick={() => { setTarget(s); setConfirmText(""); }}
                            >
                              <Trash2 className="h-4 w-4 mr-2" /> Delete user
                            </DropdownMenuItem>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <AlertDialog open={!!target} onOpenChange={(o) => { if (!o) { setTarget(null); setConfirmText(""); } }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete student</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2">
                <p>
                  This will permanently delete <strong>{target?.name}</strong>{target?.email ? ` (${target.email})` : ""},
                  including their enrollments, assessment results, diagnostic results, feedback, and chat history.
                  This cannot be undone.
                </p>
                <div className="pt-2">
                  <Label htmlFor="confirm" className="text-xs">
                    Type <code className="text-foreground">{expectedConfirm}</code> to confirm
                  </Label>
                  <Input
                    id="confirm"
                    value={confirmText}
                    onChange={(e) => setConfirmText(e.target.value)}
                    autoComplete="off"
                    className="mt-1"
                  />
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={!confirmOk || deleting}
              onClick={(e) => { e.preventDefault(); handleDelete(); }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? "Deleting…" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
    </TooltipProvider>
  );
};

export default AdminStudents;
