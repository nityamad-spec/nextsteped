/**
 * Static demo content for the Career Readiness → Practice → Coding mock interview.
 * Visual only — nothing is persisted.
 */

export interface PrepStep {
  number: number;
  text: string;
}

export interface CoachItem {
  id: string;
  label: string;
}

export interface DemoReviewNote {
  text: string;
}

export const CODING_MOCK_TITLE = "Coding mock";
export const CODING_MOCK_MINUTES = 45;

export const CODING_PREP_STEPS: PrepStep[] = [
  { number: 1, text: "Close every other tab — this is single-task time." },
  { number: 2, text: "Have paper + pen. Whiteboard-style thinking beats typing early." },
  { number: 3, text: "Narrate your thinking. Silent minutes are lost points." },
  { number: 4, text: "Aim to finish 5 min before the buzzer — leaves room for follow-ups." },
];

export const CODING_PROMPT = {
  question: "Given a stream of integers, return the K largest elements at any moment.",
  followUp: "What if K is 10^6? What if the stream is 10^9 elements? Space vs. time trade-off.",
};

export const CODING_COACH_CHECKLIST: CoachItem[] = [
  { id: "restate", label: "Restate the problem and confirm input/output" },
  { id: "assumptions", label: "Ask clarifying questions and state assumptions" },
  { id: "brute", label: "Outline brute force, then optimize" },
  { id: "example", label: "Walk through a concrete example" },
  { id: "complexity", label: "Analyze time and space complexity" },
  { id: "edge", label: "Cover edge cases and test your code" },
];

export const CODING_REVIEW_NOTES: DemoReviewNote[] = [
  { text: "You restated the problem and confirmed input/output before coding — keep that habit." },
  { text: "Outline the brute force solution before jumping to the heap — interviewers want the trade-off." },
  { text: "Leave time at the end to dry-run edge cases against your code." },
];

/** Everything a full mock session needs — prompt, timer length, checklist, review notes. */
export interface MockConfig {
  /** Short label used in eyebrows, e.g. "Coding mock", "System design mock". */
  title: string;
  minutes: number;
  prompt: { question: string; followUp: string };
  checklist: CoachItem[];
  reviewNotes: DemoReviewNote[];
}

export const CODING_MOCK_CONFIG: MockConfig = {
  title: CODING_MOCK_TITLE,
  minutes: CODING_MOCK_MINUTES,
  prompt: CODING_PROMPT,
  checklist: CODING_COACH_CHECKLIST,
  reviewNotes: CODING_REVIEW_NOTES,
};

export const SYSTEM_DESIGN_MOCK_CONFIG: MockConfig = {
  title: "System design mock",
  minutes: 60,
  prompt: {
    question: "Design Swiggy's real-time delivery ETA system.",
    followUp:
      "Cover: data model, real-time ingestion, ETA prediction, monitoring, staleness, A/B testing.",
  },
  checklist: [
    { id: "requirements", label: "Clarify requirements and scope" },
    { id: "scale", label: "Estimate scale (QPS, storage, users)" },
    { id: "data-model", label: "Define the data model" },
    { id: "bottlenecks", label: "Identify bottlenecks and single points of failure" },
    { id: "tradeoffs", label: "Discuss trade-offs explicitly" },
    { id: "monitoring", label: "Cover monitoring and alerting" },
  ],
  reviewNotes: [
    { text: "You scoped the problem well and stated assumptions before designing." },
    { text: "Spend more time on scale estimates next time — interviewers anchor on your numbers." },
    { text: "Call out staleness and failure handling earlier; it signals production experience." },
  ],
};

export function formatElapsedTime(seconds: number): string {
  const clamped = Math.max(0, seconds);
  const m = Math.floor(clamped / 60);
  const s = clamped % 60;
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}
