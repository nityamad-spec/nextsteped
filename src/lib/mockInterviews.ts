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

/** Per-type accent colour so each interview type reads as distinct. */
export type MockInterviewAccent = "blue" | "purple" | "orange" | "green" | "pink";

export interface MockInterviewType {
  id: string;
  title: string;
  minutes: number;
  description: string;
  icon: MockInterviewIcon;
  accent: MockInterviewAccent;
  /** Demo-only count of completed mocks for this interview type. */
  completed: number;
}

export interface RecentMock {
  id: string;
  type: string;
  note: string;
  score: number;
  when: string;
}

/** Target mocks per interview type. */
export const MOCK_PER_TYPE_TARGET = 8;

export const MOCK_INTERVIEW_TYPES: MockInterviewType[] = [
  {
    id: "coding",
    title: "Coding",
    minutes: 45,
    description: "2 LeetCode-style problems, screenshare + narration",
    icon: "code",
    accent: "blue",
    completed: 1,
  },
  {
    id: "system-design",
    title: "System Design",
    minutes: 60,
    description: "HLD or LLD prompt with follow-ups and trade-offs",
    icon: "network",
    accent: "purple",
    completed: 1,
  },
  {
    id: "ml-depth",
    title: "ML Depth",
    minutes: 45,
    description: "Derive from scratch, defend design choices, debug models",
    icon: "brain",
    accent: "orange",
    completed: 0,
  },
  {
    id: "behavioural",
    title: "Behavioural",
    minutes: 30,
    description: "STAR-format cross-examination on your stories",
    icon: "star",
    accent: "green",
    completed: 1,
  },
  {
    id: "agent-design",
    title: "Agent Design",
    minutes: 60,
    description: "Multi-agent architecture prompt: planning, tools, evals",
    icon: "sparkles",
    accent: "pink",
    completed: 0,
  },
];

/** Total target across every interview type (5 types x 8). */
export const MOCK_TOTAL_TARGET = MOCK_INTERVIEW_TYPES.length * MOCK_PER_TYPE_TARGET;

/** Total completed across every interview type. */
export const MOCK_TOTAL_COMPLETED = MOCK_INTERVIEW_TYPES.reduce(
  (sum, type) => sum + type.completed,
  0
);

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
