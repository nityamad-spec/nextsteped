import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { CheckCircle, XCircle, UserPlus, Users, Clock, BookOpen } from "lucide-react";

interface TeacherApplication {
  id: string;
  email: string;
  name: string;
  status: string;
  assignment_type: string | null;
  assigned_course_id: string | null;
  admin_notes: string | null;
  created_at: string;
  reviewed_at: string | null;
}

interface Course {
  id: string;
  name: string;
  course_code: string | null;
}

const AdminDashboard = () => {
  const { user } = useAuth();
  const [applications, setApplications] = useState<TeacherApplication[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [selectedCourses, setSelectedCourses] = useState<Record<string, string>>({});

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    const [appsRes, coursesRes] = await Promise.all([
      supabase.from("teacher_applications" as any).select("*").order("created_at", { ascending: false }),
      supabase.from("courses").select("id, name, course_code"),
    ]);

    if (appsRes.data) setApplications(appsRes.data as any);
    if (coursesRes.data) setCourses(coursesRes.data);
    setLoading(false);
  };

  const handleAction = async (applicationId: string, action: "approve" | "reject", assignmentType?: string) => {
    setProcessingId(applicationId);
    try {
      const courseId = assignmentType === "collaborator" ? selectedCourses[applicationId] : undefined;

      if (assignmentType === "collaborator" && !courseId) {
        toast.error("Please select a course to assign the teacher to");
        setProcessingId(null);
        return;
      }

      const { data, error } = await supabase.functions.invoke("approve-teacher", {
        body: { applicationId, action, assignmentType, courseId },
      });

      if (error) throw error;

      toast.success(action === "approve" ? "Teacher approved successfully!" : "Application rejected");
      fetchData();
    } catch (err: any) {
      toast.error(err.message || "Failed to process application");
    } finally {
      setProcessingId(null);
    }
  };

  const pending = applications.filter((a) => a.status === "pending");
  const approved = applications.filter((a) => a.status === "approved");
  const rejected = applications.filter((a) => a.status === "rejected");

  if (loading) {
    return (
      <div className="mx-auto max-w-4xl space-y-6">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-10 w-full" />
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-40 w-full" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h2 className="text-3xl font-bold tracking-tight text-foreground">Teacher Applications</h2>
        <p className="text-muted-foreground">Review and manage teacher signup requests</p>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <Clock className="h-8 w-8 text-amber-500" />
            <div>
              <p className="text-2xl font-bold">{pending.length}</p>
              <p className="text-sm text-muted-foreground">Pending</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <CheckCircle className="h-8 w-8 text-emerald-500" />
            <div>
              <p className="text-2xl font-bold">{approved.length}</p>
              <p className="text-sm text-muted-foreground">Approved</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <XCircle className="h-8 w-8 text-destructive" />
            <div>
              <p className="text-2xl font-bold">{rejected.length}</p>
              <p className="text-sm text-muted-foreground">Rejected</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="pending">
        <TabsList>
          <TabsTrigger value="pending" className="gap-2">
            <Clock className="h-4 w-4" /> Pending ({pending.length})
          </TabsTrigger>
          <TabsTrigger value="approved" className="gap-2">
            <CheckCircle className="h-4 w-4" /> Approved ({approved.length})
          </TabsTrigger>
          <TabsTrigger value="rejected" className="gap-2">
            <XCircle className="h-4 w-4" /> Rejected ({rejected.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="pending" className="space-y-4">
          {pending.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                <Users className="h-12 w-12 text-muted-foreground/40" />
                <p className="mt-4 text-muted-foreground">No pending applications</p>
              </CardContent>
            </Card>
          ) : (
            pending.map((app) => (
              <Card key={app.id}>
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div>
                      <CardTitle className="flex items-center gap-2 text-lg">
                        <UserPlus className="h-5 w-5 text-primary" />
                        {app.name}
                      </CardTitle>
                      <CardDescription>{app.email}</CardDescription>
                    </div>
                    <Badge variant="outline" className="text-amber-600 border-amber-300 bg-amber-50">
                      Pending
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <p className="text-sm text-muted-foreground">
                    Applied {new Date(app.created_at).toLocaleDateString()}
                  </p>

                  <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
                    <div className="flex-1 space-y-1">
                      <label className="text-sm font-medium">Assign to course (optional)</label>
                      <Select
                        value={selectedCourses[app.id] || ""}
                        onValueChange={(v) => setSelectedCourses((prev) => ({ ...prev, [app.id]: v }))}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select a course..." />
                        </SelectTrigger>
                        <SelectContent>
                          {courses.map((c) => (
                            <SelectItem key={c.id} value={c.id}>
                              {c.course_code ? `${c.course_code} — ` : ""}{c.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        disabled={processingId === app.id}
                        onClick={() =>
                          handleAction(
                            app.id,
                            "approve",
                            selectedCourses[app.id] ? "collaborator" : "new_course"
                          )
                        }
                        className="gap-1"
                      >
                        <CheckCircle className="h-4 w-4" />
                        {selectedCourses[app.id] ? "Approve as Collaborator" : "Approve as Owner"}
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        disabled={processingId === app.id}
                        onClick={() => handleAction(app.id, "reject")}
                        className="gap-1"
                      >
                        <XCircle className="h-4 w-4" />
                        Reject
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </TabsContent>

        <TabsContent value="approved" className="space-y-4">
          {approved.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                <CheckCircle className="h-12 w-12 text-muted-foreground/40" />
                <p className="mt-4 text-muted-foreground">No approved applications yet</p>
              </CardContent>
            </Card>
          ) : (
            approved.map((app) => (
              <Card key={app.id}>
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div>
                      <CardTitle className="text-lg">{app.name}</CardTitle>
                      <CardDescription>{app.email}</CardDescription>
                    </div>
                    <Badge className="bg-emerald-100 text-emerald-700 border-emerald-300">Approved</Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="flex gap-4 text-sm text-muted-foreground">
                    <span>Applied: {new Date(app.created_at).toLocaleDateString()}</span>
                    {app.reviewed_at && (
                      <span>Approved: {new Date(app.reviewed_at).toLocaleDateString()}</span>
                    )}
                    {app.assignment_type && (
                      <Badge variant="secondary">
                        {app.assignment_type === "collaborator" ? (
                          <><BookOpen className="mr-1 h-3 w-3" />Collaborator</>
                        ) : (
                          <><UserPlus className="mr-1 h-3 w-3" />New Course Owner</>
                        )}
                      </Badge>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </TabsContent>

        <TabsContent value="rejected" className="space-y-4">
          {rejected.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                <XCircle className="h-12 w-12 text-muted-foreground/40" />
                <p className="mt-4 text-muted-foreground">No rejected applications</p>
              </CardContent>
            </Card>
          ) : (
            rejected.map((app) => (
              <Card key={app.id}>
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div>
                      <CardTitle className="text-lg">{app.name}</CardTitle>
                      <CardDescription>{app.email}</CardDescription>
                    </div>
                    <Badge variant="destructive">Rejected</Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="text-sm text-muted-foreground">
                    <span>Applied: {new Date(app.created_at).toLocaleDateString()}</span>
                    {app.reviewed_at && (
                      <span className="ml-4">Reviewed: {new Date(app.reviewed_at).toLocaleDateString()}</span>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default AdminDashboard;
