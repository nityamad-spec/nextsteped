import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { AppProvider, useApp } from "@/contexts/AppContext";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { useStudentStatus } from "@/hooks/useStudentStatus";
import { useTeacherSetupStatus } from "@/hooks/useTeacherSetupStatus";
import { useTeacherNavPermissions, isTeacherPathAllowed } from "@/hooks/useTeacherNavPermissions";

import { supabase } from "@/integrations/supabase/client";
import { useEffect, useState } from "react";
import Landing from "./pages/Landing";
import TeacherIntro from "./pages/TeacherIntro";
import TeacherApplicationForm from "./pages/TeacherApplicationForm";
import TeacherPendingApproval from "./pages/TeacherPendingApproval";
import StudentIntro from "./pages/StudentIntro";
import Auth from "./pages/Auth";
import NewCoursePage from "./pages/teacher/NewCoursePage";
import TeacherLayout from "./layouts/TeacherLayout";
import StudentLayout from "./layouts/StudentLayout";
import TeacherOnboarding from "./pages/teacher/TeacherOnboarding";
import CourseCreation from "./pages/teacher/CourseCreation";
import CourseSetup from "./pages/teacher/CourseSetup";
import ProjectLabSetup from "./pages/teacher/ProjectLabSetup";
import CourseMaterials from "./pages/teacher/CourseMaterials";
import ExamMode from "./pages/teacher/ExamMode";
import EnrollmentSettings from "./pages/teacher/EnrollmentSettings";
import ConceptManagement from "./pages/teacher/ConceptManagement";
import ConceptReview from "./pages/teacher/ConceptReview";
import DiagnosticQuestionsSetup from "./pages/teacher/DiagnosticQuestionsSetup";
import PublishEnrollment from "./pages/teacher/PublishEnrollment";
import CourseDashboard from "./pages/teacher/CourseDashboard";

import Assessments from "./pages/teacher/Assessments";

import TeachingPlan from "./pages/teacher/TeachingPlan";
import SettingsIntegrity from "./pages/teacher/SettingsIntegrity";
import Support from "./pages/teacher/Support";
import StudentOnboarding from "./pages/student/StudentOnboarding";
import VerifyEmail from "./pages/student/VerifyEmail";
import DiagnosticQuiz from "./pages/student/DiagnosticQuiz";
import StudentHome from "./pages/student/StudentHome";
import StudentLearningPath from "./pages/student/StudentLearningPath";
import AIChat from "./pages/student/AIChat";
import StudentProjectLab from "./pages/student/StudentProjectLab";
import StudentProgress from "./pages/student/Progress";
import Feedback from "./pages/student/Feedback";
import ComingSoon from "./components/ComingSoon";
import NotFound from "./pages/NotFound";
import Unsubscribe from "./pages/Unsubscribe";
import AdminLayout from "./layouts/AdminLayout";
import AdminDashboard from "./pages/admin/AdminDashboard";
import AdminCourses from "./pages/admin/AdminCourses";
import AdminStudents from "./pages/admin/AdminStudents";
import AdminTeachers from "./pages/admin/AdminTeachers";
import AdminSetupDebug from "./pages/admin/AdminSetupDebug";
import AdminSetupTrace from "./pages/admin/AdminSetupTrace";
import AdminDiagnosticRuns from "./pages/admin/AdminDiagnosticRuns";
import ResetPassword from "./pages/ResetPassword";
import ContentLibrary from "./pages/teacher/ContentLibrary";
import TeacherChat from "./pages/teacher/TeacherChat";
import CourseAnalytics from "./pages/teacher/CourseAnalytics";
import { AUTH_BYPASS } from "@/lib/authBypass";
import SessionBanner from "@/components/SessionBanner";
import RoleGuard, { seedRoleCache } from "@/components/RoleGuard";

const queryClient = new QueryClient();

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (AUTH_BYPASS) return <>{children}</>;
  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="text-muted-foreground">Loading...</div>
      </div>
    );
  }
  if (!user) return <Navigate to="/auth" replace />;
  return <>{children}</>;
}

