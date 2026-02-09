import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AppProvider, useApp } from "@/contexts/AppContext";
import Landing from "./pages/Landing";
import TeacherLayout from "./layouts/TeacherLayout";
import StudentLayout from "./layouts/StudentLayout";
import TeacherOnboarding from "./pages/teacher/TeacherOnboarding";
import CourseCreation from "./pages/teacher/CourseCreation";
import AITASettings from "./pages/teacher/AITASettings";
import ContentReview from "./pages/teacher/ContentReview";
import CourseDashboard from "./pages/teacher/CourseDashboard";
import StudentInsights from "./pages/teacher/StudentInsights";
import Assessments from "./pages/teacher/Assessments";
import SettingsIntegrity from "./pages/teacher/SettingsIntegrity";
import Support from "./pages/teacher/Support";
import StudentOnboarding from "./pages/student/StudentOnboarding";
import DiagnosticQuiz from "./pages/student/DiagnosticQuiz";
import StudentHome from "./pages/student/StudentHome";
import AIChat from "./pages/student/AIChat";
import InterviewPrep from "./pages/student/InterviewPrep";
import StudentProgress from "./pages/student/Progress";
import Employers from "./pages/student/Employers";
import ComingSoon from "./components/ComingSoon";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

function TeacherRedirect() {
  const { teacherOnboarded } = useApp();
  return <Navigate to={teacherOnboarded ? "/teacher/courses/dashboard" : "/teacher/onboarding"} replace />;
}

function StudentRedirect() {
  const { studentOnboarded, diagnosticComplete } = useApp();
  if (!studentOnboarded) return <Navigate to="/student/onboarding" replace />;
  if (!diagnosticComplete) return <Navigate to="/student/diagnostic" replace />;
  return <Navigate to="/student/home" replace />;
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <AppProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<Landing />} />

            {/* Teacher setup routes (standalone, no layout) */}
            <Route path="/teacher" element={<TeacherRedirect />} />
            <Route path="/teacher/onboarding" element={<TeacherOnboarding />} />
            <Route path="/teacher/setup/syllabus" element={<CourseCreation />} />
            <Route path="/teacher/setup/settings" element={<AITASettings />} />
            <Route path="/teacher/setup/content" element={<ContentReview />} />

            {/* Teacher dashboard routes (inside layout) */}
            <Route element={<TeacherLayout />}>
              <Route path="/teacher/courses/dashboard" element={<CourseDashboard />} />
              <Route path="/teacher/insights" element={<StudentInsights />} />
              <Route path="/teacher/content-library" element={<ComingSoon title="Content Library" description="Manage and organize all your teaching materials in one place." />} />
              <Route path="/teacher/assessments" element={<Assessments />} />
              <Route path="/teacher/settings" element={<SettingsIntegrity />} />
              <Route path="/teacher/support" element={<Support />} />
            </Route>

            {/* Student routes */}
            <Route path="/student" element={<StudentRedirect />} />
            <Route path="/student/onboarding" element={<StudentOnboarding />} />
            <Route path="/student/diagnostic" element={<DiagnosticQuiz />} />
            <Route element={<StudentLayout />}>
              <Route path="/student/home" element={<StudentHome />} />
              <Route path="/student/chat" element={<AIChat />} />
              <Route path="/student/interview" element={<InterviewPrep />} />
              <Route path="/student/progress" element={<StudentProgress />} />
              <Route path="/student/employers" element={<Employers />} />
            </Route>

            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </AppProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
