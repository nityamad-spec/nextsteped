import { useState, useEffect } from "react";
import { Skeleton } from "@/components/ui/skeleton";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ArrowRight, ArrowLeft, User, Plus, X, ChevronsUpDown } from "lucide-react";
import SetupProgressBar from "@/components/SetupProgressBar";
import { toast } from "sonner";

const TeacherOnboarding = () => {
  const { setTeacherProfile, setCurrentCourse } = useApp();
  const { user } = useAuth();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [department, setDepartment] = useState("");
  const [courseCode, setCourseCode] = useState("");
  const [courseName, setCourseName] = useState("");
  const [sections, setSections] = useState<string[]>([]);
  const [sectionInput, setSectionInput] = useState("");
  const [term, setTerm] = useState("");
  const [selectedBranches, setSelectedBranches] = useState<string[]>([]);
  const [selectedYears, setSelectedYears] = useState<string[]>([]);
  const [objectives, setObjectives] = useState("");
  const [allBranches, setAllBranches] = useState<{ id: string; name: string }[]>([]);

  const availableYears = ["2027", "2028", "2029", "2030", "2031"];

  useEffect(() => {
    if (!user) return;
    const fetchExistingData = async () => {
      setLoading(true);
      const storedCourseId = localStorage.getItem("currentCourseId");
      
      const courseFields = "id, branch, term, sections, objectives, course_code, name, graduation_year";

      const profileRes = await supabase.from("profiles").select("name, department").eq("id", user.id).maybeSingle();

      let courseRes: { data: any } = { data: null };

      if (storedCourseId) {
        courseRes = await supabase.from("courses").select(courseFields).eq("id", storedCourseId).maybeSingle();
      } else {
        // Try owned course first
        const owned = await supabase.from("courses")
          .select(courseFields)
          .eq("teacher_id", user.id)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (owned.data) {
          courseRes = owned;
        } else {
          // Fallback: find course via course_teachers (collaborator)
          const membership = await supabase.from("course_teachers")
            .select("course_id")
            .eq("teacher_id", user.id)
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle();

          if (membership.data?.course_id) {
            courseRes = await supabase.from("courses")
              .select(courseFields)
              .eq("id", membership.data.course_id)
              .maybeSingle();
          }
        }
      }

      if (profileRes.data) {
        if (profileRes.data.name) setName(profileRes.data.name);
        if (profileRes.data.department) setDepartment(profileRes.data.department);
      }

      if (courseRes.data) {
        localStorage.setItem("currentCourseId", courseRes.data.id);
        if (courseRes.data.branch) setBranch(courseRes.data.branch);
        if (courseRes.data.term) setTerm(courseRes.data.term);
        if (courseRes.data.sections) setSections(courseRes.data.sections as string[]);
        if (courseRes.data.objectives) setObjectives((courseRes.data.objectives as string[]).join("\n"));
        if (courseRes.data.course_code) setCourseCode(courseRes.data.course_code);
        if (courseRes.data.name) setCourseName(courseRes.data.name);
        if (courseRes.data.graduation_year) setStudentYear(courseRes.data.graduation_year);
      }

      setLoading(false);
    };
    fetchExistingData();
  }, [user]);

  const isValid =
    name.trim() &&
    department &&
    courseCode.trim() &&
    courseName.trim() &&
    sections.length > 0 &&
    term &&
    branch.trim() &&
    studentYear &&
    objectives.trim();

  const addSection = () => {
    const trimmed = sectionInput.trim();
    if (trimmed && !sections.includes(trimmed)) {
      setSections((prev) => [...prev, trimmed]);
      setSectionInput("");
    }
  };

  const removeSection = (s: string) => {
    setSections((prev) => prev.filter((sec) => sec !== s));
  };

  const handleContinue = async () => {
    if (!user) return;

    // Upsert profile
    const { data: existingProfile } = await supabase
      .from("profiles")
      .select("id")
      .eq("id", user.id)
      .maybeSingle();

    if (existingProfile) {
      const { error: profileError } = await supabase.from("profiles")
        .update({ name, department, email: user.email || "" })
        .eq("id", user.id);
      if (profileError) {
        toast.error("Failed to update profile: " + profileError.message);
        return;
      }
    } else {
      const { error: profileError } = await supabase.from("profiles").insert({
        id: user.id,
        name,
        role: "teacher",
        department,
        email: user.email || "",
      });
      if (profileError) {
        toast.error("Failed to save profile: " + profileError.message);
        return;
      }
    }

    // Upsert course
    const coursePayload = {
      name: courseName.trim(),
      course_code: courseCode.trim(),
      branch,
      term,
      sections,
      objectives: objectives.split("\n").filter(Boolean),
      graduation_year: studentYear,
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
      if (error || !updated) {
        toast.error("Failed to update course: " + (error?.message ?? "Unknown error"));
        return;
      }
      courseId = updated.id;
      enrollmentCode = updated.enrollment_code;
    } else {
      const { data: courseData, error } = await supabase.from("courses")
        .insert({ ...coursePayload, teacher_id: user.id })
        .select("id, enrollment_code")
        .single();
      if (error || !courseData) {
        toast.error("Failed to save course: " + (error?.message ?? "Unknown error"));
        return;
      }
      courseId = courseData.id;
      enrollmentCode = courseData.enrollment_code;
    }

    // Store courseId for downstream pages
    localStorage.setItem("currentCourseId", courseId);

    setTeacherProfile({ name, department, courses: [courseName] });
    setCurrentCourse({
      ...mockCourse,
      id: courseId,
      name: courseName,
      branch,
      term: (term as any) || mockCourse.term,
      sections: sections.length > 0 ? sections : mockCourse.sections,
      objectives: objectives ? objectives.split("\n").filter(Boolean) : mockCourse.objectives,
      enrollmentCode,
    });
    navigate("/teacher/setup/quality-check", { state: { courseId } });
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4 py-8">
        <div className="w-full max-w-xl">
          <SetupProgressBar currentStep={1} />
          <div className="mb-8 text-center">
            <h1 className="font-heading text-3xl font-bold">
              Welcome to Next<span className="text-primary">Step</span>
            </h1>
            <p className="mt-2 text-muted-foreground">Set up your profile and course details</p>
          </div>
          <Card>
            <CardHeader>
              <div className="flex items-center gap-3">
                <Skeleton className="h-10 w-10 rounded-lg" />
                <div className="space-y-1.5">
                  <Skeleton className="h-5 w-48" />
                  <Skeleton className="h-4 w-36" />
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="space-y-2"><Skeleton className="h-4 w-24" /><Skeleton className="h-10 w-full" /></div>
              <div className="space-y-2"><Skeleton className="h-4 w-24" /><Skeleton className="h-10 w-full" /></div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2"><Skeleton className="h-4 w-24" /><Skeleton className="h-10 w-full" /></div>
                <div className="space-y-2"><Skeleton className="h-4 w-24" /><Skeleton className="h-10 w-full" /></div>
              </div>
              <div className="space-y-2"><Skeleton className="h-4 w-24" /><Skeleton className="h-10 w-full" /></div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2"><Skeleton className="h-4 w-24" /><Skeleton className="h-10 w-full" /></div>
                <div className="space-y-2"><Skeleton className="h-4 w-24" /><Skeleton className="h-10 w-full" /></div>
              </div>
              <div className="space-y-2"><Skeleton className="h-4 w-24" /><Skeleton className="h-10 w-full" /></div>
              <div className="space-y-2"><Skeleton className="h-4 w-32" /><Skeleton className="h-[80px] w-full" /></div>
              <div className="flex justify-between pt-2">
                <Skeleton className="h-10 w-24" />
                <Skeleton className="h-10 w-56" />
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-8">
      <div className="w-full max-w-xl">
        <SetupProgressBar currentStep={1} />
        <div className="mb-8 text-center">
          <h1 className="font-heading text-3xl font-bold">
            Welcome to Next<span className="text-primary">Step</span>
          </h1>
          <p className="mt-2 text-muted-foreground">Set up your profile and course details</p>
        </div>

        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <User className="h-5 w-5" />
              </div>
              <div>
                <CardTitle>Professor Profile & Course Setup</CardTitle>
                <CardDescription>Your information and course details</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-5">
              <div className="space-y-2">
                <Label>Full Name</Label>
                <Input placeholder="Dr. Jane Smith" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
              </div>

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

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Course Code</Label>
                  <Input placeholder="e.g. PY101" value={courseCode} onChange={(e) => setCourseCode(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Course Name</Label>
                  <Input placeholder="e.g. Intro to Python" value={courseName} onChange={(e) => setCourseName(e.target.value)} />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Section(s)</Label>
                <div className="flex gap-2">
                  <Input
                    placeholder="e.g. Section A"
                    value={sectionInput}
                    onChange={(e) => setSectionInput(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addSection(); } }}
                  />
                  <Button type="button" variant="outline" size="icon" onClick={addSection} disabled={!sectionInput.trim()}>
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
                {sections.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {sections.map((s) => (
                      <Badge key={s} variant="secondary" className="gap-1">
                        {s}
                        <button onClick={() => removeSection(s)} className="ml-0.5 hover:text-destructive">
                          <X className="h-3 w-3" />
                        </button>
                      </Badge>
                    ))}
                  </div>
                )}
                <p className="text-[11px] text-muted-foreground">For each section you teach, add them separately.</p>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Term</Label>
                  <Select value={term} onValueChange={setTerm}>
                    <SelectTrigger><SelectValue placeholder="Select term" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="First Semester">First Semester</SelectItem>
                      <SelectItem value="Second Semester">Second Semester</SelectItem>
                      <SelectItem value="Summer Semester">Summer Semester</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Branch</Label>
                  <Input placeholder="e.g. Computer Science & Engineering" value={branch} onChange={(e) => setBranch(e.target.value)} />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Graduation Year</Label>
                <Select value={studentYear} onValueChange={setStudentYear}>
                  <SelectTrigger><SelectValue placeholder="Select graduation year" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="2027">2027</SelectItem>
                    <SelectItem value="2028">2028</SelectItem>
                    <SelectItem value="2029">2029</SelectItem>
                    <SelectItem value="2030">2030</SelectItem>
                    <SelectItem value="2031">2031</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Learning Objectives</Label>
                <textarea
                  className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  placeholder="One objective per line..."
                  value={objectives}
                  onChange={(e) => setObjectives(e.target.value)}
                />
              </div>

              <div className="flex justify-between pt-2">
                <Button variant="ghost" onClick={() => navigate("/")}>
                  <ArrowLeft className="mr-2 h-4 w-4" /> Back
                </Button>
                <Button onClick={handleContinue} disabled={!isValid}>
                  Continue to Syllabus Review <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </div>
            </motion.div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default TeacherOnboarding;
