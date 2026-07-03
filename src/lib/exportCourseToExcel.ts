import { supabase } from "@/integrations/supabase/client";

export interface CourseForSingleExport {
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
}


type Band = "beginner" | "developing" | "proficient" | "expert" | "none";

interface StudentRow {
  id: string;
  name: string;
  email: string;
  roll: string;
  enrolledAt: string | null;
  diagnosticSubmitted: boolean;
  diagnosticSubmittedAt: string | null;
  diagnosticPct: number | null;
  diagnosticLevel: string | null;
  masteryLevel: string; // capitalized
  masteryBand: Band;
  masteryPct: number | null;
  quizzesAttempted: number;
  quizzesTotal: number;
  quizAvgPct: number | null;
  examsAttempted: number;
  examsTotal: number;
  examAvgPct: number | null;
  chatMessages: number;
  completed: boolean;
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

const capitalize = (s: string | null | undefined) =>
  !s ? "" : s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();

const toBand = (level: string | null | undefined): Band => {
  const l = (level || "").toLowerCase();
  if (l === "expert") return "expert";
  if (l === "proficient") return "proficient";
  if (l === "developing") return "developing";
  if (l === "beginner") return "beginner";
  return "none";
};

const BAND_LABEL: Record<Band, string> = {
  beginner: "Beginner",
  developing: "Developing",
  proficient: "Proficient",
  expert: "Expert",
  none: "Not Started",
};

async function buildStudentRows(courseId: string, universityId?: string | null): Promise<StudentRow[]> {
  const [enrRes, examsRes, chatSessRes, masteryRes, diagRes, resultsAll] = await Promise.all([
    supabase.from("enrollments").select("student_id, enrolled_at").eq("course_id", courseId),
    supabase.from("course_exams").select("id, archived_at").eq("course_id", courseId),
    supabase.from("chat_sessions").select("id, user_id").eq("course_id", courseId),
    supabase.from("student_course_mastery").select("student_id, mastery_score, learner_level").eq("course_id", courseId),
    supabase.from("diagnostic_results").select("student_id, score, total_questions, learner_level, created_at").eq("course_id", courseId).order("created_at", { ascending: false }),
    fetchAllRange<{ student_id: string; mode: string | null; quiz_day: number | null; exam_id: string | null; score: number | null; total_questions: number | null }>(
      (from, to) => supabase
        .from("assessment_results")
        .select("student_id, mode, quiz_day, exam_id, score, total_questions")
        .eq("course_id", courseId)
        .order("id", { ascending: true })
        .range(from, to),
    ),
  ]);

  let studentIds = Array.from(new Set((enrRes.data || []).map(e => e.student_id)));
  const enrolledAt = new Map<string, string | null>();
  (enrRes.data || []).forEach(e => enrolledAt.set(e.student_id, (e as any).enrolled_at ?? null));

  const profiles = studentIds.length
    ? (await supabase.from("profiles").select("id, name, email, roll_number, university_id").in("id", studentIds)).data || []
    : [];
  const profileMap = new Map(profiles.map(p => [p.id, p as any]));

  if (universityId) {
    studentIds = studentIds.filter(id => (profileMap.get(id) as any)?.university_id === universityId);
  }


  // Active exams (match CourseProfileDialog: not archived)
  const activeExamIds = new Set<string>();
  (examsRes.data || []).forEach(e => { if (!e.archived_at) activeExamIds.add(e.id); });
  const examsTotal = activeExamIds.size;

  // Diagnostic: latest per student
  const diagByStudent = new Map<string, { pct: number | null; level: string | null; at: string | null }>();
  (diagRes.data || []).forEach(d => {
    if (diagByStudent.has(d.student_id)) return; // already have latest (ordered desc)
    const total = Number(d.total_questions) || 0;
    const score = Number(d.score) || 0;
    const pct = total > 0 ? Math.round((score / total) * 100) : null;
    diagByStudent.set(d.student_id, { pct, level: d.learner_level ?? null, at: (d as any).created_at ?? null });
  });

  // Mastery
  const masteryByStudent = new Map<string, { level: string | null; score: number | null }>();
  (masteryRes.data || []).forEach(m => {
    masteryByStudent.set(m.student_id, {
      level: m.learner_level ?? null,
      score: m.mastery_score != null ? Number(m.mastery_score) : null,
    });
  });

  // Quiz + exam aggregation
  const quizDays = new Set<number>();
  const quizByStudent = new Map<string, { days: Set<number>; sum: number; n: number }>();
  const examByStudent = new Map<string, { activeIds: Set<string>; sum: number; n: number }>();
  resultsAll.forEach(r => {
    const total = Number(r.total_questions) || 0;
    const pct = (Number(r.score) || 0) / 100;
    if (r.mode === "daily_quiz" && r.quiz_day != null) {
      quizDays.add(Number(r.quiz_day));
      const a = quizByStudent.get(r.student_id) || { days: new Set<number>(), sum: 0, n: 0 };
      a.days.add(Number(r.quiz_day));
      if (total > 0) { a.sum += pct; a.n += 1; }
      quizByStudent.set(r.student_id, a);
    } else if (r.mode === "exam") {
      const a = examByStudent.get(r.student_id) || { activeIds: new Set<string>(), sum: 0, n: 0 };
      if (r.exam_id && activeExamIds.has(r.exam_id)) a.activeIds.add(r.exam_id);
      if (total > 0) { a.sum += pct; a.n += 1; }
      examByStudent.set(r.student_id, a);
    }
  });
  const quizzesTotal = quizDays.size;

  // Chat messages per student
  const sessionsByStudent = new Map<string, string[]>();
  (chatSessRes.data || []).forEach(s => {
    const arr = sessionsByStudent.get(s.user_id) || [];
    arr.push(s.id); sessionsByStudent.set(s.user_id, arr);
  });
  const allSessionIds = Array.from(sessionsByStudent.values()).flat();
  const msgPerSession = new Map<string, number>();
  if (allSessionIds.length > 0) {
    const IN = 500;
    for (let i = 0; i < allSessionIds.length; i += IN) {
      const slice = allSessionIds.slice(i, i + IN);
      const msgs = await fetchAllRange<{ session_id: string }>((from, to) =>
        supabase.from("chat_messages").select("session_id").in("session_id", slice).order("id", { ascending: true }).range(from, to),
      );
      msgs.forEach(m => msgPerSession.set(m.session_id, (msgPerSession.get(m.session_id) || 0) + 1));
    }
  }

  const rows: StudentRow[] = studentIds.map(sid => {
    const prof = profileMap.get(sid) || {};
    const diag = diagByStudent.get(sid);
    const mastery = masteryByStudent.get(sid);
    const band = toBand(mastery?.level);
    const q = quizByStudent.get(sid);
    const e = examByStudent.get(sid);
    const sessions = sessionsByStudent.get(sid) || [];
    const chatMessages = sessions.reduce((acc, id) => acc + (msgPerSession.get(id) || 0), 0);
    const quizzesAttempted = q?.days.size || 0;
    const examsAttempted = e?.activeIds.size || 0;
    const masteryOk = band === "proficient" || band === "expert";
    const quizzesOk = quizzesTotal > 0 && quizzesAttempted >= quizzesTotal;
    const examsOk = examsTotal === 0 || examsAttempted >= examsTotal;
    return {
      id: sid,
      name: prof.name || "Unknown",
      email: prof.email || "",
      roll: prof.roll_number || "",
      enrolledAt: enrolledAt.get(sid) || null,
      diagnosticSubmitted: !!diag,
      diagnosticSubmittedAt: diag?.at || null,
      diagnosticPct: diag?.pct ?? null,
      diagnosticLevel: capitalize(diag?.level ?? null) || null,
      masteryLevel: BAND_LABEL[band],
      masteryBand: band,
      masteryPct: mastery?.score != null ? Math.round(mastery.score * 100) : null,
      quizzesAttempted,
      quizzesTotal,
      quizAvgPct: q && q.n > 0 ? Math.round((q.sum / q.n) * 100) : null,
      examsAttempted,
      examsTotal,
      examAvgPct: e && e.n > 0 ? Math.round((e.sum / e.n) * 100) : null,
      chatMessages,
      completed: masteryOk && quizzesOk && examsOk,
    };
  });

  rows.sort((a, b) => a.name.localeCompare(b.name));
  return rows;
}

const safeFilename = (s: string) => s.replace(/[\\/:*?"<>|]+/g, "_").replace(/\s+/g, "_").slice(0, 80);

export async function exportCourseToExcel(
  course: CourseForSingleExport,
  opts?: { universityId?: string | null; universityName?: string | null },
): Promise<void> {
  const XLSX = await import("xlsx");
  const universityId = opts?.universityId ?? null;
  const universityName = opts?.universityName ?? null;
  const rows = await buildStudentRows(course.id, universityId);

  const wb = XLSX.utils.book_new();

  const bandCount = (b: Band) => rows.filter(r => r.masteryBand === b).length;
  const diagSubmitted = rows.filter(r => r.diagnosticSubmitted).length;
  const completed = rows.filter(r => r.completed).length;
  const quizzesTotal = rows[0]?.quizzesTotal ?? 0;
  const examsTotal = rows[0]?.examsTotal ?? 0;
  const chatMessages = rows.reduce((a, r) => a + r.chatMessages, 0);

  const overview = [{
    Name: course.name,
    "Course Code": course.course_code || "",
    Term: course.term,
    Professor: course.teacher_name,
    "Professor Email": course.teacher_email || "",
    "Enrollment Code": course.enrollment_code,
    Status: course.published ? "Published" : "Draft",
    Enrollment: course.enrollment_open ? "Open" : "Closed",
    "Created At": course.created_at,
    "University Filter": universityName || "All universities",
    Enrolled: rows.length,
    "Diagnostic Submitted": diagSubmitted,
    "Diagnostic Not Submitted": rows.length - diagSubmitted,
    "Mastery Beginner": bandCount("beginner"),
    "Mastery Developing": bandCount("developing"),
    "Mastery Proficient": bandCount("proficient"),
    "Mastery Expert": bandCount("expert"),
    "Mastery Not Started": bandCount("none"),
    "Course Completed": completed,
    "Not Completed": rows.length - completed,
    "Weekly Quizzes Total": quizzesTotal,
    "Exams Total": examsTotal,
    "Chat Messages": chatMessages,
  }];

  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(overview), "Overview");

  const studentsSheet = rows.map(r => ({
    Name: r.name,
    Email: r.email,
    "Roll Number": r.roll,
    "Enrolled At": r.enrolledAt || "",
    "Diagnostic Status": r.diagnosticSubmitted ? "Submitted" : "Not Submitted",
    "Diagnostic Score %": r.diagnosticPct ?? "",
    "Diagnostic Mastery Level": r.diagnosticLevel || "",
    "Final Mastery Level": r.masteryLevel,
    "Final Mastery %": r.masteryPct ?? "",
    "Quizzes Attempted": `${r.quizzesAttempted} / ${r.quizzesTotal}`,
    "Avg Quiz Score %": r.quizAvgPct ?? "",
    "Exams Attempted": `${r.examsAttempted} / ${r.examsTotal}`,
    "Avg Exam Score %": r.examAvgPct ?? "",
    "Chat Messages": r.chatMessages,
    "Course Completed": r.completed ? "Yes" : "No",
  }));
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(studentsSheet), "Students");

  const submitted = rows.filter(r => r.diagnosticSubmitted).map(r => ({
    Name: r.name, Email: r.email,
    "Submitted At": r.diagnosticSubmittedAt || "",
    "Score %": r.diagnosticPct ?? "",
    "Mastery Level": r.diagnosticLevel || "",
  }));
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(submitted.length ? submitted : [{ Name: "—" }]), "Diagnostic - Submitted");

