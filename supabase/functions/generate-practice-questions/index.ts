import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const clamp01 = (n: unknown): number => {
  const x = typeof n === "number" ? n : parseFloat(String(n));
  if (!isFinite(x)) return 0.5;
  return Math.min(1, Math.max(0, x));
};
const clampBloom = (n: unknown): number => {
  const x = typeof n === "number" ? n : parseFloat(String(n));
  if (!isFinite(x)) return 3;
  return Math.min(6, Math.max(1, Math.round(x)));
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const SYSTEM_PROMPT = `You are a practice question generator for a university course. Generate practice questions based on the student's request.

IMPORTANT RULES:
- If the student doesn't specify a number of questions, generate exactly the requested COUNT.
- If the student doesn't specify topics/concepts, generate questions based on the course concepts provided.
- If the student mentions weak points or areas they struggle with, focus on those topics.
- ONLY generate Multiple Choice (mcq) and True/False (true_false) questions. Do NOT generate short answer, fill-in-the-blank, or code questions.
- Mix mcq and true_false naturally; favor mcq unless the concept is binary.
- Make questions progressively challenging.

For each question, also rate:
- "difficulty_estimate": a number from 0 to 1 (e.g. 0.2 = easy recall, 0.5 = applying concepts, 0.85 = analysis / tricky distractors).
- "bloom_level": an integer 1-6 on Bloom's taxonomy (1 Remember, 2 Understand, 3 Apply, 4 Analyze, 5 Evaluate, 6 Create). Most practice items land at 2-4.

Return ONLY a JSON object of the form {"questions": [...]}. Each question object must have:
- "question": the question text
- "type": "mcq" or "true_false"
- "options": array of 4 strings (required for mcq, omit for true_false)
- "answer": the correct answer (for mcq, must match one option exactly; for true_false, must be "True" or "False")
- "explanation": a clear explanation of why the answer is correct
- "topic": the topic area (use the course concept code/name when possible)
- "difficulty_estimate": number 0..1
- "bloom_level": integer 1..6`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!LOVABLE_API_KEY || !SUPABASE_URL || !SERVICE_ROLE) {
      return json({ error: "Server misconfigured" }, 500);
    }

    // Auth: derive student from JWT
    const authHeader = req.headers.get("Authorization") || "";
    const token = authHeader.replace(/^Bearer\s+/i, "");
    if (!token) return json({ error: "Unauthorized" }, 401);

    const supabaseAuth = createClient(SUPABASE_URL, SERVICE_ROLE);
    const { data: userData, error: userErr } = await supabaseAuth.auth.getUser(token);
    if (userErr || !userData?.user) return json({ error: "Unauthorized" }, 401);
    const studentId = userData.user.id;

    // Validate body
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") return json({ error: "Invalid body" }, 400);
    const rawPrompt = String((body as any).prompt ?? "").replace(/[\x00-\x1F\x7F]/g, "").trim();
    const courseId = String((body as any).courseId ?? "").trim();
    const countRaw = Number((body as any).count ?? 5);
    const count = Math.min(10, Math.max(1, Math.round(isFinite(countRaw) ? countRaw : 5)));
    if (!rawPrompt || rawPrompt.length > 1000) return json({ error: "Prompt must be 1..1000 chars" }, 400);
    if (!UUID_RE.test(courseId)) return json({ error: "Invalid courseId" }, 400);

    const admin = supabaseAuth;

    // Enrollment check
    const { data: enrollment, error: enrollErr } = await admin
      .from("enrollments")
      .select("id")
      .eq("student_id", studentId)
      .eq("course_id", courseId)
      .maybeSingle();
    if (enrollErr || !enrollment) return json({ error: "Not enrolled in course" }, 403);

    // Pull concept context
    const { data: concepts } = await admin
      .from("concepts")
      .select("concept_code, weight")
      .eq("course_id", courseId)
      .order("weight", { ascending: false })
      .limit(30);
    const conceptsLine = (concepts ?? [])
      .map((c: any) => `${c.concept_code} (w=${c.weight})`)
      .join(", ");

    // Recent performance (optional grounding)
    const { data: recent } = await admin
      .from("assessment_results")
      .select("mode, score, total_questions, correct_answers")
      .eq("student_id", studentId)
      .eq("course_id", courseId)
      .order("created_at", { ascending: false })
      .limit(5);
    const recentLine = (recent ?? [])
      .map((r: any) => `${r.mode}:${r.correct_answers}/${r.total_questions}(${r.score}%)`)
      .join(", ");

    const contextParts: string[] = [`COUNT: ${count}`];
    if (conceptsLine) contextParts.push(`Course concepts (by importance): ${conceptsLine}`);
    if (recentLine) contextParts.push(`Recent assessments: ${recentLine}`);
    const courseContext = `\n\n--- COURSE CONTEXT ---\n${contextParts.join("\n")}\n--- END CONTEXT ---`;

    const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash-lite",
        messages: [
          { role: "system", content: SYSTEM_PROMPT + courseContext },
          { role: "user", content: rawPrompt },
        ],
        response_format: { type: "json_object" },
      }),
    });

    if (!aiResp.ok) {
      if (aiResp.status === 429) return json({ error: "Rate limit exceeded. Please try again in a moment." }, 429);
      if (aiResp.status === 402) return json({ error: "AI usage limit reached. Please add credits to continue." }, 402);
      const txt = await aiResp.text();
      console.error("AI gateway error:", aiResp.status, txt);
      return json({ error: "AI service unavailable. Please try again." }, 502);
    }

    const aiJson = await aiResp.json();
    const content: string = aiJson?.choices?.[0]?.message?.content ?? "";

    let parsedObj: any;
    try {
      parsedObj = JSON.parse(content);
    } catch {
      const match = content.match(/\{[\s\S]*\}/);
      if (!match) {
        console.error("Failed to parse AI JSON:", content.slice(0, 500));
        return json({ error: "Failed to generate questions" }, 502);
      }
      parsedObj = JSON.parse(match[0]);
    }
    const arr = Array.isArray(parsedObj) ? parsedObj : parsedObj?.questions;
    if (!Array.isArray(arr)) return json({ error: "Failed to generate questions" }, 502);

    const sanitized = arr
      .filter((q: any) => q && (q.type === "mcq" || q.type === "true_false"))
      .map((q: any, i: number) => {
        const type = q.type as "mcq" | "true_false";
        let options: string[] | undefined;
        let answer = String(q.answer ?? "");
        if (type === "mcq") {
          options = Array.isArray(q.options) ? q.options.map(String) : [];
          if (!options.includes(answer) && options.length > 0) answer = options[0];
        } else {
          answer = /^t/i.test(answer) ? "True" : "False";
        }
        return {
          id: `pq-${Date.now()}-${i}`,
          question: String(q.question ?? ""),
          type,
          options,
          answer,
          explanation: String(q.explanation ?? ""),
          topic: String(q.topic ?? ""),
          difficulty_estimate: clamp01(q.difficulty_estimate),
          bloom_level: clampBloom(q.bloom_level),
        };
      })
      .filter((q: any) => q.question && q.answer && (q.type === "true_false" || (q.options && q.options.length >= 2)));

    if (sanitized.length === 0) return json({ error: "No valid questions generated" }, 502);

    return json({ questions: sanitized });
  } catch (e) {
    console.error("generate-practice-questions error:", e);
    return json({ error: e instanceof Error ? e.message : "Unknown error" }, 500);
  }
});
