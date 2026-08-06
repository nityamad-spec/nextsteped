// Integration tests for update-mastery: calls the deployed edge function and
// verifies the rows written to student_concept_mastery and student_course_mastery.
//
// Requires env (auto-injected by `supabase functions test` / Lovable test runner):
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_ANON_KEY
// If any are missing the suite skips (so unit-only runs still pass).

import "https://deno.land/std@0.224.0/dotenv/load.ts";
import {
  assertEquals,
  assertAlmostEquals,
  assert,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const SUPABASE_URL =
  Deno.env.get("SUPABASE_URL") ?? Deno.env.get("VITE_SUPABASE_URL");
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const ANON_KEY =
  Deno.env.get("SUPABASE_ANON_KEY") ??
  Deno.env.get("VITE_SUPABASE_PUBLISHABLE_KEY");

const haveEnv = Boolean(SUPABASE_URL && SERVICE_KEY && ANON_KEY);
const FN_URL = `${SUPABASE_URL}/functions/v1/update-mastery`;

// Helper: skip-gate wrapper so the file is safe to run without env.
function itest(name: string, fn: () => Promise<void>) {
  Deno.test({
    name,
    ignore: !haveEnv,
    fn,
    sanitizeOps: false,
    sanitizeResources: false,
  });
}

// ---------- Fixture helpers ----------

type Fixture = {
  teacherId: string;
  studentId: string;
  studentEmail: string;
  courseId: string;
  conceptA: string; // uuid
  conceptB: string; // uuid
  codeA: string;
  codeB: string;
  jwt: string;
};

const admin = haveEnv ? createClient(SUPABASE_URL!, SERVICE_KEY!) : null;

async function createFixture(): Promise<Fixture> {
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const teacherEmail = `teacher-${stamp}@test.local`;
  const studentEmail = `student-${stamp}@test.local`;
  const password = "Passw0rd!Test";

  // 1. Create teacher and student auth users (email-confirmed).
  const { data: t, error: tErr } = await admin!.auth.admin.createUser({
    email: teacherEmail, password, email_confirm: true,
    user_metadata: { full_name: "T", role: "teacher" },
  });
  if (tErr) throw tErr;
  const teacherId = t.user!.id;

  const { data: s, error: sErr } = await admin!.auth.admin.createUser({
    email: studentEmail, password, email_confirm: true,
    user_metadata: { full_name: "S", role: "student" },
  });
  if (sErr) throw sErr;
  const studentId = s.user!.id;

  // Ensure profile rows (some installs auto-create; upsert to be safe).
  await admin!.from("profiles").upsert(
    [
      { id: teacherId, email: teacherEmail, name: "T", role: "teacher" },
      { id: studentId, email: studentEmail, name: "S", role: "student" },
    ],
    { onConflict: "id" },
  );

  // 2. Create a course owned by the teacher.
  const { data: course, error: cErr } = await admin!
    .from("courses")
    .insert({
      teacher_id: teacherId,
      name: `IT Mastery ${stamp}`,
      term: "First Semester",
      enrollment_code: `EC${stamp.slice(-8).toUpperCase()}`,
      course_code: `IT${stamp.slice(-6).toUpperCase()}`,
    })
    .select("id")
    .single();
  if (cErr) throw cErr;
  const courseId = course.id as string;

  // 3. Enroll the student.
  await admin!
    .from("enrollments")
    .insert({ student_id: studentId, course_id: courseId });

  // 4. Two concepts with equal weight.
  const codeA = `c_a_${stamp}`;
  const codeB = `c_b_${stamp}`;
  const { data: concepts, error: kErr } = await admin!
    .from("concepts")
    .insert([
      { course_id: courseId, concept_code: codeA, weight: 0.5 },
      { course_id: courseId, concept_code: codeB, weight: 0.5 },
    ])
    .select("id, concept_code");
  if (kErr) throw kErr;
  const conceptA = concepts!.find((c) => c.concept_code === codeA)!.id as string;
  const conceptB = concepts!.find((c) => c.concept_code === codeB)!.id as string;

  // 5. Get a student JWT.
  const userClient = createClient(SUPABASE_URL!, ANON_KEY!);
  const { data: signIn, error: signErr } = await userClient.auth.signInWithPassword({
    email: studentEmail, password,
  });
  if (signErr) throw signErr;
  const jwt = signIn.session!.access_token;

  return { teacherId, studentId, studentEmail, courseId, conceptA, conceptB, codeA, codeB, jwt };
}

async function destroyFixture(f: Fixture) {
  // Cascade through child tables we may have written.
  await admin!.from("student_concept_mastery").delete().eq("student_id", f.studentId);
  await admin!.from("student_course_mastery").delete().eq("student_id", f.studentId);
  await admin!.from("enrollments").delete().eq("student_id", f.studentId);
  await admin!.from("concepts").delete().eq("course_id", f.courseId);
  await admin!.from("courses").delete().eq("id", f.courseId);
  await admin!.from("profiles").delete().in("id", [f.teacherId, f.studentId]);
  await admin!.auth.admin.deleteUser(f.studentId).catch(() => {});
  await admin!.auth.admin.deleteUser(f.teacherId).catch(() => {});
}

async function callFn(jwt: string, body: Record<string, unknown>) {
  const res = await fetch(FN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${jwt}`,
      "apikey": ANON_KEY!,
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let json: any = null;
  try { json = JSON.parse(text); } catch { /* keep text */ }
  return { status: res.status, json, text };
}

async function readConcept(studentId: string, courseId: string, conceptId: string) {
  const { data, error } = await admin!
    .from("student_concept_mastery")
    .select("mastery_score, mastery_level, questions_attempted, questions_correct, sample_count, last_source")
    .eq("student_id", studentId)
    .eq("course_id", courseId)
    .eq("concept_id", conceptId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

async function readCourse(studentId: string, courseId: string) {
  const { data, error } = await admin!
    .from("student_course_mastery")
    .select("mastery_score, learner_level, last_source, sample_count")
    .eq("student_id", studentId)
    .eq("course_id", courseId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

// ---------- Tests ----------

itest("e2e: 401 without auth", async () => {
  const res = await fetch(FN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", "apikey": ANON_KEY! },
    body: JSON.stringify({ course_id: crypto.randomUUID(), source: "weekly_quiz", per_concept: [] }),
  });
  await res.text();
  assertEquals(res.status, 401);
});

itest("e2e: 400 on invalid body", async () => {
  const f = await createFixture();
  try {
    const r = await callFn(f.jwt, { course_id: f.courseId, source: "weekly_quiz" });
    assertEquals(r.status, 400);
  } finally {
    await destroyFixture(f);
  }
});

itest("e2e weekly_quiz: first perfect quiz writes Developing-capped concept row", async () => {
  const f = await createFixture();
  try {
    const per_question = Array.from({ length: 5 }, () => ({
      concept_code: f.codeA, difficulty: 0.5, bloom: 2, is_correct: true,
    }));
    const r = await callFn(f.jwt, {
      course_id: f.courseId, source: "weekly_quiz", source_id: null, per_question,
    });
    assertEquals(r.status, 200);
    assertEquals(r.json.concepts_updated, 1);

    const row = await readConcept(f.studentId, f.courseId, f.conceptA);
    assert(row, "concept row not written");
    assertEquals(row!.questions_attempted, 5);
    assertEquals(row!.questions_correct, 5);
    assertEquals(row!.sample_count, 1);
    assertEquals(row!.last_source, "weekly_quiz");
    // Shrinkage: 5/(5+8)*1 + 8/13*0.5 = 0.6923
    assertAlmostEquals(Number(row!.mastery_score), 0.6923, 1e-3);
    // Evidence cap: <8 attempted → developing even though score band == proficient
    assertEquals(row!.mastery_level, "developing");

    // Course row should also exist; concept B has no row so it counts as 0,
    // and the course score = 0.6923 * 0.5 / (0.5 + 0.5) = 0.3462.
    const course = await readCourse(f.studentId, f.courseId);
    assert(course, "course row not written");
    assertEquals(course!.last_source, "weekly_quiz");
    assertAlmostEquals(Number(course!.mastery_score), 0.3462, 1e-3);
  } finally {
    await destroyFixture(f);
  }
});

itest("e2e exam: enough evidence promotes concept to Expert and course follows", async () => {
  const f = await createFixture();
  try {
    // 4 perfect exams × 10 questions on EACH concept → n=40 per concept,
    // samples=4, score → ~0.90 after shrinkage+EMA, and the course weighted
    // average covers the full concept weight so it can reach Expert too.
    for (let i = 0; i < 4; i++) {
      const per_question = [
        ...Array.from({ length: 10 }, () => ({
          concept_code: f.codeA, difficulty: 0.7, bloom: 3, is_correct: true,
        })),
        ...Array.from({ length: 10 }, () => ({
          concept_code: f.codeB, difficulty: 0.7, bloom: 3, is_correct: true,
        })),
      ];
      const r = await callFn(f.jwt, {
        course_id: f.courseId, source: "exam", source_id: crypto.randomUUID(), per_question,
      });
      assertEquals(r.status, 200);
    }
    const row = await readConcept(f.studentId, f.courseId, f.conceptA);
    assert(row);
    assertEquals(row!.sample_count, 4);
    assertEquals(row!.questions_attempted, 40);
    assertEquals(row!.mastery_level, "expert");
    assert(Number(row!.mastery_score) >= 0.75, `score ${row!.mastery_score} should be >= 0.75`);

    const course = await readCourse(f.studentId, f.courseId);
    assertEquals(course!.learner_level, "expert");
  } finally {
    await destroyFixture(f);
  }
});

itest("e2e practice-only: perfect practice cannot promote course past Proficient", async () => {
  const f = await createFixture();
  try {
    // 4 perfect practice rounds on BOTH concepts so weighted course score → high.
    for (let i = 0; i < 4; i++) {
      const per_question = [
        ...Array.from({ length: 10 }, () => ({
          concept_code: f.codeA, difficulty: 0.7, bloom: 3, is_correct: true,
        })),
        ...Array.from({ length: 10 }, () => ({
          concept_code: f.codeB, difficulty: 0.7, bloom: 3, is_correct: true,
        })),
      ];
      const r = await callFn(f.jwt, {
        course_id: f.courseId, source: "practice", source_id: crypto.randomUUID(), per_question,
      });
      assertEquals(r.status, 200);
    }
    const course = await readCourse(f.studentId, f.courseId);
    assert(course, "course row not written");
    // Numeric score may be very high, but the practice-only gate must keep level <= proficient.
    assertEquals(course!.learner_level, "proficient");
  } finally {
    await destroyFixture(f);
  }
});

itest("e2e source weighting: exam shifts prior more than practice for same signal", async () => {
  const f = await createFixture();
  try {
    // Seed concept A with a low prior using a weekly_quiz of all-wrong answers.
    await callFn(f.jwt, {
      course_id: f.courseId, source: "weekly_quiz", source_id: null,
      per_question: Array.from({ length: 10 }, () => ({
        concept_code: f.codeA, difficulty: 0.5, bloom: 2, is_correct: false,
      })),
    });
    const before = await readConcept(f.studentId, f.courseId, f.conceptA);
    assert(before);
    const priorScore = Number(before!.mastery_score);

    // Apply a perfect practice round on A and read the delta.
    await callFn(f.jwt, {
      course_id: f.courseId, source: "practice", source_id: crypto.randomUUID(),
      per_question: Array.from({ length: 5 }, () => ({
        concept_code: f.codeA, difficulty: 0.5, bloom: 2, is_correct: true,
      })),
    });
    const afterPractice = Number(
      (await readConcept(f.studentId, f.courseId, f.conceptA))!.mastery_score,
    );
    const practiceDelta = afterPractice - priorScore;

    // Reset by destroying and recreating fixture for a clean exam comparison.
    await destroyFixture(f);
    const g = await createFixture();
    try {
      await callFn(g.jwt, {
        course_id: g.courseId, source: "weekly_quiz", source_id: null,
        per_question: Array.from({ length: 10 }, () => ({
          concept_code: g.codeA, difficulty: 0.5, bloom: 2, is_correct: false,
        })),
      });
      const seed = await readConcept(g.studentId, g.courseId, g.conceptA);
      const seedScore = Number(seed!.mastery_score);
      await callFn(g.jwt, {
        course_id: g.courseId, source: "exam", source_id: crypto.randomUUID(),
        per_question: Array.from({ length: 5 }, () => ({
          concept_code: g.codeA, difficulty: 0.5, bloom: 2, is_correct: true,
        })),
      });
      const afterExam = Number(
        (await readConcept(g.studentId, g.courseId, g.conceptA))!.mastery_score,
      );
      const examDelta = afterExam - seedScore;

      assert(
        examDelta > practiceDelta,
        `exam delta ${examDelta} should exceed practice delta ${practiceDelta}`,
      );
    } finally {
      await destroyFixture(g);
    }
  } catch (e) {
    // If first half cleaned up but threw before the second created, swallow only after rethrow.
    throw e;
  }
});
