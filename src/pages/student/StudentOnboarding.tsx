import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowRight, ArrowLeft, User, Check, Loader2, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { extractFunctionError } from "@/lib/extractFunctionError";

interface University { id: string; name: string }
interface Degree { id: string; name: string }
interface Branch { id: string; name: string; degree_id: string }

type CodeStatus = "idle" | "checking" | "valid" | "invalid";

const StudentOnboarding = () => {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();

  // If a returning student (with a completed profile) lands here, send them
  // through the redirect flow. Users who are authed but have no profile must
  // stay on this page — otherwise /student bounces them right back, causing
  // an infinite Navigate loop.
  useEffect(() => {
    if (authLoading || !user) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("profiles")
        .select("id, role")
        .eq("id", user.id)
        .maybeSingle();
      if (cancelled) return;
      if (data && data.role === "student") {
        navigate("/student", { replace: true });
      }
    })();
    return () => { cancelled = true; };
  }, [user, authLoading, navigate]);

  // Form state
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [rollNumber, setRollNumber] = useState("");
  const [year, setYear] = useState("");
  const [universityId, setUniversityId] = useState("");
  const [degreeId, setDegreeId] = useState("");
  const [branchId, setBranchId] = useState("");
  const [enrollmentCode, setEnrollmentCode] = useState("");

  // Lookup data
  const [universities, setUniversities] = useState<University[]>([]);
  const [degrees, setDegrees] = useState<Degree[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);

  // Live enrollment-code validation
  const [codeStatus, setCodeStatus] = useState<CodeStatus>("idle");
  const [codeError, setCodeError] = useState<string | null>(null);
  const [codeCourseName, setCodeCourseName] = useState<string | null>(null);

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

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

  useEffect(() => {
    if (!degreeId) { setBranches([]); setBranchId(""); return; }
    const fetchBranches = async () => {
      const { data } = await supabase
        .from("branches")
        .select("id, name, degree_id")
        .eq("degree_id", degreeId)
        .order("name");
      if (data) {
        setBranches(data);
        if (data.length === 1) setBranchId(data[0].id); else setBranchId("");
      } else { setBranches([]); setBranchId(""); }
    };
    fetchBranches();
  }, [degreeId]);

  // Debounced live validation of the enrollment code
  useEffect(() => {
    const code = enrollmentCode.trim();
    if (!code) {
      setCodeStatus("idle");
      setCodeError(null);
      setCodeCourseName(null);
      return;
    }
    setCodeStatus("checking");
    const t = setTimeout(async () => {
      try {
        const { data, error } = await supabase.functions.invoke("validate-enrollment-code", {
          body: { enrollment_code: code },
        });
        if (error) throw error;
        if (data?.valid) {
          setCodeStatus("valid");
          setCodeError(null);
          setCodeCourseName(data.course?.name || null);
        } else {
          setCodeStatus("invalid");
          setCodeError(data?.error || "Invalid enrollment code");
          setCodeCourseName(null);
        }
      } catch (err: any) {
        setCodeStatus("invalid");
        setCodeError(await extractFunctionError(err, "Couldn't validate code"));
        setCodeCourseName(null);
      }
    }, 400);
    return () => clearTimeout(t);
  }, [enrollmentCode]);

  const yearOptions = ["2027", "2028", "2029", "2030", "2031"];

  const isValid =
    name.trim() &&
    email.trim() &&
    rollNumber.trim() &&
    universityId &&
    degreeId &&
    branchId &&
    year &&
    codeStatus === "valid";

  const handleSubmit = async () => {
    if (!isValid) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const { data, error } = await supabase.functions.invoke("student-pending-signup", {
        body: {
          email: email.trim(),
          name: name.trim(),
          roll_number: rollNumber.trim(),
          university_id: universityId,
          degree_id: degreeId,
          branch_id: branchId,
          graduation_year: year,
          enrollment_code: enrollmentCode.trim(),
          origin: window.location.origin,
        },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      navigate(`/student/verify-email?email=${encodeURIComponent(email.trim())}`, { replace: true });
    } catch (err: any) {
      let msg = err?.message || "Couldn't submit your details. Please try again.";
      try {
        const resp = err?.context?.response ?? err?.context;
        if (resp && typeof resp.clone === "function") {
          const body = await resp.clone().json().catch(() => null);
          if (body?.error) msg = body.error;
        }
      } catch { /* ignore */ }
      setSubmitError(msg);
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

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
                <CardDescription>Tell us about you and your course</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-5">
              <div className="space-y-2">
                <Label>Full Name</Label>
                <Input placeholder="Enter your full name" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
              </div>

              <div className="space-y-2">
                <Label>Email</Label>
                <Input
                  type="email"
                  placeholder="you@university.edu"
                  value={email}
                  onChange={(e) => { setEmail(e.target.value); setSubmitError(null); }}
                />
                <p className="text-xs text-muted-foreground">
                  We'll send a verification link to this address.
                </p>
              </div>

              <div className="space-y-2">
                <Label>Roll Number</Label>
                <Input placeholder="Enter your roll number" value={rollNumber} onChange={(e) => setRollNumber(e.target.value)} />
              </div>

              <div className="space-y-2">
                <Label>University</Label>
                <Select value={universityId} onValueChange={setUniversityId}>
                  <SelectTrigger className="h-11"><SelectValue placeholder="Select university" /></SelectTrigger>
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
                  <SelectTrigger className="h-11"><SelectValue placeholder="Select degree" /></SelectTrigger>
                  <SelectContent>
                    {degrees.map((d) => (
                      <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Branch</Label>
                <Select value={branchId} onValueChange={setBranchId} disabled={!degreeId || branches.length === 0}>
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
                  <SelectTrigger className="h-11"><SelectValue placeholder="Select graduation year" /></SelectTrigger>
                  <SelectContent>
                    {yearOptions.map((y) => (
                      <SelectItem key={y} value={y}>{y}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Course Enrollment Code</Label>
                <div className="relative">
                  <Input
                    placeholder="Enter the code from your professor"
                    value={enrollmentCode}
                    onChange={(e) => { setEnrollmentCode(e.target.value); setSubmitError(null); }}
                    className={
                      codeStatus === "invalid"
                        ? "border-destructive focus-visible:ring-destructive"
                        : codeStatus === "valid"
                          ? "border-primary"
                          : ""
                    }
                  />
                  <div className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2">
                    {codeStatus === "checking" && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
                    {codeStatus === "valid" && <Check className="h-4 w-4 text-primary" />}
                    {codeStatus === "invalid" && <AlertCircle className="h-4 w-4 text-destructive" />}
                  </div>
                </div>
                {codeStatus === "valid" && codeCourseName && (
                  <p className="text-xs text-primary">✓ {codeCourseName}</p>
                )}
                {codeStatus === "invalid" && codeError && (
                  <p className="text-xs text-destructive">{codeError}</p>
                )}
              </div>

              {submitError && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>{submitError}</AlertDescription>
                </Alert>
              )}

              <div className="flex justify-between pt-2">
                <Button variant="ghost" onClick={() => navigate("/intro/student")}>
                  <ArrowLeft className="mr-2 h-4 w-4" /> Back
                </Button>
                <Button onClick={handleSubmit} disabled={!isValid || submitting}>
                  {submitting ? "Sending verification…" : "Send Verification Email"} <ArrowRight className="ml-2 h-4 w-4" />
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
