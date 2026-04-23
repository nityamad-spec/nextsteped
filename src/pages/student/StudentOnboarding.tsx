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
import { ArrowRight, ArrowLeft, User } from "lucide-react";
import { toast } from "sonner";

interface University { id: string; name: string }
interface Degree { id: string; name: string }
interface Branch { id: string; name: string; degree_id: string }

const StudentOnboarding = () => {
  const { setStudentProfile, setStudentOnboarded } = useApp();
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [checkingStatus, setCheckingStatus] = useState(true);

  const [name, setName] = useState("");
  const [rollNumber, setRollNumber] = useState("");
  const [year, setYear] = useState("");
  const [universityId, setUniversityId] = useState("");
  const [degreeId, setDegreeId] = useState("");
  const [branchId, setBranchId] = useState("");

  const [universities, setUniversities] = useState<University[]>([]);
  const [degrees, setDegrees] = useState<Degree[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [saving, setSaving] = useState(false);

  // Redirect if already onboarded — wait for auth to settle
  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      setCheckingStatus(false);
      return;
    }
    const check = async () => {
      try {
        const { data } = await supabase.from("profiles").select("id, role").eq("id", user.id).maybeSingle();
        if (data && data.role === "student") {
          setStudentOnboarded(true);
          navigate("/student/diagnostic", { replace: true });
          return;
        }
      } catch (err) {
        console.warn("[StudentOnboarding] profile check failed:", err);
      }
      setCheckingStatus(false);
    };
    check();
  }, [user, authLoading]);

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

  // Load branches for the selected degree
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
        if (data.length === 1) setBranchId(data[0].id);
        else setBranchId("");
      } else {
        setBranches([]);
        setBranchId("");
      }
    };
    fetchBranches();
  }, [degreeId]);

  const yearOptions = ["2027", "2028", "2029", "2030", "2031"];

  const isValid = name.trim() && rollNumber.trim() && universityId && degreeId && branchId && year;

  const handleComplete = async () => {
    if (!user) return;
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

      setStudentProfile({
        name,
        courseCode: "",
        learnerLevel: "Beginner",
        topicBaseline: {},
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
                    {yearOptions.map((y) => (
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
                  {saving ? "Saving..." : "Continue"} <ArrowRight className="ml-2 h-4 w-4" />
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