function TeacherRedirect() {
  const { user, loading: authLoading } = useAuth();
  const [checking, setChecking] = useState(true);
  const [hasCourse, setHasCourse] = useState(false);
  const [isCollaboratorOnly, setIsCollaboratorOnly] = useState(false);
  const [needsPassword, setNeedsPassword] = useState(false);
  const { loading: setupLoading, isComplete } = useTeacherSetupStatus();
  const { loading: permLoading, canCreateCourses } = useTeacherNavPermissions();


  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      setHasCourse(false);
      setChecking(false);
      return;
    }
    Promise.all([
      supabase.from("courses").select("id").eq("teacher_id", user.id).order("created_at", { ascending: false }),
      supabase.from("course_teachers").select("course_id").eq("teacher_id", user.id),
      supabase.from("profiles").select("needs_password_setup, active_course_id").eq("id", user.id).maybeSingle(),
    ]).then(([ownedRes, collabRes, profileRes]) => {
      const owned = ownedRes.data ?? [];
      const collab = collabRes.data ?? [];
      const collabOnly = owned.length === 0 && collab.length > 0;
      setIsCollaboratorOnly(collabOnly);
      setHasCourse(owned.length > 0 || collab.length > 0);
      setNeedsPassword(!!profileRes.data?.needs_password_setup);

      // Pre-select the right course in localStorage so all teacher hooks
      // resolve to it immediately on first sign-in.
      const preferred =
        profileRes.data?.active_course_id ||
        owned[0]?.id ||
        collab[0]?.course_id ||
        null;
      if (preferred && typeof window !== "undefined") {
        localStorage.setItem("currentCourseId", preferred);
      }

      setChecking(false);
    });
  }, [user, authLoading]);

  // Safety net: never hang on Loading… for more than 4s.
  useEffect(() => {
    const t = window.setTimeout(() => setChecking(false), 4000);
    return () => window.clearTimeout(t);
  }, []);

  if (authLoading || checking || setupLoading || permLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="text-muted-foreground">Loading...</div>
      </div>
    );
  }

  // First-time invited professors must set a password before doing anything else.
  if (needsPassword) return <Navigate to="/reset-password" replace />;
  // Approved teachers no longer go through TeacherOnboarding — their profile
  // was filled in during the application flow and copied over by the
  // approve-teacher edge function. If they have no course yet, either send
  // them to the new course page (permitted) or to Support with a notice.
  if (!hasCourse) {
    return canCreateCourses
      ? <Navigate to="/teacher/courses/new?first=1" replace />
      : <Navigate to="/teacher/support?reason=course-create-restricted" replace />;
  }
  // Collaborators on an existing course always go straight to its dashboard —
  // they should never be gated by the owner's setup pipeline.
  if (isCollaboratorOnly) return <Navigate to="/teacher/courses/dashboard" replace />;
  // Setup-incomplete owners are forced into Course Setup on every login.
  if (!isComplete) return <Navigate to="/teacher/setup" replace />;
  return <Navigate to="/teacher/courses/dashboard" replace />;
}

function RequireCourseCreate({ children }: { children: React.ReactNode }) {
  const { ready, canCreateCourses } = useTeacherNavPermissions();
  if (!ready) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="text-muted-foreground">Loading...</div>
      </div>
    );
  }
  if (!canCreateCourses) {
    return <Navigate to="/teacher/support?reason=course-create-restricted" replace />;
  }
  return <>{children}</>;
}

/**
 * Per-route guard for teacher pages. Blocks direct URL access to routes the
 * admin has not granted, closing the URL-typing / race-window bypass that a
 * layout-level useEffect redirect cannot prevent (the child route renders and
 * fetches data before the redirect fires).
 *
 * `forceSetup` (owner with an unfinished course) keeps `/teacher/setup*`
 * reachable so a teacher cannot be stranded mid-onboarding.
 */
function RequireTeacherPath({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const { ready: permReady, allowed } = useTeacherNavPermissions();
  const { loading: setupLoading, isComplete: setupComplete, ownsAnyCourse } = useTeacherSetupStatus();

  if (!permReady || setupLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="text-muted-foreground">Loading...</div>
      </div>
    );
  }

  const path = location.pathname;
  const forceSetup = !setupComplete && ownsAnyCourse;
  const isSetupPath = path === "/teacher/setup" || path.startsWith("/teacher/setup/");
  const permitted =
    isTeacherPathAllowed(path, allowed) || (forceSetup && isSetupPath);

  if (!permitted) {
    return <Navigate to="/teacher/support?reason=nav-restricted" replace />;
  }
  return <>{children}</>;
}


