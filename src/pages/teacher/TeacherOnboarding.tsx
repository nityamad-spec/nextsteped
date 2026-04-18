import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { useApp } from "@/contexts/AppContext";
import { useAuth } from "@/contexts/AuthContext";
import { availableDepartments, mockCourse } from "@/data/mockData";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowRight, User, BookOpen } from "lucide-react";
import { toast } from "sonner";

const TeacherOnboarding = () => {
  const { setTeacherProfile, setCurrentCourse } = useApp();
  const { user } = useAuth();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);

  // Profile
  const [name, setName] = useState("");
  const [institution, setInstitution] = useState("");
  const [department, setDepartment] = useState("");
  const [designation, setDesignation] = useState("");

  // Course
  const [courseName, setCourseName] = useState("");
  const [courseCode, setCourseCode] = useState("");
  const [term, setTerm] = useState("");
  const [graduationYear, setGraduationYear] = useState("");
  const [learningObjective, setLearningObjective] = useState("");

  const availableYears = ["2027", "2028", "2029", "2030", "2031"];

  useEffect(() => {
    if (!user) return;
    const fetchExistingData = async () => {
      setLoading(true);
      const storedCourseId = localStorage.getItem("currentCourseId");

      const courseFields = "id, term, objectives, course_code, name, graduation_year";

      const profileRes = await supabase
        .from("profiles")
        .select("name, department, institution, designation")
        .eq("id", user.id)
        .maybeSingle();

      let courseRes: { data: any } = { data: null };
      if (storedCourseId) {
        courseRes = await supabase.from("courses").select(courseFields).eq("id", storedCourseId).maybeSingle();
      } else {
        const owned = await supabase.from("courses")
          .select(courseFields)
          .eq("teacher_id", user.id)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (owned.data) courseRes = owned;
      }

      if (profileRes.data) {
        if (profileRes.data.name) setName(profileRes.data.name);
        if (profileRes.data.department) setDepartment(profileRes.data.department);
        if ((profileRes.data as any).institution) setInstitution((profileRes.data as any).institution);
        if ((profileRes.data as any).designation) setDesignation((profileRes.data as any).designation);
      }

      if (courseRes.data) {
        localStorage.setItem("currentCourseId", courseRes.data.id);
        if (courseRes.data.term) setTerm(courseRes.data.term);
        if (courseRes.data.course_code) setCourseCode(courseRes.data.course_code);
        if (courseRes.data.name) setCourseName(courseRes.data.name);
        if (Array.isArray(courseRes.data.graduation_year) && courseRes.data.graduation_year.length > 0) {
          setGraduationYear(courseRes.data.graduation_year[0]);
        }
        if (Array.isArray(courseRes.data.objectives)) {
          setLearningObjective(courseRes.data.objectives.join("\n"));
        }
      }

      setLoading(false);
    };
    fetchExistingData();
  }, [user]);

  const isValid =
    name.trim() &&
    institution.trim() &&
    department &&
    designation.trim() &&
    courseName.trim() &&
    courseCode.trim() &&
    term &&
    graduationYear &&
    learningObjective.trim();

  const handleContinue = async () => {
    if (!user) return;

    // Upsert profile
    const profilePayload = {
      name,
      department,
      institution,
      designation,
      email: user.email || "",
    };
    const { data: existingProfile } = await supabase
      .from("profiles")
      .select("id")
      .eq("id", user.id)
      .maybeSingle();

    if (existingProfile) {
      const { error } = await supabase.from("profiles").update(profilePayload).eq("id", user.id);
      if (error) { toast.error("Failed to update profile: " + error.message); return; }
    } else {
      const { error } = await supabase.from("profiles").insert({
        id: user.id,
        role: "teacher",
        ...profilePayload,
      });
      if (error) { toast.error("Failed to save profile: " + error.message); return; }
    }

    // Upsert course
    const coursePayload = {
      name: courseName.trim(),
      course_code: courseCode.trim(),
      term,
      graduation_year: [graduationYear],
      objectives: learningObjective.split("\n").filter(Boolean),
    };

    const { data: existingCourse } = await supabase
      .from("courses")
      .select("id")
      .eq("teacher_id", user.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    let courseId: string;
    let enrollmentCode = "";

    if (existingCourse) {
      const { data: updated, error } = await supabase.from("courses")
        .update(coursePayload)
        .eq("id", existingCourse.id)
        .select("id, enrollment_code")
        .single();
      if (error || !updated) { toast.error("Failed to update course: " + (error?.message ?? "Unknown")); return; }
      courseId = updated.id;
      enrollmentCode = updated.enrollment_code;
    } else {
      const { data: created, error } = await supabase.from("courses")
        .insert({ ...coursePayload, teacher_id: user.id })
        .select("id, enrollment_code")
        .single();
      if (error || !created) { toast.error("Failed to save course: " + (error?.message ?? "Unknown")); return; }
      courseId = created.id;
      enrollmentCode = created.enrollment_code;
    }

    localStorage.setItem("currentCourseId", courseId);

    setTeacherProfile({ name, department, courses: [courseName] });
    setCurrentCourse({
      ...mockCourse,
      id: courseId,
      name: courseName,
      term: (term as any) || mockCourse.term,
      objectives: learningObjective ? learningObjective.split("\n").filter(Boolean) : mockCourse.objectives,
      enrollmentCode,
    });

    navigate("/teacher/courses/dashboard");
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background px-4 py-12">
        <div className="mx-auto w-full max-w-2xl space-y-6">
          <Skeleton className="h-10 w-72" />
          <Skeleton className="h-6 w-96" />
          <Card><CardContent className="p-6 space-y-4">
            <Skeleton className="h-10 w-full" /><Skeleton className="h-10 w-full" /><Skeleton className="h-10 w-full" />
          </CardContent></Card>
          <Card><CardContent className="p-6 space-y-4">
            <Skeleton className="h-10 w-full" /><Skeleton className="h-10 w-full" />
          </CardContent></Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background px-4 py-12">
      <div className="mx-auto w-full max-w-2xl">
        <div className="mb-8 text-center">
          <h1 className="font-heading text-3xl font-bold">
            Welcome to Next<span className="text-primary">Step</span>
          </h1>
          <p className="mt-2 text-muted-foreground">Set up your profile and your course in one go.</p>
        </div>

        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
          {/* Sub-section 1: Your Profile */}
          <Card>
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <User className="h-5 w-5" />
                </div>
                <div>
                  <CardTitle>Your Profile</CardTitle>
                  <CardDescription>Tell us about yourself</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="space-y-2">
                <Label>Full Name</Label>
                <Input placeholder="Dr. Jane Smith" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
              </div>

              <div className="space-y-2">
                <Label>Institutional Email</Label>
                <Input value={user?.email || ""} disabled className="bg-muted/40 cursor-not-allowed" />
              </div>

              <div className="space-y-2">
                <Label>Institution Name</Label>
                <Input placeholder="e.g. Indian Institute of Technology, Delhi" value={institution} onChange={(e) => setInstitution(e.target.value)} />
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Department</Label>
                  <Select value={department} onValueChange={setDepartment}>
                    <SelectTrigger><SelectValue placeholder="Select department" /></SelectTrigger>
                    <SelectContent>
                      {availableDepartments.map((d) => (
                        <SelectItem key={d} value={d}>{d}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Designation</Label>
                  <Input placeholder="e.g. Associate Professor" value={designation} onChange={(e) => setDesignation(e.target.value)} />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Sub-section 2: Your Course */}
          <Card>
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <BookOpen className="h-5 w-5" />
                </div>
                <div>
                  <CardTitle>Your Course</CardTitle>
                  <CardDescription>The course you'll be teaching</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Course Name</Label>
                  <Input placeholder="e.g. Intro to Python" value={courseName} onChange={(e) => setCourseName(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Course Code</Label>
                  <Input placeholder="e.g. PY101" value={courseCode} onChange={(e) => setCourseCode(e.target.value)} />
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Semester</Label>
                  <Select value={term} onValueChange={setTerm}>
                    <SelectTrigger><SelectValue placeholder="Select semester" /></SelectTrigger>
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
                    <SelectTrigger><SelectValue placeholder="Select year" /></SelectTrigger>
                    <SelectContent>
                      {availableYears.map((y) => (
                        <SelectItem key={y} value={y}>{y}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <Label>Learning Objective of Course</Label>
                <textarea
                  className="flex min-h-[100px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  placeholder="What should students be able to do by the end of the course?"
                  value={learningObjective}
                  onChange={(e) => setLearningObjective(e.target.value)}
                />
              </div>
            </CardContent>
          </Card>

          <div className="flex justify-end pt-2">
            <Button onClick={handleContinue} disabled={!isValid} size="lg" className="gap-2">
              Go to Dashboard <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
        </motion.div>
      </div>
    </div>
  );
};

export default TeacherOnboarding;
