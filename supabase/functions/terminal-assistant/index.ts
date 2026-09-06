/**
 * terminal-assistant
 *
 * Purpose:
 *   Socratic coding-help assistant embedded in the freeform practice code
 *   terminal. Sees the student's current code, language, and latest output and
 *   replies with hints and guiding questions — never full solutions.
 *
 * Auth / Access:
 *   Bearer user JWT required. Caller must be an enrolled (non-suspended)
 *   student in the given course, and the course must have coding access
 *   approved (`courses.coding_access_status = 'approved'`).
 *
 * Inputs:
 *   - messages: [{ role: "user" | "assistant", content: string }] (full history)
 *   - courseId: uuid
 *   - codeContext?: { language?, code?, output?, concepts?[] }
 *
 * Steps:
 *   1. Validate auth, enrollment, and coding approval.
 *   2. Build a Socratic system prompt embedding the current code context.
 *   3. Call the Lovable AI Gateway (non-streaming, short replies) and return
 *      the assistant reply as JSON. Message persistence is client-side into
 *      chat_sessions/chat_messages (mode = 'terminal'), matching the existing
 *      chat architecture.
 *
 * External calls:
 *   Lovable AI Gateway (Gemini). Logged via _shared/ai-log.ts.
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { loggedGatewayFetch } from "../_shared/ai-log.ts";

const FUNCTION_NAME = "terminal-assistant";
const MODEL = "google/gemini-2.5-flash-lite";
const MAX_CODE_CHARS = 8000;
const MAX_OUTPUT_CHARS = 4000;
const MAX_MESSAGE_CHARS = 4000;
const MAX_HISTORY = 40;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function jsonResp(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

interface CodeContext {
  language?: string;
  code?: string;
  output?: string;
  concepts?: string[];
}

function buildSystemPrompt(courseName: string, ctx: CodeContext): string {
  const language = (ctx.language || "text").slice(0, 40);
  const code = (ctx.code || "").slice(0, MAX_CODE_CHARS);
  const output = (ctx.output || "").slice(0, MAX_OUTPUT_CHARS);
  const concepts = (ctx.concepts || []).slice(0, 30).join(", ");

  return `You are a Socratic coding tutor embedded in the practice code terminal of the course "${courseName}".

Your ONLY job is to help the student learn to code through hints and guided discovery.

STRICT RULES:
1. NEVER write a complete solution, a corrected full program, or large code blocks. At most, you may show a tiny 1-2 line fragment to illustrate a syntax point.
2. Answer with guiding questions and hints: point to the relevant line or concept, explain what an error message means, and ask what the student thinks should happen.
3. When the student is stuck, break the problem into smaller steps and ask about the first step only.
4. Reference the student's actual code below when replying — be specific about lines and behaviour.
5. If the student asks you to "just give the answer" or to fix their code for them, decline warmly and offer a hint instead.
6. If the student pastes what looks like a graded quiz, exam, or assessment question (multiple-choice prompts, "which of the following", exam instructions), decline: explain that this assistant is only for freeform coding practice, and suggest they use their own knowledge for assessments.
7. Keep replies short (2-6 sentences). Use markdown; wrap inline code in backticks.
${concepts ? `\nConcepts this practice session covers: ${concepts}.` : ""}

--- STUDENT'S CURRENT TERMINAL STATE ---
Language: ${language}
Code in editor:
\`\`\`${language}
${code || "(empty)"}
\`\`\`
Latest output:
\`\`\`
${output || "(program has not been run yet)"}
\`\`\`
--- END TERMINAL STATE ---`;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) {
      return jsonResp({ error: "Missing authorization" }, 401);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData?.user) {
      return jsonResp({ error: "Unauthorized" }, 401);
    }
    const userId = userData.user.id;

    let body: {
      messages?: { role?: string; content?: string }[];
      courseId?: string;
      codeContext?: CodeContext;
    };
    try {
      body = await req.json();
    } catch {
      return jsonResp({ error: "Invalid JSON body" }, 400);
    }

    const courseId = typeof body.courseId === "string" ? body.courseId : "";
    if (!/^[0-9a-f-]{36}$/i.test(courseId)) {
      return jsonResp({ error: "courseId is required" }, 400);
    }

    const rawMessages = Array.isArray(body.messages) ? body.messages : [];
    const messages = rawMessages
      .filter(
        (m) =>
          (m?.role === "user" || m?.role === "assistant") &&
          typeof m?.content === "string" &&
          m.content.trim().length > 0,
      )
      .slice(-MAX_HISTORY)
      .map((m) => ({
        role: m.role as "user" | "assistant",
        content: (m.content as string).slice(0, MAX_MESSAGE_CHARS),
      }));
    if (messages.length === 0 || messages[messages.length - 1].role !== "user") {
      return jsonResp({ error: "messages must end with a user message" }, 400);
    }

    // Enrollment (active, not suspended) + coding approval gate.
    const [enrollRes, courseRes] = await Promise.all([
      userClient
        .from("enrollments")
        .select("id, suspended_at")
        .eq("student_id", userId)
        .eq("course_id", courseId)
        .maybeSingle(),
      userClient
        .from("courses")
        .select("name, coding_access_status")
        .eq("id", courseId)
        .maybeSingle(),
    ]);

    if (enrollRes.error || !enrollRes.data || enrollRes.data.suspended_at) {
      return jsonResp({ error: "Not enrolled in this course" }, 403);
    }
    if (courseRes.error || !courseRes.data) {
      return jsonResp({ error: "Course not found" }, 404);
    }
    if (courseRes.data.coding_access_status !== "approved") {
      return jsonResp({ error: "Coding assistant is not enabled for this course" }, 403);
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      console.error("LOVABLE_API_KEY is not configured");
      return jsonResp({ error: "AI service is not configured" }, 500);
    }

    const systemPrompt = buildSystemPrompt(
      courseRes.data.name ?? "this course",
      body.codeContext ?? {},
    );

    const started = Date.now();
    const response = await loggedGatewayFetch(
      FUNCTION_NAME,
      { model: MODEL, purpose: "terminal_assistant", course_id: courseId },
      "https://ai.gateway.lovable.dev/v1/chat/completions",
      {
        method: "POST",
        signal: AbortSignal.timeout(120_000),
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: MODEL,
          messages: [{ role: "system", content: systemPrompt }, ...messages],
        }),
      },
    );

    if (!response.ok) {
      if (response.status === 429) {
        return jsonResp({ error: "Rate limit exceeded. Please try again in a moment." }, 429);
      }
      if (response.status === 402) {
        return jsonResp({ error: "AI usage limit reached. Please add credits to continue." }, 402);
      }
      const errorText = await response.text().catch(() => "");
      console.error("AI gateway error:", response.status, errorText.slice(0, 300));
      return jsonResp({ error: "AI service unavailable. Please try again." }, 500);
    }

    const data = await response.json().catch(() => null);
    const reply = data?.choices?.[0]?.message?.content?.trim();
    if (!reply) {
      console.error("Empty gateway reply", { ms: Date.now() - started });
      return jsonResp({ error: "AI returned an empty response. Please try again." }, 500);
    }

    return jsonResp({ reply });
  } catch (e) {
    console.error("terminal-assistant error:", e);
    return jsonResp({ error: "Unexpected error. Please try again." }, 500);
  }
});
