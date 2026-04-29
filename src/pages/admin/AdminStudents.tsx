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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";

interface StudentRow {
  id: string;
  name: string;
  email: string | null;
  roll_number: string | null;
  learner_level: string | null;
  graduation_year: string | null;
  created_at: string;
  course_name: string | null;
}

const AdminStudents = () => {
  const [students, setStudents] = useState<StudentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [target, setTarget] = useState<StudentRow | null>(null);
  const [confirmText, setConfirmText] = useState("");
  const [deleting, setDeleting] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    const fetch = async () => {
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, name, email, roll_number, learner_level, graduation_year, created_at")
        .eq("role", "student")
        .order("created_at", { ascending: false });

      if (!profiles) { setLoading(false); return; }

      const studentIds = profiles.map(p => p.id);
      const { data: enrollments } = await supabase
        .from("enrollments")
        .select("student_id, course_id")
        .in("student_id", studentIds.length ? studentIds : ["__none__"]);

      const courseIds = [...new Set((enrollments || []).map(e => e.course_id))];
      const { data: courses } = courseIds.length
        ? await supabase.from("courses").select("id, name").in("id", courseIds)
        : { data: [] };

      const courseMap = Object.fromEntries((courses || []).map(c => [c.id, c.name]));
      const studentCourseMap: Record<string, string> = {};
      (enrollments || []).forEach(e => { studentCourseMap[e.student_id] = courseMap[e.course_id] || "Unknown"; });

      setStudents(profiles.map(p => ({
        ...p,
        course_name: studentCourseMap[p.id] || null,
      })));
      setLoading(false);
    };
    fetch();
  }, []);

  const handleDelete = async () => {
    if (!target) return;
    setDeleting(true);
    const { data, error } = await supabase.functions.invoke("delete-user", {
      body: { user_id: target.id, role: "student" },
    });
    setDeleting(false);
    if (error || (data as any)?.error) {
      toast({ title: "Delete failed", description: (data as any)?.error || error?.message, variant: "destructive" });
      return;
    }
    toast({ title: "Student deleted", description: `${target.name} has been removed.` });
    setStudents(prev => prev.filter(s => s.id !== target.id));
    setTarget(null);
    setConfirmText("");
  };

  if (loading) return <div className="space-y-4"><Skeleton className="h-8 w-48" /><Skeleton className="h-64 w-full" /></div>;

  const expectedConfirm = (target?.email || target?.name || "").trim();
  const confirmOk = confirmText.trim().toLowerCase() === expectedConfirm.toLowerCase() && expectedConfirm.length > 0;

  return (
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
                  <TableHead>Course</TableHead>
                  <TableHead>Level</TableHead>
                  <TableHead>Joined</TableHead>
                  <TableHead className="w-[50px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {students.map(s => (
                  <TableRow key={s.id}>
                    <TableCell className="font-medium">{s.name}</TableCell>
                    <TableCell className="text-muted-foreground">{s.email || "—"}</TableCell>
                    <TableCell>{s.roll_number || "—"}</TableCell>
                    <TableCell>{s.course_name || <span className="text-muted-foreground">Not enrolled</span>}</TableCell>
                    <TableCell>
                      {s.learner_level ? (
                        <Badge variant="outline" className="text-[10px]">{s.learner_level}</Badge>
                      ) : "—"}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {new Date(s.created_at).toLocaleDateString()}
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
                            onClick={() => { setTarget(s); setConfirmText(""); }}
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
  );
};

export default AdminStudents;
