import { supabase } from "@/integrations/supabase/client";

export interface CourseForExport {
  id: string;
  name: string;
  course_code: string | null;
  term: string;
  enrollment_code: string;
  enrollment_open: boolean;
  published: boolean;
  created_at: string;
  teacher_name: string;
  teacher_email: string | null;
  student_count: number;
}

interface InsightRow {
  enrolled: number;
  diagnosticSubmitted: number;
  diagnosticAvgPct: number | null;
  masteryAvgPct: number | null;
  bands: { beginner: number; developing: number; proficient: number; expert: number; none: number };
  completed: number;
  quizzesTotal: number;
  quizAttempts: number;
  quizStudents: number;
  quizAvgPct: number | null;
  examsTotal: number;
  examAttempts: number;
  examStudents: number;
  examAvgPct: number | null;
  chatStudents: number;
  chatMessages: number;
}

const PAGE = 1000;
async function fetchAllRange<T>(
  build: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>,
): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await build(from, from + PAGE - 1);
    if (error) { console.error("export fetch error", error); break; }
    const chunk = data ?? [];
    out.push(...chunk);
    if (chunk.length < PAGE) break;
  }
  return out;
}

async function fetchInsights(courseIds: string[]): Promise<Map<string, InsightRow>> {
  const map = new Map<string, InsightRow>();
  if (courseIds.length === 0) return map;

  const [enrRes, diagRes, masteryRes, examsRes, chatSessRes, resultsRes] = await Promise.all([
    supabase.from("enrollments").select("student_id, course_id").in("course_id", courseIds),
    supabase.from("diagnostic_results").select("student_id, course_id, score, total_questions").in("course_id", courseIds),
    supabase.from("student_course_mastery").select("student_id, course_id, mastery_score, learner_level").in("course_id", courseIds),
    supabase.from("course_exams").select("id, course_id, archived_at").in("course_id", courseIds),
    supabase.from("chat_sessions").select("id, user_id, course_id").in("course_id", courseIds),
    fetchAllRange<{ student_id: string; course_id: string; mode: string | null; quiz_day: number | null; exam_id: string | null; score: number | null; total_questions: number | null }>(
      (from, to) => supabase
        .from("assessment_results")
        .select("student_id, course_id, mode, quiz_day, exam_id, score, total_questions")
        .in("course_id", courseIds)
        .order("id", { ascending: true })
        .range(from, to),
    ),
  ]);

  const enrolledByCourse = new Map<string, Set<string>>();
  (enrRes.data || []).forEach(e => {
    const s = enrolledByCourse.get(e.course_id) || new Set<string>();
    s.add(e.student_id); enrolledByCourse.set(e.course_id, s);
  });

  const ensure = (cid: string): InsightRow => {
    let r = map.get(cid);
    if (!r) {
      r = {
        enrolled: 0, diagnosticSubmitted: 0, diagnosticAvgPct: null,
        masteryAvgPct: null, bands: { beginner: 0, developing: 0, proficient: 0, expert: 0, none: 0 },
        completed: 0, quizzesTotal: 0, quizAttempts: 0, quizStudents: 0, quizAvgPct: null,
        examsTotal: 0, examAttempts: 0, examStudents: 0, examAvgPct: null,
        chatStudents: 0, chatMessages: 0,
      };
      map.set(cid, r);
    }
    return r;
  };

  courseIds.forEach(cid => { ensure(cid).enrolled = enrolledByCourse.get(cid)?.size || 0; });

  // Diagnostics
  const diagAgg = new Map<string, { students: Set<string>; sum: number; n: number }>();
  (diagRes.data || []).forEach(d => {
    const enrolled = enrolledByCourse.get(d.course_id);
    if (!enrolled?.has(d.student_id)) return;
    const a = diagAgg.get(d.course_id) || { students: new Set(), sum: 0, n: 0 };
    a.students.add(d.student_id);
    const total = Number(d.total_questions) || 0;
    const score = Number(d.score) || 0;
    if (total > 0) { a.sum += score / total; a.n += 1; }
    diagAgg.set(d.course_id, a);
  });
  diagAgg.forEach((a, cid) => {
    const r = ensure(cid);
    r.diagnosticSubmitted = a.students.size;
    r.diagnosticAvgPct = a.n > 0 ? Math.round((a.sum / a.n) * 100) : null;
  });

  // Mastery
  const masteryByStudent = new Map<string, Map<string, { score: number | null; level: string | null }>>();
  const masterySum = new Map<string, { sum: number; n: number }>();
  (masteryRes.data || []).forEach(m => {
    const enrolled = enrolledByCourse.get(m.course_id);
    if (!enrolled?.has(m.student_id)) return;
    const r = ensure(m.course_id);
    const level = (m.learner_level || "").toLowerCase();
    if (level === "expert") r.bands.expert += 1;
    else if (level === "proficient") r.bands.proficient += 1;
    else if (level === "developing") r.bands.developing += 1;
    else if (level === "beginner") r.bands.beginner += 1;
    else r.bands.none += 1;
    const score = m.mastery_score != null ? Number(m.mastery_score) : null;
    if (score != null) {
      const s = masterySum.get(m.course_id) || { sum: 0, n: 0 };
      s.sum += score; s.n += 1;
      masterySum.set(m.course_id, s);
    }
    const inner = masteryByStudent.get(m.course_id) || new Map();
    inner.set(m.student_id, { score, level: m.learner_level || null });
    masteryByStudent.set(m.course_id, inner);
  });
  // fill bands.none for enrolled students missing mastery rows
  courseIds.forEach(cid => {
    const enrolled = enrolledByCourse.get(cid);
    if (!enrolled) return;
    const seen = masteryByStudent.get(cid) || new Map();
    enrolled.forEach(sid => { if (!seen.has(sid)) ensure(cid).bands.none += 1; });
  });
  masterySum.forEach((s, cid) => {
    ensure(cid).masteryAvgPct = s.n > 0 ? Math.round((s.sum / s.n) * 100) : null;
  });

  // Exams
  const activeExamIdsByCourse = new Map<string, Set<string>>();
  (examsRes.data || []).forEach(e => {
    if (e.archived_at) return;
    const s = activeExamIdsByCourse.get(e.course_id) || new Set<string>();
    s.add(e.id); activeExamIdsByCourse.set(e.course_id, s);
  });
  courseIds.forEach(cid => { ensure(cid).examsTotal = activeExamIdsByCourse.get(cid)?.size || 0; });

  // Results
  const quizAgg = new Map<string, { days: Set<number>; students: Set<string>; attempts: number; sum: number; n: number; byStudent: Map<string, Set<number>> }>();
  const examAgg = new Map<string, { students: Set<string>; attempts: number; sum: number; n: number; activeByStudent: Map<string, Set<string>> }>();

  resultsRes.forEach(r => {
    const enrolled = enrolledByCourse.get(r.course_id);
    if (!enrolled?.has(r.student_id)) return;
    const total = Number(r.total_questions) || 0;
    const pct = (Number(r.score) || 0) / 100;
    if (r.mode === "daily_quiz" && r.quiz_day != null) {
      const a = quizAgg.get(r.course_id) || { days: new Set(), students: new Set(), attempts: 0, sum: 0, n: 0, byStudent: new Map() };
      a.days.add(Number(r.quiz_day));
      a.students.add(r.student_id);
      a.attempts += 1;
      if (total > 0) { a.sum += pct; a.n += 1; }
      const bs = a.byStudent.get(r.student_id) || new Set<number>();
      bs.add(Number(r.quiz_day)); a.byStudent.set(r.student_id, bs);
      quizAgg.set(r.course_id, a);
    } else if (r.mode === "exam") {
      const a = examAgg.get(r.course_id) || { students: new Set(), attempts: 0, sum: 0, n: 0, activeByStudent: new Map() };
      a.students.add(r.student_id);
      a.attempts += 1;
      if (total > 0) { a.sum += pct; a.n += 1; }
      const active = activeExamIdsByCourse.get(r.course_id);
      if (r.exam_id && active?.has(r.exam_id)) {
        const bs = a.activeByStudent.get(r.student_id) || new Set<string>();
        bs.add(r.exam_id); a.activeByStudent.set(r.student_id, bs);
      }
      examAgg.set(r.course_id, a);
    }
  });

  quizAgg.forEach((a, cid) => {
    const r = ensure(cid);
    r.quizzesTotal = a.days.size;
    r.quizAttempts = a.attempts;
    r.quizStudents = a.students.size;
    r.quizAvgPct = a.n > 0 ? Math.round((a.sum / a.n) * 100) : null;
  });
  examAgg.forEach((a, cid) => {
    const r = ensure(cid);
    r.examAttempts = a.attempts;
    r.examStudents = a.students.size;
    r.examAvgPct = a.n > 0 ? Math.round((a.sum / a.n) * 100) : null;
  });

  // Completion: mastery proficient/expert + all weekly quizzes + all active exams attempted
  courseIds.forEach(cid => {
    const enrolled = enrolledByCourse.get(cid);
    if (!enrolled) return;
    const r = ensure(cid);
    const masteryMap = masteryByStudent.get(cid) || new Map();
    const qMap = quizAgg.get(cid)?.byStudent || new Map<string, Set<number>>();
    const eMap = examAgg.get(cid)?.activeByStudent || new Map<string, Set<string>>();
    let done = 0;
    enrolled.forEach(sid => {
      const level = (masteryMap.get(sid)?.level || "").toLowerCase();
      const masteryOk = level === "proficient" || level === "expert";
      const quizzesOk = r.quizzesTotal > 0 && (qMap.get(sid)?.size || 0) >= r.quizzesTotal;
      const examsOk = r.examsTotal === 0 || (eMap.get(sid)?.size || 0) >= r.examsTotal;
      if (masteryOk && quizzesOk && examsOk) done += 1;
    });
    r.completed = done;
  });

  // Chat
  const sessionsByCourse = new Map<string, { ids: string[]; students: Set<string> }>();
  (chatSessRes.data || []).forEach(s => {
    const enrolled = enrolledByCourse.get(s.course_id);
    if (!enrolled?.has(s.user_id)) return;
    const g = sessionsByCourse.get(s.course_id) || { ids: [], students: new Set() };
    g.ids.push(s.id); g.students.add(s.user_id);
    sessionsByCourse.set(s.course_id, g);
  });
  const allSessionIds = Array.from(sessionsByCourse.values()).flatMap(g => g.ids);
  const msgCount = new Map<string, number>();
  if (allSessionIds.length > 0) {
    const IN_CHUNK = 500;
    for (let i = 0; i < allSessionIds.length; i += IN_CHUNK) {
      const slice = allSessionIds.slice(i, i + IN_CHUNK);
      const msgs = await fetchAllRange<{ session_id: string }>((from, to) =>
        supabase.from("chat_messages").select("session_id")
          .in("session_id", slice).order("id", { ascending: true }).range(from, to),
      );
      msgs.forEach(m => msgCount.set(m.session_id, (msgCount.get(m.session_id) || 0) + 1));
    }
  }
  sessionsByCourse.forEach((g, cid) => {
    const r = ensure(cid);
    r.chatStudents = g.students.size;
    r.chatMessages = g.ids.reduce((acc, id) => acc + (msgCount.get(id) || 0), 0);
  });

  return map;
}

