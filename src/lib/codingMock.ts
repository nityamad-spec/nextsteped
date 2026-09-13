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

export const ML_DEPTH_MOCK_CONFIG: MockConfig = {
  title: "ML Depth mock",
  minutes: 45,
  prompt: {
    question: "Design a fraud detection system for a payments company.",
    followUp:
      "Cover: labels, features, model choice, class imbalance, serving latency, drift monitoring.",
  },
  checklist: [
    { id: "target", label: "Define the prediction target and label strategy" },
    { id: "features", label: "Discuss feature sources and leakage risks" },
    { id: "model", label: "Justify model choice against a simple baseline" },
    { id: "imbalance", label: "Handle class imbalance explicitly" },
    { id: "metrics", label: "State evaluation metrics beyond accuracy" },
    { id: "serving", label: "Cover serving latency, retraining, and drift monitoring" },
  ],
  reviewNotes: [
    { text: "You defined the label and its delay clearly — that is the hardest part of fraud modelling." },
    { text: "Compare against a simple baseline before proposing a complex model." },
    { text: "Say more about drift monitoring and retraining cadence; it shows production maturity." },
  ],
};

export const BEHAVIOURAL_MOCK_CONFIG: MockConfig = {
  title: "Behavioural mock",
  minutes: 30,
  prompt: {
    question: "Tell me about a time you disagreed with a teammate and how you resolved it.",
    followUp: "Follow STAR strictly. Concrete numbers. Own your part. What did you learn?",
  },
  checklist: [
    { id: "situation", label: "Set the situation in two sentences or less" },
    { id: "task", label: "State your specific task and ownership" },
    { id: "action", label: "Describe the actions you personally took" },
    { id: "result", label: "Quantify the result with concrete numbers" },
    { id: "learning", label: "Say what you learned and changed after" },
    { id: "length", label: "Keep it under three minutes" },
  ],
  reviewNotes: [
    { text: "Your STAR structure held up — situation and task were crisp and short." },
    { text: "Own your part more directly; say 'I' rather than 'we' when describing your actions." },
    { text: "Close with a quantified outcome and one concrete thing you changed afterwards." },
  ],
};

export const AGENT_DESIGN_MOCK_CONFIG: MockConfig = {
  title: "Agent Design mock",
  minutes: 60,
  prompt: {
    question: "Design an agent that books flights end-to-end from a natural-language request.",
    followUp:
      "Planning, tool schemas, error recovery mid-booking, memory of preferences, safety.",
  },
  checklist: [
    { id: "scope", label: "Clarify the task scope and success criteria" },
    { id: "planning", label: "Outline the planning loop and when it stops" },
    { id: "tools", label: "Define tool schemas and their inputs/outputs" },
    { id: "recovery", label: "Handle errors and recovery mid-booking" },
    { id: "memory", label: "Explain memory of user preferences" },
    { id: "safety", label: "Cover safety, guardrails, and human handoff" },
  ],
  reviewNotes: [
    { text: "Your planning loop was clear — you said explicitly when the agent stops and hands back." },
    { text: "Be more precise about tool schemas: exact inputs, outputs, and failure modes." },
    { text: "Spend longer on recovery mid-booking and safety guardrails; that is where agents break." },
  ],
};

export function formatElapsedTime(seconds: number): string {
  const clamped = Math.max(0, seconds);
  const m = Math.floor(clamped / 60);
  const s = clamped % 60;
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}
