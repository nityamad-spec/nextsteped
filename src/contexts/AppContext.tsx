import React, { createContext, useContext, useEffect, useState } from "react";
import { ChatSession, Course, StudentProfile, TASettings, TeacherProfile, UserRole } from "@/types";
import { defaultTASettings, mockCourse } from "@/data/mockData";

interface AppState {
  role: UserRole | null;
  setRole: (role: UserRole | null) => void;
  teacherProfile: TeacherProfile | null;
  setTeacherProfile: (p: TeacherProfile | null) => void;
  studentProfile: StudentProfile | null;
  setStudentProfile: (p: StudentProfile | null) => void;
  currentCourse: Course | null;
  setCurrentCourse: (c: Course | null) => void;
  taSettings: TASettings;
  setTASettings: (s: TASettings) => void;
  teacherOnboarded: boolean;
  setTeacherOnboarded: (v: boolean) => void;
  studentOnboarded: boolean;
  setStudentOnboarded: (v: boolean) => void;
  diagnosticComplete: boolean;
  setDiagnosticComplete: (v: boolean) => void;
  learningChats: ChatSession[];
  setLearningChats: (c: ChatSession[]) => void;
  examChats: ChatSession[];
  setExamChats: (c: ChatSession[]) => void;
  activeLearningChatId: string | null;
  setActiveLearningChatId: (id: string | null) => void;
  activeExamChatId: string | null;
  setActiveExamChatId: (id: string | null) => void;
  resetAll: () => void;
}

const AppContext = createContext<AppState>({} as AppState);

function usePersistedState<T>(key: string, defaultValue: T): [T, React.Dispatch<React.SetStateAction<T>>] {
  const [state, setState] = useState<T>(() => {
    try {
      const stored = localStorage.getItem(key);
      return stored ? JSON.parse(stored) : defaultValue;
    } catch {
      return defaultValue;
    }
  });
  useEffect(() => {
    localStorage.setItem(key, JSON.stringify(state));
  }, [key, state]);
  return [state, setState];
}

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [role, setRole] = usePersistedState<UserRole | null>("ns_role", null);
  const [teacherProfile, setTeacherProfile] = usePersistedState<TeacherProfile | null>("ns_teacher_profile", null);
  const [studentProfile, setStudentProfile] = usePersistedState<StudentProfile | null>("ns_student_profile", null);
  const [currentCourse, setCurrentCourse] = usePersistedState<Course | null>("ns_current_course", null);
  const [taSettings, setTASettings] = usePersistedState<TASettings>("ns_ta_settings", defaultTASettings);
  const [teacherOnboarded, setTeacherOnboarded] = usePersistedState("ns_teacher_onboarded", false);
  const [studentOnboarded, setStudentOnboarded] = usePersistedState("ns_student_onboarded", false);
  const [diagnosticComplete, setDiagnosticComplete] = usePersistedState("ns_diagnostic_complete", false);
  const [learningChats, setLearningChats] = usePersistedState<ChatSession[]>("ns_learning_chats", []);
  const [examChats, setExamChats] = usePersistedState<ChatSession[]>("ns_exam_chats", []);
  const [activeLearningChatId, setActiveLearningChatId] = usePersistedState<string | null>("ns_active_learning_chat", null);
  const [activeExamChatId, setActiveExamChatId] = usePersistedState<string | null>("ns_active_exam_chat", null);

  const resetAll = () => {
    setRole(null);
    setTeacherProfile(null);
    setStudentProfile(null);
    setCurrentCourse(null);
    setTASettings(defaultTASettings);
    setTeacherOnboarded(false);
    setStudentOnboarded(false);
    setDiagnosticComplete(false);
    setLearningChats([]);
    setExamChats([]);
    setActiveLearningChatId(null);
    setActiveExamChatId(null);
  };

  return (
    <AppContext.Provider
      value={{
        role, setRole,
        teacherProfile, setTeacherProfile,
        studentProfile, setStudentProfile,
        currentCourse, setCurrentCourse,
        taSettings, setTASettings,
        teacherOnboarded, setTeacherOnboarded,
        studentOnboarded, setStudentOnboarded,
        diagnosticComplete, setDiagnosticComplete,
        learningChats, setLearningChats,
        examChats, setExamChats,
        activeLearningChatId, setActiveLearningChatId,
        activeExamChatId, setActiveExamChatId,
        resetAll,
      }}
    >
      {children}
    </AppContext.Provider>
  );
}

export const useApp = () => useContext(AppContext);