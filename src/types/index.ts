export type UserRole = "teacher" | "student";

export interface TeacherProfile {
  name: string;
  department: string;
  courses: string[];
  teachingStyle: string;
}

export interface StudentProfile {
  name: string;
  courseCode: string;
  learnerLevel: "Beginner" | "Intermediate" | "Advanced" | "Expert";
  topicBaseline: Record<string, number>;
}

export interface Course {
  id: string;
  name: string;
  term: "First Semester" | "Second Semester" | "Summer Semester";
  sections: string[];
  objectives: string[];
  enrollmentCode: string;
  syllabusUploaded: boolean;
  materialsUploaded: boolean;
  published: boolean;
  startDate?: string;
  endDate?: string;
}

export interface ConceptTopic {
  id: string;
  name: string;
  module: string;
  prerequisites: string[];
  confidence: "High" | "Medium" | "Low";
  mastery?: number;
}

export interface QuizQuestion {
  id: string;
  question: string;
  options: string[];
  correctIndex: number;
  topic: string;
  difficulty: "Easy" | "Medium" | "Hard";
  explanation: string;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: number;
  hasCode?: boolean;
  codeContent?: string;
  codeLanguage?: string;
}

export interface ChatSession {
  id: string;
  title: string;
  mode: "learning" | "exam";
  messages: ChatMessage[];
  createdAt: number;
  updatedAt: number;
}

export interface TASettings {
  hintLadder: boolean;
  knowledgeSources: "uploaded" | "uploaded_and_web";
  citationRequired: boolean;
  plagiarismWarnings: boolean;
  examTimeLimit: number;
  examDifficulty: "Easy" | "Medium" | "Hard" | "Mixed";
  examQuestionMix: string;
}

export interface DashboardMetrics {
  activeStudents: number;
  totalSessions: number;
  topMisunderstood: string[];
  masteryDistribution: Record<string, number>;
  atRiskCount: number;
}

export interface SyllabusRecommendation {
  id: string;
  category: string;
  original: string;
  suggestion: string;
  reason: string;
  accepted: boolean | null;
}

export interface ContentItem {
  id: string;
  type: "concept" | "practice" | "exam";
  title: string;
  content: string;
  topic: string;
  difficulty: "Easy" | "Medium" | "Hard";
  approved: boolean;
  flagged: boolean;
}