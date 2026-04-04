import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { GraduationCap } from "lucide-react";

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

  if (loading) return <div className="space-y-4"><Skeleton className="h-8 w-48" /><Skeleton className="h-64 w-full" /></div>;

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

export default AdminStudents;
