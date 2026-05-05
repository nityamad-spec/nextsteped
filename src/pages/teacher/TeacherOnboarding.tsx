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
import { UniversityCombobox } from "@/components/UniversityCombobox";
import { ArrowRight, User, BookOpen, Loader2 } from "lucide-react";
import { toast } from "sonner";

const TeacherOnboarding = () => {
  const { setTeacherProfile, setCurrentCourse } = useApp();
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [isBypassAdmin, setIsBypassAdmin] = useState(false);

  // Profile
  const [name, setName] = useState("");
  const [institution, setInstitution] = useState("");
  const [universityId, setUniversityId] = useState<string | null>(null);
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
    // Wait for auth to fully resolve. We only stop showing the skeleton once
    // we know definitively whether we have a user — otherwise the page would
    // briefly render an empty form during the bypass sign-in round-trip and
    // the "Go to Course Setup" button would look broken (it's just disabled).
    if (authLoading) return;
    if (!user) {
      setLoading(false);
      return;
    }
    let cancelled = false;

    const fetchExistingData = async () => {
      setLoading(true);
      try {
        // Warm up the Supabase client so the access token is attached before
        // RLS-protected reads run. Eliminates the post-signup / cold-start race
        // where the very first SELECT goes out without an Authorization header
        // and silently returns 0 rows.
        const { data: sessionData } = await supabase.auth.getSession();
        if (!sessionData.session?.access_token) {
          if (!cancelled) setLoading(false);
          return;
        }

        const courseFields = "id, term, objectives, course_code, name, graduation_year";
        const storedCourseId = localStorage.getItem("currentCourseId");

        // Profile + (stored or latest) course in parallel.
        const latestOwnedQuery = supabase
          .from("courses")
          .select(courseFields)
          .eq("teacher_id", user.id)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        const storedCourseQuery = storedCourseId
          ? supabase.from("courses").select(courseFields).eq("id", storedCourseId).maybeSingle()
          : Promise.resolve({ data: null } as { data: any });

        const [profileRes, storedRes] = await Promise.all([
          supabase
            .from("profiles")
            .select("name, department, institution, university_id, designation, role")
            .eq("id", user.id)
            .maybeSingle(),
          storedCourseQuery,
        ]);

        // Fall back to "latest owned course" when the stored id is stale
        // (course deleted, account swap, wipe-courses, etc.).
        let courseData: any = storedRes.data;
        if (!courseData) {
          if (storedCourseId) localStorage.removeItem("currentCourseId");
          const owned = await latestOwnedQuery;
          courseData = owned.data;
        }

        if (cancelled) return;

        // Detect the AUTH_BYPASS admin: don't leak the seeded admin's identity
        // (name, department, institution, designation) into the teacher form.
        // The admin profile exists for RLS purposes only — onboarding should
        // behave like a fresh teacher signup.
        const profileRole = (profileRes.data as any)?.role;
        const isAdmin = profileRole === "admin";
        setIsBypassAdmin(isAdmin);

        if (profileRes.data && !isAdmin) {
          if (profileRes.data.name) setName(profileRes.data.name);
          if (profileRes.data.department) setDepartment(profileRes.data.department);
          if ((profileRes.data as any).institution) setInstitution((profileRes.data as any).institution);
          if ((profileRes.data as any).designation) setDesignation((profileRes.data as any).designation);
        }

        if (courseData) {
          localStorage.setItem("currentCourseId", courseData.id);
          if (courseData.term) setTerm(courseData.term);
          if (courseData.course_code) setCourseCode(courseData.course_code);
          if (courseData.name) setCourseName(courseData.name);
          if (Array.isArray(courseData.graduation_year) && courseData.graduation_year.length > 0) {
            setGraduationYear(courseData.graduation_year[0]);
          }
          if (Array.isArray(courseData.objectives)) {
            setLearningObjective(courseData.objectives.join("\n"));
          }
        }
      } catch (err) {
        console.error("Onboarding auto-populate failed:", err);
        if (!cancelled) {
          toast.error("Couldn't load your saved info. You can re-enter it below.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    fetchExistingData();

    return () => { cancelled = true; };
  }, [user, authLoading]);

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
    if (saving || !user) return;
    setSaving(true);
    try {
      // Ensure the Supabase client has the access token attached before the first RLS-protected write.
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData.session?.access_token) {
        toast.error("Your session isn't ready yet. Please wait a moment and try again.");
        return;
      }

      // Upsert profile
      const profilePayload = {
        name,
        department,
        institution,
        designation,
        email: user.email || "",
      };

      // Run independent reads in parallel
      const [profileLookup, courseLookup] = await Promise.all([
        supabase.from("profiles").select("id").eq("id", user.id).maybeSingle(),
        supabase
          .from("courses")
          .select("id")
          .eq("teacher_id", user.id)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);

      const existingProfile = profileLookup.data;
      const existingCourse = courseLookup.data;

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

      // Defer context updates until after both DB writes succeeded.
      setTeacherProfile({ name, department, courses: [courseName] });
      setCurrentCourse({
        ...mockCourse,
        id: courseId,
        name: courseName,
        term: (term as any) || mockCourse.term,
        objectives: learningObjective ? learningObjective.split("\n").filter(Boolean) : mockCourse.objectives,
        enrollmentCode,
      });

      navigate("/teacher/setup");
    } catch (err: any) {
      toast.error("Something went wrong. Please try again." + (err?.message ? ` (${err.message})` : ""));
    } finally {
      setSaving(false);
    }
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
                <Input
                  value={isBypassAdmin ? "" : (user?.email || "")}
                  placeholder={isBypassAdmin ? "your.name@institution.edu" : undefined}
                  disabled
                  className="bg-muted/40 cursor-not-allowed"
                />
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

          <div className="flex flex-col items-end gap-2 pt-2">
            <Button onClick={handleContinue} disabled={!isValid || saving} size="lg" className="gap-2">
              {saving ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" /> Saving…
                </>
              ) : (
                <>
                  Go to Course Setup <ArrowRight className="h-4 w-4" />
                </>
              )}
            </Button>
            {!isValid && !saving && (
              <p className="text-xs text-muted-foreground">Fill in all fields to continue.</p>
            )}
          </div>
        </motion.div>
      </div>
    </div>
  );
};

export default TeacherOnboarding;
