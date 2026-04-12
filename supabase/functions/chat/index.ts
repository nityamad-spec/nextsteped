import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// ---------- RAG helpers ----------

async function fetchSyllabusContext(
  supabaseAdmin: ReturnType<typeof createClient>,
  teacherId: string
): Promise<string> {
  try {
    const { data, error } = await supabaseAdmin.storage
      .from("course-materials")
      .download(`${teacherId}/syllabus/approved-syllabus.json`);
    if (error || !data) return "";

    const text = await data.text();
    const syllabus = JSON.parse(text);

    // Extract week titles, topics, and learning outcomes
    const parts: string[] = [];
    if (Array.isArray(syllabus.weeks)) {
      for (const week of syllabus.weeks.slice(0, 16)) {
        let line = `Week ${week.week || ""}: ${week.title || week.topic || ""}`;
        if (week.topics && Array.isArray(week.topics)) {
          line += ` — ${week.topics.join(", ")}`;
        }
        if (week.learningOutcomes && Array.isArray(week.learningOutcomes)) {
          line += ` [Outcomes: ${week.learningOutcomes.join("; ")}]`;
        }
        parts.push(line);
      }
    }
    // Also grab high-level objectives
    if (syllabus.objectives && Array.isArray(syllabus.objectives)) {
      parts.unshift(`Course objectives: ${syllabus.objectives.join("; ")}`);
    }
    if (syllabus.courseName) {
      parts.unshift(`Course: ${syllabus.courseName}`);
    }

    const result = parts.join("\n");
    return result.slice(0, 2000);
  } catch (e) {
    console.error("Syllabus RAG error:", e);
    return "";
  }
}

async function fetchConceptsContext(
  supabaseAdmin: ReturnType<typeof createClient>,
  courseId: string
): Promise<string> {
  try {
    const { data, error } = await supabaseAdmin
      .from("concepts")
      .select("concept_code, weight")
      .eq("course_id", courseId)
      .order("weight", { ascending: false })
      .limit(30);
    if (error || !data || data.length === 0) return "";

    const lines = data.map(
      (c: any) => `${c.concept_code} (weight: ${c.weight})`
    );
    return `Course concepts (by importance): ${lines.join(", ")}`.slice(0, 500);
  } catch (e) {
    console.error("Concepts RAG error:", e);
    return "";
  }
}

async function fetchQuestionBankContext(
  supabaseAdmin: ReturnType<typeof createClient>,
  courseId: string,
  latestMessage: string
): Promise<string> {
  try {
    // Simple keyword approach: fetch a few quiz questions and let the model see them
    const { data, error } = await supabaseAdmin
      .from("assessment_questions")
      .select("question_text, topic, difficulty, question_type")
      .eq("course_id", courseId)
      .eq("mode", "daily_quiz")
      .limit(5);
    if (error || !data || data.length === 0) return "";

    const lines = data.map(
      (q: any) =>
        `[${q.difficulty}/${q.question_type}] ${q.question_text} (Topic: ${q.topic})`
    );
    return `Reference questions the professor uses:\n${lines.join("\n")}`.slice(
      0,
      1000
    );
  } catch (e) {
    console.error("Question bank RAG error:", e);
    return "";
  }
}