  const notSubmitted = rows.filter(r => !r.diagnosticSubmitted).map(r => ({
    Name: r.name, Email: r.email, "Enrolled At": r.enrolledAt || "",
  }));
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(notSubmitted.length ? notSubmitted : [{ Name: "—" }]), "Diagnostic - Not Submitted");

  const bandsForSheets: Band[] = ["beginner", "developing", "proficient", "expert", "none"];
  bandsForSheets.forEach(b => {
    const list = rows.filter(r => r.masteryBand === b).map(r => ({
      Name: r.name,
      Email: r.email,
      "Mastery %": r.masteryPct ?? "",
      "Quizzes Attempted": `${r.quizzesAttempted} / ${r.quizzesTotal}`,
      "Exams Attempted": `${r.examsAttempted} / ${r.examsTotal}`,
    }));
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.json_to_sheet(list.length ? list : [{ Name: "—" }]),
      `Mastery - ${BAND_LABEL[b]}`.slice(0, 31),
    );
  });

  const completedRows = rows.filter(r => r.completed).map(r => ({
    Name: r.name, Email: r.email,
    "Mastery Level": r.masteryLevel,
    "Quizzes Attempted": `${r.quizzesAttempted} / ${r.quizzesTotal}`,
    "Exams Attempted": `${r.examsAttempted} / ${r.examsTotal}`,
  }));
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(completedRows.length ? completedRows : [{ Name: "—" }]), "Completion - Completed");

  const notCompletedRows = rows.filter(r => !r.completed).map(r => ({
    Name: r.name, Email: r.email,
    "Mastery Level": r.masteryLevel,
    "Quizzes Attempted": `${r.quizzesAttempted} / ${r.quizzesTotal}`,
    "Exams Attempted": `${r.examsAttempted} / ${r.examsTotal}`,
  }));
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(notCompletedRows.length ? notCompletedRows : [{ Name: "—" }]), "Completion - Not Completed");

  const date = new Date().toISOString().slice(0, 10);
  XLSX.writeFile(wb, `${safeFilename(course.name)}-${date}.xlsx`);
}
