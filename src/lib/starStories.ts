/**
 * Career Readiness "Prepare" step (STAR Story Builder).
 * Stories are stored per student per course in public.star_stories.
 */

export const STAR_TARGET_STORIES = 12;
/** Stories needed before the Prepare step counts as complete. */
export const STAR_COMPLETION_THRESHOLD = 6;

export interface StarStory {
  id: string;
  title: string;
  themes: string[];
  situation: string;
  task: string;
  action: string;
  result: string;
  /** ISO timestamp of the last save. */
  updatedAt: string;
}

export interface CommonPrompt {
  question: string;
  guidance: string;
}

/** Short relative label like "just now", "2d ago" for a saved story. */
export function writtenLabel(iso: string, now: Date = new Date()): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const mins = Math.floor((now.getTime() - then) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  const weeks = Math.floor(days / 7);
  return `${weeks}w ago`;
}

/** Behavioural themes a story can map to. */
export const STAR_THEMES: string[] = [
  "Customer obsession",
  "Ownership",
  "Dive deep",
  "Bias for action",
  "Deliver results",
  "Learn and be curious",
  "Invent and simplify",
  "Earn trust",
  "Think big",
  "Insist on high standards",
  "Have backbone",
  "Frugality",
  "Hire and develop",
  "Are right, a lot",
  "Deal with ambiguity",
  "Strive to be best",
];

/** The most-tested themes for freshers, highlighted in the themes panel. */
export const MOST_TESTED_THEMES: string[] = [
  "Customer obsession",
  "Ownership",
  "Dive deep",
  "Bias for action",
  "Deliver results",
  "Learn and be curious",
];

export const COMMON_PROMPTS: CommonPrompt[] = [
  {
    question: "Tell me about yourself",
    guidance: "60–90s. Current context → 2–3 highlights → why this role. Rehearse aloud.",
  },
  {
    question: "Why this company?",
    guidance: "Specific to product, culture, recent launches, OSS work. 'Great culture' gets flagged.",
  },
  {
    question: "Tell me about a time you failed",
    guidance: "Real failure. Own it. Spend 60% of the answer on what you learned and applied later.",
  },
  {
    question: "Disagreement with a teammate",
    guidance: "Data-driven, empathy, bias to action. Don't paint yourself as always right.",
  },
  {
    question: "Time you led something",
    guidance: "Concrete numbers. Even peer-lead moments count if the outcome was real.",
  },
  {
    question: "Project you're most proud of",
    guidance: "Trade-offs made, alternatives considered, what you'd change now.",
  },
];

/** Distinct themes covered by the current set of stories. */
export function coveredThemes(stories: StarStory[]): string[] {
  const seen = new Set<string>();
  stories.forEach((s) => s.themes.forEach((t) => seen.add(t)));
  return Array.from(seen);
}
