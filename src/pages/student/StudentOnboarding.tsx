import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { useApp } from "@/contexts/AppContext";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowRight, ArrowLeft, User, CheckCircle2, Loader2 } from "lucide-react";
import { toast } from "sonner";

interface University { id: string; name: string }
interface Degree { id: string; name: string }
interface Branch { id: string; name: string; degree_id: string }
interface ResolvedCourse { id: string; name: string; course_code: string | null; sections: string[] | null; branch: string[] | null; graduation_year: string[] | null }

const StudentOnboarding = () => {
  const { setStudentProfile, setStudentOnboarded, setCurrentCourse } = useApp();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [checkingStatus, setCheckingStatus] = useState(true);

  const [name, setName] = useState("");
  const [rollNumber, setRollNumber] = useState("");
  const [year, setYear] = useState("");
  const [universityId, setUniversityId] = useState("");
  const [degreeId, setDegreeId] = useState("");
  const [branchId, setBranchId] = useState("");

  const [resolvedCourse, setResolvedCourse] = useState<ResolvedCourse | null>(null);
  const [resolvingCourse, setResolvingCourse] = useState(false);
  const [enrollmentCode, setEnrollmentCode] = useState("");
  const [section, setSection] = useState("");

  const [universities, setUniversities] = useState<University[]>([]);
  const [degrees, setDegrees] = useState<Degree[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [saving, setSaving] = useState(false);

  // Redirect if already onboarded
  useEffect(() => {
    if (!user) return;
    const check = async () => {
      const { data } = await supabase.from("profiles").select("id, role").eq("id", user.id).maybeSingle();
      if (data && data.role === "student") {
        setStudentOnboarded(true);
        navigate("/student/diagnostic", { replace: true });
      } else {
        setCheckingStatus(false);
      }
    };
    check();
  }, [user]);

  // Auto-resolve enrollment code from user metadata
  useEffect(() => {
    if (!user) return;
    const code = user.user_metadata?.enrollment_code;
    if (!code) return;
    setEnrollmentCode(code);
    setResolvingCourse(true);
    const resolve = async () => {
      try {
        const { data, error } = await supabase
          .from("courses")
          .select("id, name, course_code, sections, branch, graduation_year")
          .eq("enrollment_code", code)
          .eq("published", true)
          .limit(1)
          .maybeSingle();
        if (error) throw error;
        if (data) setResolvedCourse(data);
      } catch (err: any) {
        toast.error("Could not resolve your enrollment code. Contact your instructor.");
      } finally {
        setResolvingCourse(false);
      }
    };
    resolve();
  }, [user]);

  useEffect(() => {
    const fetchData = async () => {
      const [uniRes, degRes] = await Promise.all([
        supabase.from("universities").select("id, name").order("name"),
        supabase.from("degrees").select("id, name").order("name"),
      ]);
      if (uniRes.data) setUniversities(uniRes.data);
      if (degRes.data) setDegrees(degRes.data);
    };
    fetchData();
  }, []);

  // Filter branches by course-specified branches and degree
  useEffect(() => {
    if (!degreeId) { setBranches([]); setBranchId(""); return; }
    const fetchBranches = async () => {
      const { data } = await supabase
        .from("branches")
        .select("id, name, degree_id")
        .eq("degree_id", degreeId)
        .order("name");
      if (data) {
        // Filter to only course-specified branches if available
        const courseBranches = resolvedCourse?.branch;
        const filtered = courseBranches && courseBranches.length > 0
          ? data.filter((b) => courseBranches.includes(b.name))
          : data;
        setBranches(filtered);
        // Auto-select if only one option
        if (filtered.length === 1) {
          setBranchId(filtered[0].id);
        } else {
          setBranchId("");
        }
      } else {
        setBranches([]);
        setBranchId("");
      }
    };
    fetchBranches();
  }, [degreeId, resolvedCourse]);

  // Compute filtered graduation years from course
  const courseYears = resolvedCourse?.graduation_year;
  const filteredYears = courseYears && courseYears.length > 0
    ? courseYears
    : ["2027", "2028", "2029", "2030", "2031"];

  // Auto-select year if only one option
  useEffect(() => {
    if (filteredYears.length === 1 && year !== filteredYears[0]) {
      setYear(filteredYears[0]);
    }
  }, [filteredYears.length]);

  const hasSections = resolvedCourse?.sections && resolvedCourse.sections.length > 0;
  const isValid = name.trim() && rollNumber.trim() && universityId && degreeId && branchId && year && resolvedCourse && (!hasSections || section);

  const handleComplete = async () => {
    if (!user || !resolvedCourse) return;
    setSaving(true);
    try {
      const { error } = await supabase.from("profiles").upsert({
        id: user.id,
        name,
        role: "student",
        graduation_year: year,
        university_id: universityId,
        degree_id: degreeId,
        branch_id: branchId,
        learner_level: "Beginner",
        roll_number: rollNumber,
        email: user.email || "",
      });
      if (error) throw error;

      await supabase.from("enrollments").upsert(
        { student_id: user.id, course_id: resolvedCourse.id, ...(section ? { section } : {}) },
        { onConflict: "student_id,course_id" as any }
      );

      setStudentProfile({
        name,
        courseCode: resolvedCourse.course_code || "",
        learnerLevel: "Beginner",
        topicBaseline: {},
      });
      setCurrentCourse({
        id: resolvedCourse.id,
        name: resolvedCourse.name,
        term: "First Semester",
        sections: [],
        objectives: [],
        enrollmentCode: enrollmentCode,
        syllabusUploaded: false,
        materialsUploaded: false,
        published: true,
      });
      setStudentOnboarded(true);
      navigate("/student/diagnostic");
    } catch (err: any) {
      toast.error(err.message || "Failed to save profile");
    } finally {
      setSaving(false);
    }
  };

  if (checkingStatus) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="text-muted-foreground">Loading...</div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-8">
      <div className="w-full max-w-xl">
        <div className="mb-8 text-center">
          <h1 className="font-heading text-3xl font-bold">
            Welcome to Next<span className="text-primary">Step</span>
          </h1>
          <p className="mt-2 text-muted-foreground">Set up your student profile to get started</p>
        </div>

        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <User className="h-5 w-5" />
              </div>
              <div>
                <CardTitle>Student Profile Setup</CardTitle>
                <CardDescription>Your academic information</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-5">
              {/* Course confirmation card */}
              {resolvingCourse ? (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" /> Resolving your course...
                </div>
              ) : resolvedCourse ? (
                <Card className="border-primary/20 bg-primary/5">
                  <CardContent className="p-4">
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                        <CheckCircle2 className="h-5 w-5" />
                      </div>
                      <div>
                        <p className="text-sm font-medium">{resolvedCourse.name}</p>
                        <p className="text-xs text-muted-foreground">
                          Course Code: {resolvedCourse.course_code || "N/A"}
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ) : (
                <p className="text-sm text-destructive">
                  No enrollment code found. Please sign up again with a valid code.
                </p>
              )}

              {hasSections && (
                <div className="space-y-2">
                  <Label>Section</Label>
                  <Select value={section} onValueChange={setSection}>
                    <SelectTrigger className="h-11">
                      <SelectValue placeholder="Select your section" />
                    </SelectTrigger>
                    <SelectContent>
                      {resolvedCourse!.sections!.map((s) => (
                        <SelectItem key={s} value={s}>{s}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              <div className="space-y-2">
                <Label>Full Name</Label>
                <Input placeholder="Enter your full name" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
              </div>

              <div className="space-y-2">
                <Label>Roll Number</Label>
                <Input placeholder="Enter your roll number" value={rollNumber} onChange={(e) => setRollNumber(e.target.value)} />
              </div>

              <div className="space-y-2">
                <Label>University</Label>
                <Select value={universityId} onValueChange={setUniversityId}>
                  <SelectTrigger className="h-11">
                    <SelectValue placeholder="Select university" />
                  </SelectTrigger>
                  <SelectContent>
                    {universities.map((u) => (
                      <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Degree</Label>
                <Select value={degreeId} onValueChange={setDegreeId}>
                  <SelectTrigger className="h-11">
                    <SelectValue placeholder="Select degree" />
                  </SelectTrigger>
                  <SelectContent>
                    {degrees.map((d) => (
                      <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Branch</Label>
                <Select value={branchId} onValueChange={setBranchId} disabled={!degreeId}>
                  <SelectTrigger className="h-11">
                    <SelectValue placeholder={degreeId ? "Select branch" : "Select a degree first"} />
                  </SelectTrigger>
                  <SelectContent>
                    {branches.map((b) => (
                      <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Graduation Year</Label>
                <Select value={year} onValueChange={setYear}>
                  <SelectTrigger className="h-11">
                    <SelectValue placeholder="Select graduation year" />
                  </SelectTrigger>
                  <SelectContent>
                    {filteredYears.map((y) => (
                      <SelectItem key={y} value={y}>{y}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex justify-between pt-2">
                <Button variant="ghost" onClick={() => navigate("/")}>
                  <ArrowLeft className="mr-2 h-4 w-4" /> Back
                </Button>
                <Button onClick={handleComplete} disabled={!isValid || saving}>
                  {saving ? "Saving..." : "Continue to Diagnostic"} <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </div>
            </motion.div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default StudentOnboarding;
