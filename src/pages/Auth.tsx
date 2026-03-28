import { useState } from "react";
import { motion } from "framer-motion";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Eye, EyeOff, LogIn, UserPlus, CheckCircle2, Loader2 } from "lucide-react";

interface ResolvedCourse { id: string; name: string; course_code: string | null }

const Auth = () => {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const { signIn, signUp } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const role = searchParams.get("role") || "student";

  // Enrollment code state (student signup only)
  const [enrollmentCode, setEnrollmentCode] = useState("");
  const [resolvedCourse, setResolvedCourse] = useState<ResolvedCourse | null>(null);
  const [verifyingCode, setVerifyingCode] = useState(false);
  const [codeError, setCodeError] = useState("");
  const [teacherSignupsEnabled, setTeacherSignupsEnabled] = useState(true);
  const [teacherSignupsLoading, setTeacherSignupsLoading] = useState(false);

  // Fetch teacher signup setting when on teacher signup
  useEffect(() => {
    if (!isLogin && role === "teacher") {
      setTeacherSignupsLoading(true);
      supabase
        .from("admin_settings" as any)
        .select("value")
        .eq("key", "teacher_signups_enabled")
        .maybeSingle()
        .then(({ data }) => {
          setTeacherSignupsEnabled((data as any)?.value !== "false");
          setTeacherSignupsLoading(false);
        });
    }
  }, [isLogin, role]);

  const verifyEnrollmentCode = async () => {
    const code = enrollmentCode.trim();
    if (!code) return;
    setVerifyingCode(true);
    setCodeError("");
    setResolvedCourse(null);
    try {
      const { data, error } = await supabase
        .from("courses")
        .select("id, name, course_code")
        .eq("enrollment_code", code)
        .eq("published", true)
        .select("id, name, course_code, enrollment_open")
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      if (data) {
        if (!(data as any).enrollment_open) {
          setCodeError("Enrollment is closed for this course. Please contact your instructor.");
        } else {
          setResolvedCourse(data);
        }
      } else {
        setCodeError("Invalid enrollment code. Please check with your instructor.");
      }
    } catch (err: any) {
      setCodeError(err.message || "Failed to verify code");
    } finally {
      setVerifyingCode(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    if (isLogin) {
      const { error } = await signIn(email, password);
      if (error) {
        toast.error(error);
        setLoading(false);
        return;
      }

      // Check the user's profile role
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setLoading(false);
        return;
      }

      const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .maybeSingle();

      const userRole = profile?.role || user.user_metadata?.role || role;

      if (profile && profile.role !== role && role !== "admin") {
        toast.error(`This account is registered as a ${profile.role}. Please sign in from the correct page.`);
        await supabase.auth.signOut();
        setLoading(false);
        return;
      }

      toast.success("Welcome back!");
      if (userRole === "admin") {
        navigate("/admin/dashboard");
      } else {
        navigate(userRole === "teacher" ? "/teacher" : "/student");
      }
    } else {
      if (!name.trim()) {
        toast.error("Please enter your name");
        setLoading(false);
        return;
      }

      if (role === "teacher") {
        // Teacher signup: submit application instead of creating account
        const { error: appError } = await supabase
          .from("teacher_applications" as any)
          .insert({ email, name } as any);

        if (appError) {
          toast.error(appError.message || "Failed to submit application");
        } else {
          toast.success("Your application has been submitted! An admin will review it shortly.");
        }
      } else {
        // Student signup: enrollment code must be verified
        if (!resolvedCourse) {
          toast.error("Please verify your enrollment code before signing up.");
          setLoading(false);
          return;
        }

        const { error } = await signUp(email, password, name, role, enrollmentCode.trim());
        if (error) {
          toast.error(error);
        } else {
          toast.success("Check your email to verify your account");
        }
      }
    }
    setLoading(false);
  };

  const showEnrollmentField = !isLogin && role === "student";

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="w-full max-w-md"
      >
        <div className="mb-8 text-center">
          <h1 className="font-heading text-4xl font-bold tracking-tight text-foreground">
            Next<span className="text-primary">Step</span>
          </h1>
          <p className="mt-2 text-muted-foreground">
            {isLogin ? "Sign in to continue" : "Create your account"}
            {" "}as {role === "teacher" ? "Professor" : role === "admin" ? "Admin" : "Student"}
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              {isLogin ? <LogIn className="h-5 w-5" /> : <UserPlus className="h-5 w-5" />}
              {isLogin ? "Sign In" : "Sign Up"}
            </CardTitle>
            <CardDescription>
              {isLogin
                ? "Enter your credentials to access your account"
                : "Fill in your details to get started"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              {!isLogin && (
                <div className="space-y-2">
                  <Label htmlFor="name">Full Name</Label>
                  <Input
                    id="name"
                    placeholder="Your name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required={!isLogin}
                  />
                </div>
              )}
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    minLength={6}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              {showEnrollmentField && (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="enrollmentCode">Enrollment Code</Label>
                    <div className="flex gap-2">
                      <Input
                        id="enrollmentCode"
                        placeholder="Enter code from your instructor"
                        value={enrollmentCode}
                        onChange={(e) => {
                          setEnrollmentCode(e.target.value);
                          setResolvedCourse(null);
                          setCodeError("");
                        }}
                      />
                      <Button
                        type="button"
                        variant="outline"
                        onClick={verifyEnrollmentCode}
                        disabled={!enrollmentCode.trim() || verifyingCode}
                      >
                        {verifyingCode ? <Loader2 className="h-4 w-4 animate-spin" /> : "Verify"}
                      </Button>
                    </div>
                    {codeError && (
                      <p className="text-sm text-destructive">{codeError}</p>
                    )}
                  </div>

                  {resolvedCourse && (
                    <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }}>
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
                    </motion.div>
                  )}
                </>
              )}

              <Button
                type="submit"
                className="w-full"
                disabled={loading || (showEnrollmentField && !resolvedCourse)}
              >
                {loading ? "Please wait..." : isLogin ? "Sign In" : "Sign Up"}
              </Button>
            </form>

            <div className="mt-4 text-center text-sm text-muted-foreground">
              {isLogin ? "Don't have an account?" : "Already have an account?"}{" "}
              <button
                onClick={() => setIsLogin(!isLogin)}
                className="font-medium text-primary hover:underline"
              >
                {isLogin ? "Sign Up" : "Sign In"}
              </button>
            </div>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
};

export default Auth;
