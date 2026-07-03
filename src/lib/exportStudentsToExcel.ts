import * as XLSX from "xlsx";
import { supabase } from "@/integrations/supabase/client";

interface CourseEnrollmentLite {
  courseId: string;
  name: string;
  enrolledAt: string;
  mastery?: string | null;
}

export interface StudentGroupForExport {
  primaryProfileId: string;
  profileIds: string[];
  name: string;
  email: string | null;
  roll_number: string | null;
  created_at: string;
  courses: CourseEnrollmentLite[];
}

interface InsightRow {
  diagnosticLevel: string | null;
  diagnosticPct: number | null;
  finalLevel: string | null;
  finalPct: number | null;
  quizzesDone: number;
  quizzesTotal: number;
  avgQuizPct: number | null;
  examsDone: number;
  examsTotal: number;
  avgExamPct: number | null;
  proficientConcepts: number;
  totalConcepts: number;
  strong: string[];
  weak: string[];
  chatMessages: number;
  practiceAttempts: number;
  practiceAccuracyPct: number | null;
}

const emptyInsight = (): InsightRow => ({
  diagnosticLevel: null, diagnosticPct: null,
  finalLevel: null, finalPct: null,
  quizzesDone: 0, quizzesTotal: 0, avgQuizPct: null,
  examsDone: 0, examsTotal: 0, avgExamPct: null,
  proficientConcepts: 0, totalConcepts: 0,
  strong: [], weak: [],
  chatMessages: 0, practiceAttempts: 0, practiceAccuracyPct: null,
});