function StudentRedirect() {
  const { user } = useAuth();
  const { loading, hasProfile, hasEnrollment, hasDiagnostic, activeCourseId, role } = useStudentStatus();
  const { setStudentOnboarded, setDiagnosticComplete } = useApp();
  const [healing, setHealing] = useState(false);
  const [healedCourseId, setHealedCourseId] = useState<string | null>(null);
  const [healFailed, setHealFailed] = useState(false);

  // Sync DB state to local context (in effect to avoid render-phase setState loops)
  useEffect(() => {
    if (hasProfile) setStudentOnboarded(true);
    if (hasDiagnostic) setDiagnosticComplete(true);
  }, [hasProfile, hasDiagnostic, setStudentOnboarded, setDiagnosticComplete]);

  // Self-heal: if the signed-in user has no profile but a pending_signups row exists,
  // they got stranded by the invite flow. Materialize their account now.
  useEffect(() => {
    if (loading || hasProfile || healing || healFailed || healedCourseId || !user) return;
    const email = user.email?.toLowerCase();
    if (!email) return;
    let cancelled = false;
    const heal = async () => {
      setHealing(true);
      try {
        const { data: pending } = await supabase
          .from("pending_signups")
          .select("id")
          .eq("email", email)
          .is("consumed_at", null)
          .maybeSingle();
        if (cancelled) return;
        if (!pending) {
          setHealFailed(true);
          return;
        }
        const { data, error } = await supabase.functions.invoke("complete-student-signup", { body: {} });
        if (cancelled) return;
        if (error) {
          setHealFailed(true);
          return;
        }
        const courseId = (data as any)?.course_id ?? null;
        setHealedCourseId(courseId);
      } catch {
        if (!cancelled) setHealFailed(true);
      } finally {
        if (!cancelled) setHealing(false);
      }
    };
    heal();
    return () => { cancelled = true; };
  }, [loading, hasProfile, user, healing, healFailed, healedCourseId]);

  if (loading || healing) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="text-muted-foreground">Loading...</div>
      </div>
    );
  }

  // If we just healed a stuck account, send them to their diagnostic.
  if (healedCourseId) {
    return <Navigate to={`/student/diagnostic?course=${healedCourseId}`} replace />;
  }

  // Role-mismatch is handled centrally by <RoleGuard /> wrapping /student routes.



  // Profile is the only onboarding gate; enrollment is optional and can happen later.
  if (!hasProfile) return <Navigate to="/student/onboarding" replace />;
  // Per-course isolation: if the student is enrolled in their active course but
  // hasn't done that course's diagnostic, send them through it first.
  if (hasEnrollment && !hasDiagnostic) {
    const target = activeCourseId
      ? `/student/diagnostic?course=${activeCourseId}`
      : "/student/diagnostic";
    return <Navigate to={target} replace />;
  }
  return <Navigate to="/student/home" replace />;
}

