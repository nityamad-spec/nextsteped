/**
 * Professor-controlled Career Readiness content (skills-training pathway).
 *
 * One row per course in public.course_career_readiness holds the content the
 * student Understand / Prepare / Practice steps render. The static demo data in
 * careerReadinessBriefing.ts, starStories.ts and mockInterviews.ts is now only a
 * seed for the professor's AI draft — students see the stored content or a short
 * "not set up yet" notice.
 */

import type { MockInterviewAccent, MockInterviewIcon } from "@/lib/mockInterviews";
import { MOCK_INTERVIEW_TYPES, MOCK_PER_TYPE_TARGET } from "@/lib/mockInterviews";
import {
  INTERVIEW_ROUNDS,
  TESTED_QUESTIONS,
  TESTED_SKILLS,
} from "@/lib/careerReadinessBriefing";
import { COMMON_PROMPTS } from "@/lib/starStories";
import { MOCK_CONFIG_BY_ID } from "@/lib/codingMock";

export interface CrInterviewRound {
  title: string;
  description: string;
  weight: number;
}

export interface CrQaPair {
  question: string;
  guidance: string;
}

export interface CrMockType {
  id: string;
  title: string;
  minutes: number;
  description: string;
  icon: MockInterviewIcon;
  accent: MockInterviewAccent;
  /** Mocks of this type a student should aim to complete. */
  target: number;
  prompt: { question: string; followUp: string };
}

export interface CareerReadinessContent {
  interviewRounds: CrInterviewRound[];
  testedQuestions: CrQaPair[];
  testedSkills: string[];
  commonPrompts: CrQaPair[];
  mockTypes: CrMockType[];
  understandPublished: boolean;
  preparePublished: boolean;
  practicePublished: boolean;
}

export const MOCK_ICONS: MockInterviewIcon[] = ["code", "network", "brain", "star", "sparkles"];
export const MOCK_ACCENTS: MockInterviewAccent[] = ["blue", "purple", "orange", "green", "pink"];

export const EMPTY_CAREER_READINESS: CareerReadinessContent = {
  interviewRounds: [],
  testedQuestions: [],
  testedSkills: [],
  commonPrompts: [],
  mockTypes: [],
  understandPublished: false,
  preparePublished: false,
  practicePublished: false,
};

const str = (v: unknown): string => (typeof v === "string" ? v.trim() : "");
const num = (v: unknown, fallback: number): number =>
  typeof v === "number" && Number.isFinite(v) ? v : fallback;

const slug = (s: string, i: number): string =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "") || `mock-${i + 1}`;

export function parseRounds(raw: unknown): CrInterviewRound[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((r: any) => ({
      title: str(r?.title),
      description: str(r?.description),
      weight: Math.max(0, Math.min(100, Math.round(num(r?.weight, 0)))),
    }))
    .filter((r) => r.title);
}

export function parsePairs(raw: unknown): CrQaPair[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((r: any) => ({ question: str(r?.question), guidance: str(r?.guidance) }))
    .filter((r) => r.question);
}

export function parseSkills(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((s) => str(s)).filter(Boolean);
}

export function parseMockTypes(raw: unknown): CrMockType[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((m: any, i: number) => {
      const title = str(m?.title);
      const icon = MOCK_ICONS.includes(m?.icon) ? (m.icon as MockInterviewIcon) : MOCK_ICONS[i % MOCK_ICONS.length];
      const accent = MOCK_ACCENTS.includes(m?.accent)
        ? (m.accent as MockInterviewAccent)
        : MOCK_ACCENTS[i % MOCK_ACCENTS.length];
      return {
        id: str(m?.id) || slug(title, i),
        title,
        minutes: Math.max(5, Math.min(180, Math.round(num(m?.minutes, 45)))),
        description: str(m?.description),
        icon,
        accent,
        target: Math.max(1, Math.min(50, Math.round(num(m?.target, MOCK_PER_TYPE_TARGET)))),
        prompt: {
          question: str(m?.prompt?.question),
          followUp: str(m?.prompt?.followUp),
        },
      };
    })
    .filter((m) => m.title);
}

/** Map a course_career_readiness row (or null) to the view model. */
export function parseCareerReadinessRow(row: any | null): CareerReadinessContent {
  if (!row) return EMPTY_CAREER_READINESS;
  return {
    interviewRounds: parseRounds(row.interview_rounds),
    testedQuestions: parsePairs(row.tested_questions),
    testedSkills: parseSkills(row.tested_skills),
    commonPrompts: parsePairs(row.common_prompts),
    mockTypes: parseMockTypes(row.mock_types),
    understandPublished: !!row.understand_published,
    preparePublished: !!row.prepare_published,
    practicePublished: !!row.practice_published,
  };
}

export const hasUnderstand = (c: CareerReadinessContent): boolean =>
  c.understandPublished && (c.interviewRounds.length > 0 || c.testedQuestions.length > 0);
export const hasPrepare = (c: CareerReadinessContent): boolean =>
  c.preparePublished && c.commonPrompts.length > 0;
export const hasPractice = (c: CareerReadinessContent): boolean =>
  c.practicePublished && c.mockTypes.length > 0;

/** Seed content used to pre-fill the professor's editor before an AI draft. */
export const SEED_ROUNDS: CrInterviewRound[] = INTERVIEW_ROUNDS.map((r) => ({ ...r }));
export const SEED_TESTED_QUESTIONS: CrQaPair[] = TESTED_QUESTIONS.map((q) => ({ ...q }));
export const SEED_TESTED_SKILLS: string[] = [...TESTED_SKILLS];
export const SEED_PROMPTS: CrQaPair[] = COMMON_PROMPTS.map((p) => ({ ...p }));
export const SEED_MOCK_TYPES: CrMockType[] = MOCK_INTERVIEW_TYPES.map((m) => ({
  id: m.id,
  title: m.title,
  minutes: m.minutes,
  description: m.description,
  icon: m.icon,
  accent: m.accent,
  target: MOCK_PER_TYPE_TARGET,
  prompt: {
    question: MOCK_CONFIG_BY_ID[m.id]?.prompt.question ?? "",
    followUp: MOCK_CONFIG_BY_ID[m.id]?.prompt.followUp ?? "",
  },
}));

export const CAREER_READINESS_EMPTY_NOTICE = "Your professor hasn't set this up yet.";