export async function exportCoursesToExcel(courses: CourseForExport[]): Promise<number> {
  const XLSX = await import("xlsx");
  const insights = await fetchInsights(courses.map(c => c.id));

  const wb = XLSX.utils.book_new();

  const summary = courses.map(c => ({
    Name: c.name,
    "Course Code": c.course_code || "",
    Term: c.term,
    Professor: c.teacher_name,
    "Professor Email": c.teacher_email || "",
    "Enrollment Code": c.enrollment_code,
    Status: c.published ? "Published" : "Draft",
    Enrollment: c.enrollment_open ? "Open" : "Closed",
    Students: c.student_count,
    "Created At": c.created_at,
  }));
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(summary), "Courses");

  const analytics = courses.map(c => {
    const r = insights.get(c.id);
    return {
      Course: c.name,
      "Course Code": c.course_code || "",
      Enrolled: r?.enrolled ?? c.student_count,
      "Diagnostic Submitted": r?.diagnosticSubmitted ?? 0,
      "Diagnostic Avg %": r?.diagnosticAvgPct ?? "",
      "Avg Mastery %": r?.masteryAvgPct ?? "",
      "Mastery Beginner": r?.bands.beginner ?? 0,
      "Mastery Developing": r?.bands.developing ?? 0,
      "Mastery Proficient": r?.bands.proficient ?? 0,
      "Mastery Expert": r?.bands.expert ?? 0,
      "Mastery Not Started": r?.bands.none ?? 0,
      "Course Completed": r?.completed ?? 0,
      "Weekly Quizzes Total": r?.quizzesTotal ?? 0,
      "Quiz Attempts": r?.quizAttempts ?? 0,
      "Students Attempted Quiz": r?.quizStudents ?? 0,
      "Avg Quiz Score %": r?.quizAvgPct ?? "",
      "Exams Total": r?.examsTotal ?? 0,
      "Exam Attempts": r?.examAttempts ?? 0,
      "Students Attempted Exam": r?.examStudents ?? 0,
      "Avg Exam Score %": r?.examAvgPct ?? "",
      "Chat Students": r?.chatStudents ?? 0,
      "Chat Messages": r?.chatMessages ?? 0,
    };
  });
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(analytics), "Course Analytics");

  const distribution: Record<string, unknown>[] = [];
  const bandLabels: { key: keyof InsightRow["bands"]; label: string }[] = [
    { key: "beginner", label: "Beginner" },
    { key: "developing", label: "Developing" },
    { key: "proficient", label: "Proficient" },
    { key: "expert", label: "Expert" },
    { key: "none", label: "Not Started" },
  ];
  courses.forEach(c => {
    const r = insights.get(c.id);
    const enrolled = r?.enrolled ?? c.student_count;
    bandLabels.forEach(({ key, label }) => {
      const count = r?.bands[key] ?? 0;
      distribution.push({
        Course: c.name,
        "Course Code": c.course_code || "",
        "Mastery Band": label,
        "Student Count": count,
        "% of Enrolled": enrolled > 0 ? Math.round((count / enrolled) * 100) : "",
      });
    });
  });
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(distribution), "Mastery Distribution");

  const date = new Date().toISOString().slice(0, 10);
  XLSX.writeFile(wb, `courses-export-${date}.xlsx`);
  return courses.length;
}