function AuthRedirect() {
  const { user, loading } = useAuth();
  const [checking, setChecking] = useState(true);
  const [profileRole, setProfileRole] = useState<string | null>(null);

  useEffect(() => {
    if (!user) {
      setChecking(false);
      return;
    }
    supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle()
      .then(({ data }) => {
        const r = (data?.role as any) || (user.user_metadata?.role as any) || null;
        setProfileRole(r);
        seedRoleCache(user.id, r);
        setChecking(false);
      });
  }, [user]);

  if (loading || checking) return null;
  if (user) {
    // Only redirect when we actually know the user's role. If neither the
    // profile row nor user_metadata gave us a role, render the Auth form so
    // the user can pick a role explicitly instead of silently defaulting to
    // /student (which sends teachers to /student/onboarding).
    if (profileRole === "admin") return <Navigate to="/admin/dashboard" replace />;
    if (profileRole === "teacher") return <Navigate to="/teacher" replace />;
    if (profileRole === "student") return <Navigate to="/student" replace />;
  }
  return <Auth />;
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <AuthProvider>
        <AppProvider>
          <BrowserRouter>
            <SessionBanner />
            <Routes>
              <Route path="/" element={<Landing />} />
              <Route path="/auth" element={<AuthRedirect />} />
              <Route path="/intro/teacher" element={<TeacherIntro />} />
              <Route path="/intro/teacher/profile" element={<TeacherApplicationForm />} />
              <Route path="/intro/teacher/pending" element={<TeacherPendingApproval />} />
              <Route path="/intro/student" element={<StudentIntro />} />
              <Route path="/reset-password" element={<ResetPassword />} />
              <Route path="/unsubscribe" element={<Unsubscribe />} />


              {/* Teacher onboarding (single-page, no layout) */}
              <Route path="/teacher" element={<ProtectedRoute><RoleGuard allow={["teacher"]}><TeacherRedirect /></RoleGuard></ProtectedRoute>} />
              <Route path="/teacher/onboarding" element={<ProtectedRoute><RoleGuard allow={["teacher"]}><TeacherOnboarding /></RoleGuard></ProtectedRoute>} />
              <Route path="/teacher/courses/new" element={<ProtectedRoute><RoleGuard allow={["teacher"]}><RequireCourseCreate><NewCoursePage /></RequireCourseCreate></RoleGuard></ProtectedRoute>} />
              {/* Teacher dashboard + setup modules (all share TeacherLayout) */}
              <Route element={<ProtectedRoute><RoleGuard allow={["teacher"]}><TeacherLayout /></RoleGuard></ProtectedRoute>}>
                <Route path="/teacher/courses/dashboard" element={<RequireTeacherPath><CourseDashboard /></RequireTeacherPath>} />
                <Route path="/teacher/setup" element={<RequireTeacherPath><CourseSetup /></RequireTeacherPath>} />
                <Route path="/teacher/setup/upload" element={<RequireTeacherPath><CourseMaterials /></RequireTeacherPath>} />
                <Route path="/teacher/setup/materials" element={<Navigate to="/teacher/setup/upload" replace />} />
                <Route path="/teacher/setup/concept-review" element={<RequireTeacherPath><ConceptReview /></RequireTeacherPath>} />
                <Route path="/teacher/setup/lesson-plan" element={<RequireTeacherPath><CourseCreation /></RequireTeacherPath>} />
                <Route path="/teacher/setup/diagnostic" element={<RequireTeacherPath><DiagnosticQuestionsSetup /></RequireTeacherPath>} />
                <Route path="/teacher/setup/exam-mode" element={<RequireTeacherPath><ExamMode /></RequireTeacherPath>} />
                <Route path="/teacher/setup/project-lab" element={<RequireTeacherPath><ProjectLabSetup /></RequireTeacherPath>} />
                <Route path="/teacher/setup/enrollment" element={<RequireTeacherPath><EnrollmentSettings /></RequireTeacherPath>} />
                <Route path="/teacher/assessments" element={<Navigate to="/teacher/setup/exam-mode" replace />} />
                <Route path="/teacher/teaching-plan" element={<RequireTeacherPath><TeachingPlan /></RequireTeacherPath>} />
                <Route path="/teacher/chat" element={<RequireTeacherPath><TeacherChat /></RequireTeacherPath>} />
                <Route path="/teacher/content-library" element={<RequireTeacherPath><ContentLibrary /></RequireTeacherPath>} />
                <Route path="/teacher/analytics" element={<RequireTeacherPath><CourseAnalytics /></RequireTeacherPath>} />
                <Route path="/teacher/support" element={<Support />} />
              </Route>

              {/* Student routes */}
              <Route path="/student" element={<ProtectedRoute><RoleGuard allow={["student"]}><StudentRedirect /></RoleGuard></ProtectedRoute>} />
              <Route path="/student/onboarding" element={<RoleGuard allow={["student"]} allowAnonymous><StudentOnboarding /></RoleGuard>} />
              <Route path="/student/verify-email" element={<RoleGuard allow={["student"]} allowAnonymous><VerifyEmail /></RoleGuard>} />
              <Route path="/student/diagnostic" element={<ProtectedRoute><RoleGuard allow={["student"]}><DiagnosticQuiz /></RoleGuard></ProtectedRoute>} />
              <Route element={<ProtectedRoute><RoleGuard allow={["student"]}><StudentLayout /></RoleGuard></ProtectedRoute>}>
                <Route path="/student/home" element={<StudentHome />} />
                <Route path="/student/learning-path" element={<StudentLearningPath />} />
                <Route path="/student/chat" element={<AIChat />} />
                <Route path="/student/project-lab" element={<StudentProjectLab />} />
                <Route path="/student/feedback" element={<Feedback />} />
                <Route path="/student/progress" element={<StudentProgress />} />
              </Route>

              {/* Admin routes */}
              <Route path="/admin" element={<ProtectedRoute><RoleGuard allow={["admin"]}><AdminLayout /></RoleGuard></ProtectedRoute>}>
                <Route index element={<AdminDashboard />} />
                <Route path="dashboard" element={<AdminDashboard />} />
                <Route path="courses" element={<AdminCourses />} />
                <Route path="students" element={<AdminStudents />} />
                <Route path="teachers" element={<AdminTeachers />} />
                <Route path="setup-debug" element={<AdminSetupDebug />} />
                <Route path="setup-trace" element={<AdminSetupTrace />} />
                <Route path="diagnostic-runs" element={<AdminDiagnosticRuns />} />
              </Route>


              <Route path="*" element={<NotFound />} />
            </Routes>
          </BrowserRouter>
        </AppProvider>
      </AuthProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