async function fetchInsights(
  studentIds: string[],
  courseIds: string[],
): Promise<Map<string, InsightRow>> {
  const map = new Map<string, InsightRow>();
  if (studentIds.length === 0 || courseIds.length === 0) return map;

  const [masteryRes, weeksRes, resultsRes, conceptsRes, cmRes, courseExamsRes, diagRes, sessionsRes] =
    await Promise.all([
      supabase.from("student_course_mastery")
        .select("student_id, course_id, mastery_score, learner_level")
        .in("student_id", studentIds).in("course_id", courseIds),
      supabase.from("lesson_plan_weeks")
        .select("course_id, week_number, is_exam_week").in("course_id", courseIds),
      supabase.from("assessment_results")
        .select("student_id, course_id, mode, quiz_day, exam_id, score, correct_answers, total_questions")
        .in("student_id", studentIds).in("course_id", courseIds),
      supabase.from("concepts").select("id, concept_code, course_id").in("course_id", courseIds),
      supabase.from("student_concept_mastery")
        .select("student_id, course_id, concept_id, concept_code, mastery_level, mastery_score")
        .in("student_id", studentIds).in("course_id", courseIds),
      supabase.from("course_exams")
        .select("course_id, published_at, archived_at").in("course_id", courseIds),
      supabase.from("diagnostic_results")
        .select("student_id, course_id, learner_level, mastery_score, score, created_at")
        .in("student_id", studentIds).in("course_id", courseIds)
        .order("created_at", { ascending: true }),
      supabase.from("chat_sessions")
        .select("id, user_id, course_id").in("user_id", studentIds).in("course_id", courseIds),
    ]);

  const conceptCodeById = new Map<string, string>();
  (conceptsRes.data || []).forEach(c => conceptCodeById.set(c.id, c.concept_code));

  const key = (sid: string, cid: string) => `${sid}:${cid}`;
  const ensure = (sid: string, cid: string) => {
    const k = key(sid, cid);
    let row = map.get(k);
    if (!row) { row = emptyInsight(); map.set(k, row); }
    return row;
  };

  // course-level totals
  const examsTotalByCourse = new Map<string, number>();
  (courseExamsRes.data || []).forEach(e => {
    if (e.archived_at || !e.published_at) return;
    examsTotalByCourse.set(e.course_id, (examsTotalByCourse.get(e.course_id) || 0) + 1);
  });
  const quizzesTotalByCourse = new Map<string, number>();
  (weeksRes.data || []).forEach(w => {
    if (w.is_exam_week) return;
    quizzesTotalByCourse.set(w.course_id, (quizzesTotalByCourse.get(w.course_id) || 0) + 1);
  });
  const conceptsTotalByCourse = new Map<string, number>();
  (conceptsRes.data || []).forEach(c => {
    conceptsTotalByCourse.set(c.course_id, (conceptsTotalByCourse.get(c.course_id) || 0) + 1);
  });

  // We need per-(student,course) rows for every enrolled pair — caller passes pairs implicitly
  // via studentIds x courseIds. We'll only populate rows that have any data below; the caller
  // fills in missing pairs from `emptyInsight()`.

  // mastery
  (masteryRes.data || []).forEach(m => {
    const r = ensure(m.student_id, m.course_id);
    const score = m.mastery_score != null ? Number(m.mastery_score) : null;
    if (score != null && (r.finalPct == null || score * 100 > r.finalPct)) {
      r.finalPct = Math.floor(score * 100);
      r.finalLevel = m.learner_level;
    } else if (r.finalLevel == null) {
      r.finalLevel = m.learner_level;
    }
  });

  // diagnostic (first per student/course)
  const diagSeen = new Set<string>();
  (diagRes.data || []).forEach(d => {
    const k = key(d.student_id, d.course_id);
    if (diagSeen.has(k)) return;
    diagSeen.add(k);
    const r = ensure(d.student_id, d.course_id);
    r.diagnosticLevel = d.learner_level ?? null;
    const score = d.mastery_score != null ? Number(d.mastery_score)
      : (d.score != null ? Number(d.score) / 100 : null);
    r.diagnosticPct = score != null ? Math.floor(score * 100) : null;
  });

  // assessment results
  const quizAgg = new Map<string, { days: Set<number>; scores: number[] }>();
  const examAgg = new Map<string, { ids: Set<string>; scores: number[] }>();
  (resultsRes.data || []).forEach(r => {
    const rawPct = typeof r.score === "number" ? r.score : 0;
    const pct = Math.max(0, Math.min(100, Math.floor(rawPct)));
    const k = key(r.student_id, r.course_id);
    if (r.mode === "daily_quiz" && r.quiz_day != null) {
      const a = quizAgg.get(k) || { days: new Set(), scores: [] };
      a.days.add(r.quiz_day); a.scores.push(pct);
      quizAgg.set(k, a);
    } else if (r.mode === "exam" && r.exam_id) {
      const a = examAgg.get(k) || { ids: new Set(), scores: [] };
      a.ids.add(r.exam_id); a.scores.push(pct);
      examAgg.set(k, a);
    } else if (r.mode === "practice") {
      const row = ensure(r.student_id, r.course_id);
      row.practiceAttempts += 1;
      const correct = r.correct_answers || 0;
      const total = r.total_questions || 0;
      // stash running totals via any-cast on side field
      const stash = (row as unknown as { _pc?: number; _pt?: number });
      stash._pc = (stash._pc || 0) + correct;
      stash._pt = (stash._pt || 0) + total;
    }
  });
  quizAgg.forEach((a, k) => {
    const [sid, cid] = k.split(":");
    const row = ensure(sid, cid);
    row.quizzesDone = a.days.size;
    row.avgQuizPct = a.scores.length > 0
      ? Math.round(a.scores.reduce((s, v) => s + v, 0) / a.scores.length)
      : null;
  });
  examAgg.forEach((a, k) => {
    const [sid, cid] = k.split(":");
    const row = ensure(sid, cid);
    row.examsDone = a.ids.size;
    row.avgExamPct = a.scores.length > 0
      ? Math.round(a.scores.reduce((s, v) => s + v, 0) / a.scores.length)
      : null;
  });

  // concept mastery (dedupe by concept, best score)
  const perConcept = new Map<string, Map<string, { level: string; score: number; code: string }>>();
  (cmRes.data || []).forEach(cm => {
    const k = key(cm.student_id, cm.course_id);
    const inner = perConcept.get(k) || new Map();
    const score = cm.mastery_score != null ? Number(cm.mastery_score) : 0;
    const code = cm.concept_code || conceptCodeById.get(cm.concept_id) || "Unknown";
    const level = (cm.mastery_level || "").toLowerCase();
    const existing = inner.get(cm.concept_id);
    if (!existing || score > existing.score) {
      inner.set(cm.concept_id, { level, score, code });
    }
    perConcept.set(k, inner);
  });
  perConcept.forEach((inner, k) => {
    const [sid, cid] = k.split(":");
    const row = ensure(sid, cid);
    const arr = Array.from(inner.values());
    row.proficientConcepts = arr.filter(c => c.level === "proficient").length;
    row.strong = arr.filter(c => c.level === "proficient" || c.level === "expert")
      .sort((a, b) => b.score - a.score).map(c => c.code);
    row.weak = arr.filter(c => c.level === "beginner" || c.level === "developing")
      .sort((a, b) => a.score - b.score).map(c => c.code);
  });

  // chat
  const sessionIdsByPair = new Map<string, string[]>();
  (sessionsRes.data || []).forEach(s => {
    const k = key(s.user_id, s.course_id);
    const arr = sessionIdsByPair.get(k) || [];
    arr.push(s.id); sessionIdsByPair.set(k, arr);
  });
  const allSessionIds = Array.from(sessionIdsByPair.values()).flat();
  const msgCountBySession = new Map<string, number>();
  if (allSessionIds.length > 0) {
    const { data: msgs } = await supabase.from("chat_messages")
      .select("session_id").in("session_id", allSessionIds);
    (msgs || []).forEach(m => {
      msgCountBySession.set(m.session_id, (msgCountBySession.get(m.session_id) || 0) + 1);
    });
  }
  sessionIdsByPair.forEach((ids, k) => {
    const [sid, cid] = k.split(":");
    const row = ensure(sid, cid);
    row.chatMessages = ids.reduce((s, id) => s + (msgCountBySession.get(id) || 0), 0);
  });

  // Fill totals + practice accuracy on every row we've touched.
  map.forEach((row, k) => {
    const [, cid] = k.split(":");
    row.quizzesTotal = quizzesTotalByCourse.get(cid) || 0;
    row.examsTotal = examsTotalByCourse.get(cid) || 0;
    row.totalConcepts = conceptsTotalByCourse.get(cid) || 0;
    const stash = row as unknown as { _pc?: number; _pt?: number };
    row.practiceAccuracyPct = stash._pt && stash._pt > 0
      ? Math.floor(((stash._pc || 0) / stash._pt) * 100) : null;
    delete stash._pc; delete stash._pt;
  });

  return map;
}

