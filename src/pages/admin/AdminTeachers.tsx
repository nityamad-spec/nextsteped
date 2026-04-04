import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Users } from "lucide-react";

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

  useEffect(() => {
    const fetch = async () => {
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
    fetch();
  }, []);

  if (loading) return <div className="space-y-4"><Skeleton className="h-8 w-48" /><Skeleton className="h-64 w-full" /></div>;

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
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default AdminTeachers;
