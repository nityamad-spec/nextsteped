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
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { CheckCircle, XCircle, UserPlus, Users, Clock, BookOpen, Crown, PlusCircle, Settings } from "lucide-react";

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
  enrollment_open?: boolean;
}

type AssignmentRole = "collaborator" | "owner_swap" | "new_course";

const AdminDashboard = () => {
  const { user } = useAuth();
  const [applications, setApplications] = useState<TeacherApplication[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [selectedCourses, setSelectedCourses] = useState<Record<string, string>>({});
  const [selectedRoles, setSelectedRoles] = useState<Record<string, AssignmentRole>>({});
  const [teacherSignupsEnabled, setTeacherSignupsEnabled] = useState(true);
  const [togglingEnrollment, setTogglingEnrollment] = useState<string | null>(null);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    const [appsRes, coursesRes, settingsRes] = await Promise.all([
      supabase.from("teacher_applications" as any).select("*").order("created_at", { ascending: false }),
      supabase.from("courses").select("id, name, course_code, enrollment_open"),
      supabase.from("admin_settings" as any).select("*").eq("key", "teacher_signups_enabled").maybeSingle(),
    ]);

    if (appsRes.data) setApplications(appsRes.data as any);
    if (coursesRes.data) setCourses(coursesRes.data as any);
    if (settingsRes.data) setTeacherSignupsEnabled((settingsRes.data as any).value !== "false");
    setLoading(false);
  };

  const toggleTeacherSignups = async (enabled: boolean) => {
    setTeacherSignupsEnabled(enabled);
    const { error } = await supabase
      .from("admin_settings" as any)
      .update({ value: enabled ? "true" : "false", updated_at: new Date().toISOString() } as any)
      .eq("key", "teacher_signups_enabled");
    if (error) {
      toast.error("Failed to update setting");
      setTeacherSignupsEnabled(!enabled);
    } else {
      toast.success(enabled ? "Teacher signups enabled" : "Teacher signups disabled");
    }
  };

  const toggleCourseEnrollment = async (courseId: string, open: boolean) => {
    setTogglingEnrollment(courseId);
    const { error } = await supabase
      .from("courses")
      .update({ enrollment_open: open } as any)
      .eq("id", courseId);
    if (error) {
      toast.error("Failed to update enrollment status");
    } else {
      setCourses((prev) => prev.map((c) => (c.id === courseId ? { ...c, enrollment_open: open } : c)));
      toast.success(open ? "Enrollment opened" : "Enrollment closed");
    }
    setTogglingEnrollment(null);
  };

  const handleAction = async (applicationId: string, action: "approve" | "reject") => {
    setProcessingId(applicationId);
    try {
      const role = selectedRoles[applicationId] || "new_course";
      const courseId = role !== "new_course" ? selectedCourses[applicationId] : undefined;

      if (role !== "new_course" && !courseId) {
        toast.error("Please select a course");
        setProcessingId(null);
        return;
      }

      const { data, error } = await supabase.functions.invoke("approve-teacher", {
        body: { applicationId, action, assignmentType: action === "approve" ? role : undefined, courseId },
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

  const getApproveLabel = (appId: string) => {
    const role = selectedRoles[appId] || "new_course";
    switch (role) {
      case "collaborator": return "Approve as Collaborator";
      case "owner_swap": return "Approve as Owner (Swap)";
      case "new_course": return "Approve for New Course";
    }
  };

  const pending = applications.filter((a) => a.status === "pending");
  const approved = applications.filter((a) => a.status === "approved");
  const rejected = applications.filter((a) => a.status === "rejected");

  const showCourseDropdown = (appId: string) => {
    const role = selectedRoles[appId];
    return role === "collaborator" || role === "owner_swap";
  };

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
        <h2 className="text-3xl font-bold tracking-tight text-foreground">Admin Dashboard</h2>
        <p className="text-muted-foreground">Manage teacher applications and system settings</p>
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
          <TabsTrigger value="settings" className="gap-2">
            <Settings className="h-4 w-4" /> Settings
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

                  <div className="space-y-3">
                    <label className="text-sm font-medium">Assignment Role</label>
                    <RadioGroup
                      value={selectedRoles[app.id] || ""}
                      onValueChange={(v) =>
                        setSelectedRoles((prev) => ({ ...prev, [app.id]: v as AssignmentRole }))
                      }
                      className="space-y-2"
                    >
                      <div className="flex items-center gap-2">
                        <RadioGroupItem value="collaborator" id={`${app.id}-collab`} />
                        <Label htmlFor={`${app.id}-collab`} className="flex items-center gap-1.5 cursor-pointer">
                          <BookOpen className="h-4 w-4 text-muted-foreground" />
                          Collaborator on existing course
                        </Label>
                      </div>
                      <div className="flex items-center gap-2">
                        <RadioGroupItem value="owner_swap" id={`${app.id}-swap`} />
                        <Label htmlFor={`${app.id}-swap`} className="flex items-center gap-1.5 cursor-pointer">
                          <Crown className="h-4 w-4 text-muted-foreground" />
                          Owner of existing course (current owner becomes collaborator)
                        </Label>
                      </div>
                      <div className="flex items-center gap-2">
                        <RadioGroupItem value="new_course" id={`${app.id}-new`} />
                        <Label htmlFor={`${app.id}-new`} className="flex items-center gap-1.5 cursor-pointer">
                          <PlusCircle className="h-4 w-4 text-muted-foreground" />
                          Owner of a brand new course
                        </Label>
                      </div>
                    </RadioGroup>
                  </div>

                  {showCourseDropdown(app.id) && (
                    <div className="space-y-1">
                      <label className="text-sm font-medium">Select course</label>
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
                  )}

                  <div className="flex gap-2 pt-2">
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button
                          size="sm"
                          disabled={processingId === app.id || !selectedRoles[app.id]}
                          className="gap-1"
                        >
                          <CheckCircle className="h-4 w-4" />
                          {getApproveLabel(app.id)}
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Approve {app.name}?</AlertDialogTitle>
                          <AlertDialogDescription>
                            This will create an account for <strong>{app.email}</strong> and send them an invite email.
                            {selectedRoles[app.id] === "owner_swap" && " The current course owner will be demoted to collaborator."}
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction onClick={() => handleAction(app.id, "approve")}>
                            Yes, approve
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>

                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button
                          size="sm"
                          variant="destructive"
                          disabled={processingId === app.id}
                          className="gap-1"
                        >
                          <XCircle className="h-4 w-4" />
                          Reject
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Reject {app.name}?</AlertDialogTitle>
                          <AlertDialogDescription>
                            This will reject the application from <strong>{app.email}</strong>. This action cannot be undone.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction
                            onClick={() => handleAction(app.id, "reject")}
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                          >
                            Yes, reject
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
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
                        ) : app.assignment_type === "owner_swap" ? (
                          <><Crown className="mr-1 h-3 w-3" />Owner (Swapped)</>
                        ) : (
                          <><PlusCircle className="mr-1 h-3 w-3" />New Course Owner</>
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

        <TabsContent value="settings" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Teacher Applications</CardTitle>
              <CardDescription>Control whether new teacher applications can be submitted</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">Allow teacher signups</p>
                  <p className="text-xs text-muted-foreground">
                    {teacherSignupsEnabled
                      ? "Teachers can submit new applications"
                      : "Teacher application form is disabled"}
                  </p>
                </div>
                <Switch
                  checked={teacherSignupsEnabled}
                  onCheckedChange={toggleTeacherSignups}
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Course Enrollment</CardTitle>
              <CardDescription>Open or close student enrollment per course</CardDescription>
            </CardHeader>
            <CardContent>
              {courses.length === 0 ? (
                <p className="text-sm text-muted-foreground">No courses found</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Course</TableHead>
                      <TableHead>Code</TableHead>
                      <TableHead className="text-right">Enrollment</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {courses.map((course) => (
                      <TableRow key={course.id}>
                        <TableCell className="font-medium">{course.name}</TableCell>
                        <TableCell className="text-muted-foreground">{course.course_code || "—"}</TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-2">
                            <span className="text-xs text-muted-foreground">
                              {course.enrollment_open !== false ? "Open" : "Closed"}
                            </span>
                            <Switch
                              checked={course.enrollment_open !== false}
                              onCheckedChange={(open) => toggleCourseEnrollment(course.id, open)}
                              disabled={togglingEnrollment === course.id}
                            />
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default AdminDashboard;
