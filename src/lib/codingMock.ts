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
  { id: "restate", label: "Restate the problem in your own words" },
  { id: "assumptions", label: "State assumptions explicitly" },
  { id: "brute", label: "Discuss brute force before optimizing" },
  { id: "example", label: "Walk through an example" },
  { id: "complexity", label: "Analyze time + space complexity" },
  { id: "edge", label: "Ask about edge cases" },
];

export const CODING_REVIEW_NOTES: DemoReviewNote[] = [
  { text: "You restated the problem clearly and stated assumptions up front." },
  { text: "Try to discuss brute force before jumping to the heap solution — interviewers want to see the trade-off." },
  { text: "Walk through a concrete example before writing code next time." },
];

export function formatElapsedTime(seconds: number): string {
  const clamped = Math.max(0, seconds);
  const m = Math.floor(clamped / 60);
  const s = clamped % 60;
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}
