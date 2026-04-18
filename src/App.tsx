import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AppProvider, useApp } from "@/contexts/AppContext";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { useStudentStatus } from "@/hooks/useStudentStatus";
import { supabase } from "@/integrations/supabase/client";
import { useEffect, useState } from "react";
import Landing from "./pages/Landing";
import Auth from "./pages/Auth";
import TeacherLayout from "./layouts/TeacherLayout";
import StudentLayout from "./layouts/StudentLayout";
import TeacherOnboarding from "./pages/teacher/TeacherOnboarding";
import MaterialQualityCheck from "./pages/teacher/MaterialQualityCheck";
import CourseCreation from "./pages/teacher/CourseCreation";
import CourseMaterials from "./pages/teacher/CourseMaterials";
import AITASettings from "./pages/teacher/AITASettings";
import ExamMode from "./pages/teacher/ExamMode";
import ConceptManagement from "./pages/teacher/ConceptManagement";
import DiagnosticQuestionsSetup from "./pages/teacher/DiagnosticQuestionsSetup";
import PublishEnrollment from "./pages/teacher/PublishEnrollment";
import CourseDashboard from "./pages/teacher/CourseDashboard";
import StudentInsights from "./pages/teacher/StudentInsights";
import Assessments from "./pages/teacher/Assessments";

import TeachingPlan from "./pages/teacher/TeachingPlan";
import SettingsIntegrity from "./pages/teacher/SettingsIntegrity";
import Support from "./pages/teacher/Support";
import StudentOnboarding from "./pages/student/StudentOnboarding";
import DiagnosticQuiz from "./pages/student/DiagnosticQuiz";
import StudentHome from "./pages/student/StudentHome";
import AIChat from "./pages/student/AIChat";
import StudentProgress from "./pages/student/Progress";
import Feedback from "./pages/student/Feedback";
import ComingSoon from "./components/ComingSoon";
import NotFound from "./pages/NotFound";
import AdminLayout from "./layouts/AdminLayout";
import AdminDashboard from "./pages/admin/AdminDashboard";
import AdminCourses from "./pages/admin/AdminCourses";
import AdminStudents from "./pages/admin/AdminStudents";
import AdminTeachers from "./pages/admin/AdminTeachers";
import ResetPassword from "./pages/ResetPassword";
import ContentLibrary from "./pages/teacher/ContentLibrary";
import TeacherChat from "./pages/teacher/TeacherChat";
import { AUTH_BYPASS } from "@/lib/authBypass";

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
  const { user } = useAuth();
  const [checking, setChecking] = useState(true);
  const [hasCourse, setHasCourse] = useState(false);

  useEffect(() => {
    if (!user) return;
    supabase
      .from("courses")
      .select("id")
      .eq("teacher_id", user.id)
      .limit(1)
      .then(({ data }) => {
        setHasCourse(!!(data && data.length > 0));
        setChecking(false);
      });
  }, [user]);

  if (checking) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="text-muted-foreground">Loading...</div>
      </div>
    );
  }

  return <Navigate to={hasCourse ? "/teacher/courses/dashboard" : "/teacher/onboarding"} replace />;
}

function StudentRedirect() {
  const { loading, hasProfile, hasEnrollment, hasDiagnostic } = useStudentStatus();
  const { setStudentOnboarded, setDiagnosticComplete } = useApp();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="text-muted-foreground">Loading...</div>
      </div>
    );
  }

  // Sync DB state to local context
  if (hasProfile && hasEnrollment) setStudentOnboarded(true);
  if (hasDiagnostic) setDiagnosticComplete(true);

  if (!hasProfile || !hasEnrollment) return <Navigate to="/student/onboarding" replace />;
  if (!hasDiagnostic) return <Navigate to="/student/diagnostic" replace />;
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
        setProfileRole(data?.role || user.user_metadata?.role || null);
        setChecking(false);
      });
  }, [user]);

  if (loading || checking) return null;
  if (user) {
    const r = profileRole || "student";
    if (r === "admin") return <Navigate to="/admin/dashboard" replace />;
    return <Navigate to={r === "teacher" ? "/teacher" : "/student"} replace />;
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
            <Routes>
              <Route path="/" element={<Landing />} />
              <Route path="/auth" element={<AuthRedirect />} />
              <Route path="/reset-password" element={<ResetPassword />} />

              {/* Teacher setup routes */}
              <Route path="/teacher" element={<ProtectedRoute><TeacherRedirect /></ProtectedRoute>} />
              <Route path="/teacher/onboarding" element={<ProtectedRoute><TeacherOnboarding /></ProtectedRoute>} />
              <Route path="/teacher/setup/materials" element={<ProtectedRoute><CourseMaterials /></ProtectedRoute>} />
              <Route path="/teacher/setup/lesson-plan" element={<ProtectedRoute><CourseCreation /></ProtectedRoute>} />
              <Route path="/teacher/setup/diagnostic" element={<ProtectedRoute><DiagnosticQuestionsSetup /></ProtectedRoute>} />
              <Route path="/teacher/setup/ai-settings" element={<ProtectedRoute><AITASettings /></ProtectedRoute>} />
              <Route path="/teacher/setup/exam-mode" element={<ProtectedRoute><ExamMode /></ProtectedRoute>} />
              <Route path="/teacher/setup/publish" element={<ProtectedRoute><PublishEnrollment /></ProtectedRoute>} />
              {/* Legacy setup routes — kept for safety, not in flow */}
              <Route path="/teacher/setup/quality-check" element={<ProtectedRoute><MaterialQualityCheck /></ProtectedRoute>} />
              <Route path="/teacher/setup/concepts" element={<ProtectedRoute><ConceptManagement /></ProtectedRoute>} />

              {/* Teacher dashboard routes */}
              <Route element={<ProtectedRoute><TeacherLayout /></ProtectedRoute>}>
                <Route path="/teacher/courses/dashboard" element={<CourseDashboard />} />
                <Route path="/teacher/assessments" element={<Assessments />} />
                
                <Route path="/teacher/teaching-plan" element={<TeachingPlan />} />
                <Route path="/teacher/chat" element={<TeacherChat />} />
                <Route path="/teacher/content-library" element={<ContentLibrary />} />
                <Route path="/teacher/settings" element={<SettingsIntegrity />} />
                <Route path="/teacher/support" element={<Support />} />
              </Route>

              {/* Student routes */}
              <Route path="/student" element={<ProtectedRoute><StudentRedirect /></ProtectedRoute>} />
              <Route path="/student/onboarding" element={<ProtectedRoute><StudentOnboarding /></ProtectedRoute>} />
              <Route path="/student/diagnostic" element={<ProtectedRoute><DiagnosticQuiz /></ProtectedRoute>} />
              <Route element={<ProtectedRoute><StudentLayout /></ProtectedRoute>}>
                <Route path="/student/home" element={<StudentHome />} />
                <Route path="/student/chat" element={<AIChat />} />
                <Route path="/student/feedback" element={<Feedback />} />
                <Route path="/student/progress" element={<StudentProgress />} />
              </Route>

              {/* Admin routes */}
              <Route path="/admin" element={<ProtectedRoute><AdminLayout /></ProtectedRoute>}>
                <Route index element={<AdminDashboard />} />
                <Route path="dashboard" element={<AdminDashboard />} />
                <Route path="courses" element={<AdminCourses />} />
                <Route path="students" element={<AdminStudents />} />
                <Route path="teachers" element={<AdminTeachers />} />
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
