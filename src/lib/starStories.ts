/**
 * Static demo data for the Career Readiness "Prepare" step (STAR Story Builder).
 * Nothing here is persisted — edits live in page state only.
 */

export const STAR_TARGET_STORIES = 12;

export interface StarStory {
  id: string;
  title: string;
  themes: string[];
  situation: string;
  task: string;
  action: string;
  result: string;
  writtenLabel: string;
}

export interface CommonPrompt {
  question: string;
  guidance: string;
}

/** Demo stories are examples only; locally created stories count toward Practice. */
export const isStudentCreatedStory = (story: StarStory): boolean =>
  story.id.startsWith("local-");

/** Behavioural themes a story can map to (demo set). */
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

/** Three sample stories so the builder shows a realistic filled state. */
export const DEMO_STAR_STORIES: StarStory[] = [
  {
    id: "demo-1",
    title: "Shipped an ML pipeline under a 2-week deadline",
    themes: ["Bias for action", "Deliver results", "Ownership"],
    writtenLabel: "2d ago",
    situation:
      "During my final-year internship, our team was asked to deliver a fraud-detection prototype with only 2 weeks before a client demo. The data was messy, and the initial pipeline was too slow.",
    task:
      "I was responsible for the data pipeline and model training layer — needed to deliver a working demo without cutting corners on evaluation.",
    action:
      "I split the work: parallelized preprocessing with Dask, cut features from 240 → 65 via SHAP-guided pruning, and set up a nightly retraining job on Airflow. Communicated daily blockers to my mentor and paired 1:1 with a teammate for the eval harness.",
    result:
      "Delivered on day 12 with 89% recall at 4% FPR — 3× faster than the baseline. Client extended the engagement by 6 months.",
  },
  {
    id: "demo-2",
    title: "Rewrote a flaky test suite nobody owned",
    themes: ["Ownership", "Insist on high standards", "Dive deep"],
    writtenLabel: "5d ago",
    situation:
      "Our CI failed roughly 1 in 3 runs on an open-source project I contributed to. Most people just re-ran the job until it passed.",
    task:
      "Nobody owned the test suite. I decided to make CI trustworthy again so reviews stopped stalling.",
    action:
      "I logged 40 failing runs, grouped them by root cause, and found 80% came from shared global fixtures and timing assumptions. I isolated fixtures per test, replaced sleeps with explicit waits, and added a flake-detection job that re-runs new tests 5×.",
    result:
      "Failure rate dropped from 33% to under 2% across 300 runs. Median PR review time fell from 2 days to 6 hours.",
  },
  {
    id: "demo-3",
    title: "Disagreed with a teammate on the model choice",
    themes: ["Have backbone", "Earn trust", "Are right, a lot"],
    writtenLabel: "1w ago",
    situation:
      "On a course capstone, a teammate wanted to fine-tune a large model for a text-classification task with only 1,200 labelled examples.",
    task:
      "I thought we'd overfit and blow our compute budget, but I'd been wrong before — so I wanted evidence, not an argument.",
    action:
      "I proposed a 2-day bake-off: their fine-tune against my TF-IDF + linear baseline and a frozen-embedding classifier, on the same split. We agreed on the metric up front so the result would settle it.",
    result:
      "The embedding classifier won by 4 F1 points at 1/20th the cost. We shipped it, and my teammate later reused the bake-off format for his own project.",
  },
];

/** Distinct themes covered by the current set of stories. */
export function coveredThemes(stories: StarStory[]): string[] {
  const seen = new Set<string>();
  stories.forEach((s) => s.themes.forEach((t) => seen.add(t)));
  return Array.from(seen);
}
