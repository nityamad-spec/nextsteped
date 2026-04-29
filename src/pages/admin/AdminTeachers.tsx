import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Users, MoreHorizontal, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";

interface TeacherRow {
  id: string;
  name: string;
  email: string | null;
  department: string | null;
  created_at: string;
  course_count: number;
  student_count: number;
}

const AdminTeachers = () => {
  const [teachers, setTeachers] = useState<TeacherRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [target, setTarget] = useState<TeacherRow | null>(null);
  const [confirmText, setConfirmText] = useState("");
  const [transferTo, setTransferTo] = useState<string>("");
  const [deleting, setDeleting] = useState(false);
  const { toast } = useToast();

  const fetchAll = async () => {
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, name, email, department, created_at")
      .eq("role", "teacher")
      .order("created_at", { ascending: false });

    if (!profiles) { setLoading(false); return; }

    const teacherIds = profiles.map(p => p.id);
    const { data: courses } = await supabase
      .from("courses")
      .select("id, teacher_id")
      .in("teacher_id", teacherIds.length ? teacherIds : ["__none__"]);

    const courseIds = (courses || []).map(c => c.id);
    const { data: enrollments } = courseIds.length
      ? await supabase.from("enrollments").select("course_id").in("course_id", courseIds)
      : { data: [] };

    const courseCountMap: Record<string, number> = {};
    (courses || []).forEach(c => { courseCountMap[c.teacher_id] = (courseCountMap[c.teacher_id] || 0) + 1; });

    const courseTeacherMap: Record<string, string> = {};
    (courses || []).forEach(c => { courseTeacherMap[c.id] = c.teacher_id; });

    const studentCountMap: Record<string, number> = {};
    (enrollments || []).forEach(e => {
      const tid = courseTeacherMap[e.course_id];
      if (tid) studentCountMap[tid] = (studentCountMap[tid] || 0) + 1;
    });

    setTeachers(profiles.map(p => ({
      ...p,
      course_count: courseCountMap[p.id] || 0,
      student_count: studentCountMap[p.id] || 0,
    })));
    setLoading(false);
  };

  useEffect(() => { fetchAll(); }, []);

  const handleDelete = async () => {
    if (!target) return;
    const ownsCourses = target.course_count > 0;
    if (ownsCourses && !transferTo) {
      toast({ title: "Pick a transfer target", description: "Select a teacher to receive the courses.", variant: "destructive" });
      return;
    }
    setDeleting(true);
    const { data, error } = await supabase.functions.invoke("delete-user", {
      body: {
        user_id: target.id,
        role: "teacher",
        course_action: ownsCourses ? "transfer" : "block",
        transfer_to: ownsCourses ? transferTo : undefined,
      },
    });
    setDeleting(false);
    if (error || (data as any)?.error) {
      toast({ title: "Delete failed", description: (data as any)?.error || error?.message, variant: "destructive" });
      return;
    }
    toast({ title: "Teacher deleted", description: `${target.name} has been removed.` });
    setTarget(null);
    setConfirmText("");
    setTransferTo("");
    fetchAll();
  };

  if (loading) return <div className="space-y-4"><Skeleton className="h-8 w-48" /><Skeleton className="h-64 w-full" /></div>;

  const expectedConfirm = (target?.email || target?.name || "").trim();
  const confirmOk = confirmText.trim().toLowerCase() === expectedConfirm.toLowerCase() && expectedConfirm.length > 0;
  const ownsCourses = (target?.course_count ?? 0) > 0;
  const transferOptions = teachers.filter(t => t.id !== target?.id);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold tracking-tight text-foreground">All Teachers</h2>
        <p className="text-muted-foreground">Browse all registered professors</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Users className="h-5 w-5" />{teachers.length} Teachers</CardTitle>
        </CardHeader>
        <CardContent>
          {teachers.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">No teachers registered yet</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Department</TableHead>
                  <TableHead>Courses</TableHead>
                  <TableHead>Students</TableHead>
                  <TableHead>Joined</TableHead>
                  <TableHead className="w-[50px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {teachers.map(t => (
                  <TableRow key={t.id}>
                    <TableCell className="font-medium">{t.name}</TableCell>
                    <TableCell className="text-muted-foreground">{t.email || "—"}</TableCell>
                    <TableCell>{t.department || "—"}</TableCell>
                    <TableCell>
                      <Badge variant="secondary" className="text-[10px]">{t.course_count}</Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-[10px]">{t.student_count}</Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {new Date(t.created_at).toLocaleDateString()}
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            className="text-destructive focus:text-destructive"
                            onClick={() => { setTarget(t); setConfirmText(""); setTransferTo(""); }}
                          >
                            <Trash2 className="h-4 w-4 mr-2" /> Delete user
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

      <AlertDialog open={!!target} onOpenChange={(o) => { if (!o) { setTarget(null); setConfirmText(""); setTransferTo(""); } }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete teacher</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                <p>
                  This will permanently delete <strong>{target?.name}</strong>{target?.email ? ` (${target.email})` : ""},
                  along with their materials, authored questions, setup progress, applications, and chat history.
                  This cannot be undone.
                </p>
                {ownsCourses && (
                  <div className="rounded-md border border-border p-3 space-y-2">
                    <p className="text-sm">
                      Owns <strong>{target?.course_count}</strong> course{target?.course_count === 1 ? "" : "s"} with{" "}
                      <strong>{target?.student_count}</strong> enrolled student{target?.student_count === 1 ? "" : "s"}.
                      Transfer ownership to another teacher to proceed:
                    </p>
                    <Select value={transferTo} onValueChange={setTransferTo}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select a teacher…" />
                      </SelectTrigger>
                      <SelectContent>
                        {transferOptions.length === 0 ? (
                          <div className="px-2 py-1.5 text-sm text-muted-foreground">No other teachers available</div>
                        ) : transferOptions.map(t => (
                          <SelectItem key={t.id} value={t.id}>
                            {t.name}{t.email ? ` — ${t.email}` : ""}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                <div>
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
              disabled={!confirmOk || deleting || (ownsCourses && !transferTo)}
              onClick={(e) => { e.preventDefault(); handleDelete(); }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? "Deleting…" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default AdminTeachers;