async function fetchStudentProgressContext(
  supabaseAdmin: ReturnType<typeof createClient>,
  studentId: string,
  courseId: string
): Promise<string> {
  try {
    const [diagRes, assessRes] = await Promise.all([
      supabaseAdmin
        .from("diagnostic_results")
        .select("learner_level, score, total_questions, answers")
        .eq("student_id", studentId)
        .eq("course_id", courseId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabaseAdmin
        .from("assessment_results")
        .select("mode, score, total_questions, correct_answers, quiz_day")
        .eq("student_id", studentId)
        .eq("course_id", courseId)
        .order("created_at", { ascending: false })
        .limit(5),
    ]);

    const parts: string[] = [];

    if (diagRes.data) {
      const d = diagRes.data;
      parts.push(
        `Diagnostic: Level=${d.learner_level}, Score=${d.score}/${d.total_questions}`
      );
    }

    if (assessRes.data && assessRes.data.length > 0) {
      const summaries = assessRes.data.map(
        (r: any) =>
          `${r.mode}${r.quiz_day ? ` Day${r.quiz_day}` : ""}: ${r.correct_answers}/${r.total_questions} (${r.score}%)`
      );
      parts.push(`Recent assessments: ${summaries.join(", ")}`);
    }

    if (parts.length === 0) return "";
    return `Student progress: ${parts.join(". ")}`.slice(0, 300);
  } catch (e) {
    console.error("Progress RAG error:", e);
    return "";
  }
}

// ---------- Main handler ----------

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const {
      messages,
      mode,
      studySystemPrompt,
      examSystemPrompt,
      relevanceContext,
      courseId,
      teacherId,
      studentId,
    } = await req.json();

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    const defaultStudy = `You are a friendly and knowledgeable AI Teaching Assistant. Your role is to:
- Help students understand course concepts through clear explanations
- Break down complex topics into digestible parts
- Provide examples and analogies to aid understanding
- Encourage students to think critically and explore further
- Use the Socratic method when appropriate — guide rather than just give answers
- Format responses with markdown for readability (headers, bold, lists, code blocks)
Never give direct exam answers. Always explain the "why" behind concepts.

IMPORTANT — PRACTICE QUESTIONS FORMAT:
When a student asks for practice questions, quiz questions, or wants to test themselves, generate the questions in a structured JSON block so they can be rendered interactively. Wrap the JSON in a fenced code block with the language tag "practice-questions". The JSON must be an array of question objects.

Each question object must have these fields:
- "question": the question text
- "type": one of "mcq", "true_false", "short_answer", or "code"
- "options": array of strings (required for mcq, omit for others)
- "answer": the correct answer (for mcq, must match one of the options exactly)
- "explanation": a brief explanation of why the answer is correct
- "topic": the topic area

Example format:
\`\`\`practice-questions
[
  {"question": "What is 2+2?", "type": "mcq", "options": ["3", "4", "5", "6"], "answer": "4", "explanation": "Basic addition.", "topic": "Math"},
  {"question": "Python is a compiled language.", "type": "true_false", "answer": "False", "explanation": "Python is interpreted.", "topic": "Basics"}
]
\`\`\`

Generate 3-5 questions by default unless the student specifies a number. Always present ALL questions at once in a single JSON block. You may add a brief intro sentence before the block and encouragement after, but the questions themselves MUST be in the JSON block.`;

    const defaultExam = `You are an AI Teaching Assistant in Exam Prep mode. Help the student prepare for exams by:
- Asking practice questions related to their course material
- Providing explanations only after the student attempts an answer
- Giving constructive feedback on their responses
- Adjusting difficulty based on their performance
- Encouraging critical thinking rather than memorization
Keep responses focused and exam-relevant. Use markdown formatting.`;

    const defaultTeacher = `You are a Course Assistant for university professors. Your primary role is to help professors build, refine, and improve their courses. You should:
- Help professors think through what concepts, exercises, or activities to add to their lesson plan
- Suggest new topics, case studies, and real-world examples relevant to their course
- Help evaluate and refine AI-generated suggestions from the lesson plan (e.g. if a professor is unsure about a suggestion, help them decide)
- Brainstorm assessment questions, rubrics, and learning outcomes
- Advise on course pacing, sequencing, and content organization
- Suggest ways to make lectures more engaging with active learning techniques
- Help professors address doubts about their course structure or content choices
- Provide pedagogical best practices grounded in evidence-based teaching
You are collaborative, practical, and focused on helping the professor make their course the best it can be. Format responses with markdown for readability (headers, bold, lists).`;

    let systemPrompt =
      mode === "teacher"
        ? defaultTeacher
        : mode === "exam"
          ? examSystemPrompt || defaultExam
          : studySystemPrompt || defaultStudy;

    // If the question was classified as off-topic, prepend a relating instruction
    if (
      relevanceContext &&
      relevanceContext.relevant === false &&
      relevanceContext.courseName
    ) {
      const conceptsList = relevanceContext.concepts?.length
        ? ` Key course concepts include: ${relevanceContext.concepts.join(", ")}.`
        : "";
      systemPrompt = `${systemPrompt}\n\nIMPORTANT: The student's question is not directly about ${relevanceContext.courseName}.${conceptsList} Before answering, briefly and naturally connect their question to a real-world application of the course material. Then answer helpfully through that lens. Do not refuse to answer — always be helpful, but draw the connection first.`;
    }

    // ---- RAG: Retrieve course context ----
    let ragContext = "";
    if (courseId && teacherId && (studentId || mode === "teacher")) {
      const supabaseUrl = Deno.env.get("SUPABASE_URL");
      const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

      if (supabaseUrl && serviceRoleKey) {
        const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

        const latestUserMessage =
          messages?.[messages.length - 1]?.content || "";

        const ragPromises: Promise<string>[] = [
            fetchSyllabusContext(supabaseAdmin, teacherId),
            fetchConceptsContext(supabaseAdmin, courseId),
            fetchQuestionBankContext(supabaseAdmin, courseId, latestUserMessage),
        ];
        if (studentId && mode !== "teacher") {
          ragPromises.push(fetchStudentProgressContext(supabaseAdmin, studentId, courseId));
        }
        const [syllabusCtx, conceptsCtx, questionsCtx, progressCtx] =
          await Promise.all(ragPromises);

        const parts = [syllabusCtx, conceptsCtx, questionsCtx, progressCtx].filter(Boolean);
        if (parts.length > 0) {
          ragContext = `\n\n--- COURSE CONTEXT (use this to ground your answers) ---\n${parts.join("\n\n")}\n--- END COURSE CONTEXT ---`;
        }
      }
    }

    const fullSystemPrompt = systemPrompt + ragContext;

    const response = await fetch(
      "https://ai.gateway.lovable.dev/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash-lite",
          messages: [
            { role: "system", content: fullSystemPrompt },
            ...messages,
          ],
          stream: true,
        }),
      }
    );

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(
          JSON.stringify({
            error: "Rate limit exceeded. Please try again in a moment.",
          }),
          {
            status: 429,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({
            error: "AI usage limit reached. Please add credits to continue.",
          }),
          {
            status: 402,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }
      const errorText = await response.text();
      console.error("AI gateway error:", response.status, errorText);
      return new Response(
        JSON.stringify({ error: "AI service unavailable. Please try again." }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    return new Response(response.body, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
    });
  } catch (e) {
    console.error("Chat function error:", e);
    return new Response(
      JSON.stringify({
        error: e instanceof Error ? e.message : "Unknown error",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
