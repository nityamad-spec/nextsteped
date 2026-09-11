/**
 * Static demo data for the Career Readiness "Practice" step (Mock Interview Lab).
 * Visual only — nothing here is persisted or course-specific.
 */

export type MockInterviewIcon =
  | "code"
  | "network"
  | "brain"
  | "star"
  | "sparkles";

export interface MockInterviewType {
  id: string;
  title: string;
  minutes: number;
  description: string;
  icon: MockInterviewIcon;
}

export interface RecentMock {
  id: string;
  type: string;
  note: string;
  score: number;
  when: string;
}

export const MOCK_TARGET_COUNT = 10;
export const MOCK_COMPLETED_COUNT = 3;

export const MOCK_INTERVIEW_TYPES: MockInterviewType[] = [
  {
    id: "coding",
    title: "Coding",
    minutes: 45,
    description: "2 LeetCode-style problems, screenshare + narration",
    icon: "code",
  },
  {
    id: "system-design",
    title: "System Design",
    minutes: 60,
    description: "HLD or LLD prompt with follow-ups and trade-offs",
    icon: "network",
  },
  {
    id: "ml-depth",
    title: "ML Depth",
    minutes: 45,
    description: "Derive from scratch, defend design choices, debug models",
    icon: "brain",
  },
  {
    id: "behavioural",
    title: "Behavioural",
    minutes: 30,
    description: "STAR-format cross-examination on your stories",
    icon: "star",
  },
  {
    id: "agent-design",
    title: "Agent Design",
    minutes: 60,
    description: "Multi-agent architecture prompt: planning, tools, evals",
    icon: "sparkles",
  },
];

export const RECENT_MOCKS: RecentMock[] = [
  {
    id: "r1",
    type: "Coding",
    note: "Cleaner brute force before optimizing",
    score: 8,
    when: "3 days ago",
  },
  {
    id: "r2",
    type: "System Design",
    note: "Missed monitoring + eval discussion",
    score: 6,
    when: "1 week ago",
  },
  {
    id: "r3",
    type: "Behavioural",
    note: "STAR structure got sloppy in story 2",
    score: 7,
    when: "2 weeks ago",
  },
];
