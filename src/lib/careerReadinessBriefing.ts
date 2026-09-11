import { DEMO_OPENINGS } from "@/components/student/employment/demoOpenings";

/**
 * Static demo briefing for the Career Readiness "Understand" step.
 * Placeholder content until real role/company data is wired in.
 * The course's target role name is interpolated where shown.
 */

export interface InterviewRound {
  title: string;
  description: string;
  weight: number;
}

export interface TestedQuestion {
  question: string;
  guidance: string;
}

export interface CompanyNote {
  company: string;
  statusLabel: string;
  note: string;
}

export const INTERVIEW_ROUNDS: InterviewRound[] = [
  {
    title: "Coding",
    description: "Data structures & algorithms, screenshare with narration.",
    weight: 30,
  },
  {
    title: "LLM & ML depth",
    description: "Fundamentals, prompting, fine-tuning, RAG — explain and defend.",
    weight: 45,
  },
  {
    title: "Applied / RAG design",
    description: "Design a real LLM system, discuss trade-offs and evaluation.",
    weight: 15,
  },
  {
    title: "Behavioural",
    description: "STAR-format questions on your past work and decisions.",
    weight: 10,
  },
];

export const TESTED_QUESTIONS: TestedQuestion[] = [
  {
    question: '"Tell me about yourself"',
    guidance:
      "60–90s: current context → 2–3 highlights → why this role. Rehearse aloud.",
  },
  {
    question: '"Why this company?"',
    guidance:
      'Specific to their product, recent launches, and work. "Great culture" gets flagged.',
  },
  {
    question: '"Explain RAG to me"',
    guidance:
      "Show the intuition first, then the mechanics, then a real trade-off you'd make.",
  },
  {
    question: '"A time you failed"',
    guidance:
      "Own a real failure. Spend most of the answer on what you learned and applied.",
  },
];

export const TESTED_SKILLS: string[] = [
  "Problem-solving",
  "LLM fundamentals",
  "Communication",
  "Ownership",
];

const COMPANY_NOTES: Record<string, string> = {
  Sarvam:
    "Heavy on applied LLM and RAG. Expect a hands-on system-design discussion over pure theory.",
  Zomato:
    "Practical ML over theory. Be ready to talk through a model you shipped end-to-end and its metrics.",
  Google:
    "Bar-raiser round on fundamentals. Strong coding + behavioural mapped to leadership principles.",
};

/** Notes for the same demo companies shown in "Openings matched to you". */
export const COMPANY_SPECIFIC_NOTES: CompanyNote[] = DEMO_OPENINGS.map((o) => ({
  company: o.company,
  statusLabel: `${o.status} ${o.match}%`,
  note: COMPANY_NOTES[o.company] ?? "Interview details shared after shortlisting.",
}));
