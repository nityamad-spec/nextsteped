import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowLeft, ArrowRight, Loader2, BookOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useApp } from "@/contexts/AppContext";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { mockCourse } from "@/data/mockData";
import { toast } from "sonner";

const availableYears = ["2027", "2028", "2029", "2030", "2031"];

/**
 * Course creation/configuration page.
 *
 * Entry points:
 *   1. First-time login of an approved teacher (no courses yet) — auto-routed
 *      here from /teacher.
 *   2. Existing teacher clicks "Add New Course" from the sidebar switcher.
 *
 * On submit: inserts a row in `courses`, sets it as the active course in
 * AppContext + localStorage, then sends the user to /teacher/setup.
 */
const NewCoursePage = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user, loading: authLoading } = useAuth();
  const { setCurrentCourse } = useApp();

  // If this is the *first* course (no courses exist yet), allow navigation
  // back to landing only via Sign Out — otherwise show "Cancel" back to
  // the dashboard.
  const isFirstCourse = searchParams.get("first") === "1";

  const [courseName, setCourseName] = useState("");
  const [courseCode, setCourseCode] = useState("");
  const [term, setTerm] = useState("");
  const [graduationYear, setGraduationYear] = useState("");
  const [learningObjective, setLearningObjective] = useState("");
  const [saving, setSaving] = useState(false);

  // If the user *does* already have at least one course and they hit this
  // page directly without `?first=1`, that's fine — it's "Add New Course".
  // We only redirect if they truly have no business being here (no auth).
  useEffect(() => {
    if (!authLoading && !user) navigate("/", { replace: true });
  }, [authLoading, user, navigate]);

  const isValid =
    courseName.trim() &&
    courseCode.trim() &&
    term &&
    graduationYear &&
    learningObjective.trim();

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValid || saving || !user) return;
    setSaving(true);

    try {
      const { data, error } = await supabase
        .from("courses")
        .insert({
          teacher_id: user.id,
          name: courseName.trim(),
          course_code: courseCode.trim(),
          term,
          graduation_year: [graduationYear],
          objectives: learningObjective.split("\n").filter(Boolean),
        })
        .select("id, name, enrollment_code")
        .single();

      if (error || !data) {
        toast.error(`Failed to create course: ${error?.message ?? "Unknown error"}`);
        setSaving(false);
        return;
      }

      localStorage.setItem("currentCourseId", data.id);
      setCurrentCourse({
        ...mockCourse,
        id: data.id,
        name: data.name,
        term: (term as any) || mockCourse.term,
        objectives: learningObjective.split("\n").filter(Boolean),
        enrollmentCode: data.enrollment_code,
      });

      toast.success(`"${data.name}" created`);
      navigate("/teacher/setup", { replace: true });
    } catch (err: any) {
      toast.error(`Something went wrong: ${err?.message ?? "Unknown error"}`);
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-background px-4 py-12">
      <div className="mx-auto w-full max-w-2xl">
        {!isFirstCourse && (
          <button
            onClick={() => navigate("/teacher/courses/dashboard")}
            className="mb-6 inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" /> Back to Dashboard
          </button>
        )}

        <div className="mb-8 text-center">
          <h1 className="font-heading text-3xl font-bold tracking-tight">
            {isFirstCourse ? "Set up your first course" : "Add a new course"}
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            We'll use this info to scaffold your lesson plan, materials, and student enrollment.
          </p>
        </div>

        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
          <Card>
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <BookOpen className="h-5 w-5" />
                </div>
                <div>
                  <CardTitle>Course Details</CardTitle>
                  <CardDescription>The basics — you can refine everything later</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleCreate} className="space-y-5">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="course-name">Course Name</Label>
                    <Input
                      id="course-name"
                      placeholder="e.g. Intro to Python"
                      value={courseName}
                      onChange={(e) => setCourseName(e.target.value)}
                      autoFocus
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="course-code">Course Code</Label>
                    <Input
                      id="course-code"
                      placeholder="e.g. PY101"
                      value={courseCode}
                      onChange={(e) => setCourseCode(e.target.value)}
                    />
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Semester</Label>
                    <Select value={term} onValueChange={setTerm}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select semester" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="First Semester">First Semester</SelectItem>
                        <SelectItem value="Second Semester">Second Semester</SelectItem>
                        <SelectItem value="Summer Semester">Summer Semester</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Student Graduation Year</Label>
                    <Select value={graduationYear} onValueChange={setGraduationYear}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select year" />
                      </SelectTrigger>
                      <SelectContent>
                        {availableYears.map((y) => (
                          <SelectItem key={y} value={y}>
                            {y}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="objectives">Learning Objectives</Label>
                  <Textarea
                    id="objectives"
                    className="min-h-[100px]"
                    placeholder="What should students be able to do by the end of the course?"
                    value={learningObjective}
                    onChange={(e) => setLearningObjective(e.target.value)}
                  />
                </div>

                <div className="flex flex-col items-end gap-2 pt-2">
                  <Button type="submit" disabled={!isValid || saving} size="lg" className="gap-2">
                    {saving ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" /> Creating…
                      </>
                    ) : (
                      <>
                        Create & Go to Course Setup <ArrowRight className="h-4 w-4" />
                      </>
                    )}
                  </Button>
                  {!isValid && !saving && (
                    <p className="text-xs text-muted-foreground">Fill in all fields to continue.</p>
                  )}
                </div>
              </form>
            </CardContent>
          </Card>
        </motion.div>
      </div>
    </div>
  );
};

export default NewCoursePage;