export async function exportStudentsToExcel(students: StudentGroupForExport[]): Promise<number> {
  // Collect enrollment pairs
  const studentIds = Array.from(new Set(students.flatMap(s => s.profileIds)));
  const courseIds = Array.from(new Set(students.flatMap(s => s.courses.map(c => c.courseId))));

  const insights = await fetchInsights(studentIds, courseIds);

  const wb = XLSX.utils.book_new();

  // Sheet 1 — Students
  const summary = students.map(s => ({
    Name: s.name,
    Email: s.email || "",
    "Roll Number": s.roll_number || "",
    Joined: s.created_at,
    "# Courses": s.courses.length,
    Courses: s.courses.map(c => c.name).join(", "),
    Accounts: s.profileIds.length,
  }));
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_sheet_to_sheet_safe(summary), "Students");

  // Sheet 2 — Enrollments
  const enrollments: Record<string, unknown>[] = [];
  students.forEach(s => {
    s.courses.forEach(c => {
      enrollments.push({
        "Student Name": s.name,
        Email: s.email || "",
        Course: c.name,
        "Enrolled At": c.enrolledAt,
        "Final Mastery Level": c.mastery || "",
      });
    });
  });
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_sheet_to_sheet_safe(enrollments), "Enrollments");

  // Sheet 3 — Course Insights
  const insightRows: Record<string, unknown>[] = [];
  students.forEach(s => {
    s.courses.forEach(c => {
      // pick first profileId that has data, else primary
      let row: InsightRow | undefined;
      for (const pid of s.profileIds) {
        const found = insights.get(`${pid}:${c.courseId}`);
        if (found) { row = found; break; }
      }
      const r = row || emptyInsight();
      insightRows.push({
        "Student Name": s.name,
        Email: s.email || "",
        Course: c.name,
        "Diagnostic Level": r.diagnosticLevel || "",
        "Diagnostic %": r.diagnosticPct ?? "",
        "Final Mastery Level": r.finalLevel || "",
        "Final Mastery %": r.finalPct ?? "",
        "Weekly Quizzes Attempted": r.quizzesDone,
        "Weekly Quizzes Total": r.quizzesTotal,
        "Avg Quiz Score %": r.avgQuizPct ?? "",
        "Exams Attempted": r.examsDone,
        "Exams Total": r.examsTotal,
        "Avg Exam Score %": r.avgExamPct ?? "",
        "Proficient Concepts": r.proficientConcepts,
        "Total Concepts": r.totalConcepts,
        "Strong Concepts": r.strong.join("; "),
        "Weak Concepts": r.weak.join("; "),
        "Chat Messages": r.chatMessages,
        "Practice Questions Attempted": r.practiceAttempts,
        "Practice Accuracy %": r.practiceAccuracyPct ?? "",
      });
    });
  });
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_sheet_to_sheet_safe(insightRows), "Course Insights");

  const date = new Date().toISOString().slice(0, 10);
  XLSX.writeFile(wb, `students-export-${date}.xlsx`);

  return students.length;
}

// Small shim: json_to_sheet with header inference; guards empty arrays.
// (Attached to XLSX.utils to keep call sites concise.)
declare module "xlsx" {
  namespace utils {
    function json_sheet_to_sheet_safe(data: Record<string, unknown>[]): XLSX.WorkSheet;
  }
}
(XLSX.utils as unknown as { json_sheet_to_sheet_safe: (d: Record<string, unknown>[]) => XLSX.WorkSheet })
  .json_sheet_to_sheet_safe = (data) => {
    if (data.length === 0) return XLSX.utils.aoa_to_sheet([["(no rows)"]]);
    return XLSX.utils.json_to_sheet(data);
  };
