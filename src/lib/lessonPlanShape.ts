// Normalizes the two lesson-plan JSON shapes the app emits into a single
// array consumed by the student UI and AI Chat exam-topic constraint.
//
// Shape A (legacy, from src/pages/teacher/TeachingPlan.tsx):
//   [ { id, day, topic, description, resources: [{ concept, title, action, type, ... }] } ]
//
// Shape B (AI-generated, from src/pages/teacher/CourseCreation.tsx):
//   { weeks: [ { id, week, week_name, overview, is_exam_week, locked,
//                concepts: [{ id, name, brief_description }],
//                resources: [{ id, type, title, description, url }] } ],
//     overall_course_learning_outcomes: string }

export type NormalizedResource = {
  id: string;
  type: string;
  title: string;
  description?: string;
  url?: string;
  concept?: string;
  action?: string;
};

export type NormalizedConcept = {
  id: string;
  name: string;
  brief_description?: string;
};

export type NormalizedWeek = {
  id: string;
  // `day` keeps the legacy field name so the existing renderer in
  // StudentHome.tsx works unchanged. It actually represents the week number.
  day: number;
  topic: string;
  description: string;
  is_exam_week: boolean;
  locked: boolean;
  concepts: NormalizedConcept[];
  resources: NormalizedResource[];
};

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null;

export function normalizeLessonPlan(parsed: unknown): NormalizedWeek[] {
  if (Array.isArray(parsed)) {
    // Legacy shape — pass through, deriving concepts from resource[].concept.
    return parsed
      .filter(isObj)
      .map((d, idx) => {
        const day = Number(d.day ?? idx + 1) || idx + 1;
        const resources = Array.isArray(d.resources)
          ? (d.resources as any[]).filter(isObj).map((r, i) => ({
              id: String(r.id ?? `r_${day}_${i}`),
              type: String(r.type ?? "resource"),
              title: String(r.title ?? ""),
              description: r.description ? String(r.description) : undefined,
              url: r.url ? String(r.url) : undefined,
              concept: r.concept ? String(r.concept) : undefined,
              action: r.action ? String(r.action) : undefined,
            }))
          : [];
        const conceptNames = Array.from(
          new Set(resources.map(r => r.concept).filter(Boolean) as string[])
        );
        return {
          id: String(d.id ?? `w_${day}`),
          day,
          topic: String(d.topic ?? d.week_name ?? `Week ${day}`),
          description: String(d.description ?? ""),
          is_exam_week: Boolean(d.is_exam_week),
          locked: Boolean(d.locked),
          concepts: conceptNames.map((name, i) => ({
            id: `c_${day}_${i}`,
            name,
          })),
          resources,
        };
      });
  }

  if (isObj(parsed) && Array.isArray((parsed as any).weeks)) {
    const weeks = (parsed as any).weeks as unknown[];
    return weeks.filter(isObj).map((w, idx) => {
      const day = Number((w as any).week ?? idx + 1) || idx + 1;
      const concepts: NormalizedConcept[] = Array.isArray((w as any).concepts)
        ? ((w as any).concepts as any[]).filter(isObj).map((c, i) => ({
            id: String(c.id ?? `c_${day}_${i}`),
            name: String(c.name ?? ""),
            brief_description: c.brief_description ? String(c.brief_description) : undefined,
          }))
        : [];
      const conceptNames = concepts.map(c => c.name).filter(Boolean);
      const resources: NormalizedResource[] = Array.isArray((w as any).resources)
        ? ((w as any).resources as any[]).filter(isObj).map((r, i) => ({
            id: String(r.id ?? `r_${day}_${i}`),
            type: String(r.type ?? "resource"),
            title: String(r.title ?? ""),
            description: r.description ? String(r.description) : undefined,
            url: r.url ? String(r.url) : undefined,
            // Tag each AI resource with the first concept of the week so the
            // student renderer's "group by concept" still produces a heading.
            concept: r.concept
              ? String(r.concept)
              : conceptNames[0] || "General",
            action: r.action ? String(r.action) : (r.description ? String(r.description) : undefined),
          }))
        : [];
      return {
        id: String((w as any).id ?? `w_${day}`),
        day,
        topic: String((w as any).week_name || `Week ${day}`),
        description: String((w as any).overview ?? ""),
        is_exam_week: Boolean((w as any).is_exam_week),
        locked: Boolean((w as any).locked),
        concepts,
        resources,
      };
    });
  }

  return [];
}

export function extractOverallOutcomes(parsed: unknown): string {
  if (isObj(parsed) && typeof (parsed as any).overall_course_learning_outcomes === "string") {
    return (parsed as any).overall_course_learning_outcomes as string;
  }
  return "";
}
