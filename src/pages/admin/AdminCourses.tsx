import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { BookOpen } from "lucide-react";

interface CourseRow {
  id: string;
  name: string;
  course_code: string | null;
  term: string;
  enrollment_code: string;
  enrollment_open: boolean;
  published: boolean;
  created_at: string;
  teacher_name: string;
  student_count: number;
}

const AdminCourses = () => {
  const [courses, setCourses] = useState<CourseRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetch = async () => {
      const { data: coursesData } = await supabase
        .from("courses")
        .select("id, name, course_code, term, enrollment_code, enrollment_open, published, created_at, teacher_id");

      if (!coursesData) { setLoading(false); return; }

      const teacherIds = [...new Set(coursesData.map(c => c.teacher_id))];
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, name")
        .in("id", teacherIds);

      const { data: enrollments } = await supabase
        .from("enrollments")
        .select("course_id");

      const profileMap = Object.fromEntries((profiles || []).map(p => [p.id, p.name]));
      const countMap: Record<string, number> = {};
      (enrollments || []).forEach(e => { countMap[e.course_id] = (countMap[e.course_id] || 0) + 1; });

      setCourses(coursesData.map(c => ({
        id: c.id,
        name: c.name,
        course_code: c.course_code,
        term: c.term,
        enrollment_code: c.enrollment_code,
        enrollment_open: c.enrollment_open,
        published: c.published,
        created_at: c.created_at,
        teacher_name: profileMap[c.teacher_id] || "Unknown",
        student_count: countMap[c.id] || 0,
      })));
      setLoading(false);
    };
    fetch();
  }, []);

  if (loading) return <div className="space-y-4"><Skeleton className="h-8 w-48" /><Skeleton className="h-64 w-full" /></div>;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold tracking-tight text-foreground">All Courses</h2>
        <p className="text-muted-foreground">Browse all courses on the platform</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><BookOpen className="h-5 w-5" />{courses.length} Courses</CardTitle>
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
                </TableRow>
              </TableHeader>
              <TableBody>
                {courses.map(c => (
                  <TableRow key={c.id}>
                    <TableCell className="font-medium">{c.name}</TableCell>
                    <TableCell className="text-muted-foreground">{c.course_code || "—"}</TableCell>
                    <TableCell>{c.teacher_name}</TableCell>
                    <TableCell>{c.term}</TableCell>
                    <TableCell>{c.student_count}</TableCell>
                    <TableCell><code className="text-xs bg-muted px-1.5 py-0.5 rounded">{c.enrollment_code}</code></TableCell>
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

export default AdminCourses;
