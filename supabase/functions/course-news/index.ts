/**
 * course-news
 *
 * Purpose:
 *   Generates a short "What's new" digest of recent, real news articles related
 *   to the concepts covered in a student's enrolled course.
 *
 * Auth / Access:
 *   Bearer token of an enrolled student (enrollment is verified server-side).
 *
 * Inputs:
 *   - course_id: uuid
 *
 * Steps:
 *   1. Authenticate the caller and confirm they are enrolled in the course.
 *   2. Load the course name and its concepts (server-side, never trusted from client).
 *   3. Run a few recency-filtered Firecrawl web searches built from the course
 *      name + a rotating subset of concepts.
 *   4. Ask the Lovable AI Gateway to pick and summarise 4-6 items, tagged with
 *      the closest course concept, as strict JSON.
 *   5. Drop any item whose URL was not in the search results, then return.
 *
 * External calls:
 *   Firecrawl v2 search (direct API), Lovable AI Gateway.
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { loggedGatewayFetch } from "../_shared/ai-log.ts";

const FUNCTION_NAME = "course-news";
const MODEL = "openai/gpt-5.6-sol";
const FIRECRAWL_V2 = "https://api.firecrawl.dev/v2";

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

interface SearchHit {
  url: string;
  title: string;
  description?: string;
  source?: string;
  published_at?: string | null;
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

async function firecrawlSearch(
  apiKey: string,
  query: string,
  limit: number,
): Promise<SearchHit[]> {
  const res = await fetch(`${FIRECRAWL_V2}/search`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query, limit, tbs: "qdr:w" }),
  });
  const json = await res.json().catch(() => null);
  if (!res.ok) {
    const msg = (json as { error?: string } | null)?.error ??
      `Firecrawl search failed (${res.status})`;
    throw new Error(msg);
  }
  const raw = (json as { data?: unknown })?.data;
  const rows: Record<string, unknown>[] = Array.isArray(raw)
    ? raw as Record<string, unknown>[]
    : Array.isArray((raw as { web?: unknown })?.web)
    ? (raw as { web: Record<string, unknown>[] }).web
    : [];
  return rows
    .map((r) => ({
      url: String(r.url ?? ""),
      title: String(r.title ?? ""),
      description: r.description ? String(r.description) : undefined,
      source: hostOf(String(r.url ?? "")),
      published_at: r.date ? String(r.date) : (r.publishedDate ? String(r.publishedDate) : null),
    }))
    .filter((r) => r.url && r.title);
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    const FIRECRAWL_API_KEY = Deno.env.get("FIRECRAWL_API_KEY");
    if (!LOVABLE_API_KEY) return jsonResp({ error: "LOVABLE_API_KEY is not configured" }, 500);
    if (!FIRECRAWL_API_KEY) {
      return jsonResp({ error: "News search is not configured yet. Please try again later." }, 503);
    }

    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) return jsonResp({ error: "Unauthorized" }, 401);
    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData?.user) return jsonResp({ error: "Unauthorized" }, 401);
    const userId = userData.user.id;

    const body = await req.json().catch(() => ({}));
    const courseId: string | undefined = body?.course_id;
    if (!courseId || typeof courseId !== "string" || !/^[0-9a-f-]{36}$/i.test(courseId)) {
      return jsonResp({ error: "course_id is required" }, 400);
    }

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: enrollment } = await admin
      .from("enrollments")
      .select("course_id")
      .eq("student_id", userId)
      .eq("course_id", courseId)
      .maybeSingle();
    if (!enrollment) return jsonResp({ error: "Not enrolled in this course" }, 403);

    const { data: course } = await admin
      .from("courses")
      .select("name")
      .eq("id", courseId)
      .maybeSingle();
    const courseName = (course as { name?: string } | null)?.name ?? "this course";

    const { data: conceptRows } = await admin
      .from("concepts")
      .select("name")
      .eq("course_id", courseId);
    const conceptNames = ((conceptRows ?? []) as { name: string }[])
      .map((c) => c.name)
      .filter(Boolean);

    // Rotate the concept subset so repeat clicks surface different angles.
    const shuffled = [...conceptNames].sort(() => Math.random() - 0.5);
    const picked = shuffled.slice(0, 6);

    const queries: string[] = [`${courseName} news this week`];
    for (const c of picked.slice(0, 3)) queries.push(`${c} news latest developments`);

    const seen = new Set<string>();
    const hits: SearchHit[] = [];
    const results = await Promise.allSettled(
      queries.map((q) => firecrawlSearch(FIRECRAWL_API_KEY, q, 6)),
    );
    let searchError: string | null = null;
    for (const r of results) {
      if (r.status === "fulfilled") {
        for (const h of r.value) {
          if (seen.has(h.url)) continue;
          seen.add(h.url);
          hits.push(h);
        }
      } else {
        searchError = r.reason instanceof Error ? r.reason.message : String(r.reason);
      }
    }

    if (hits.length === 0) {
      return jsonResp(
        { error: searchError ?? "No recent news found for this course right now." },
        502,
      );
    }

    const today = new Date().toISOString().slice(0, 10);
    const sourceList = hits
      .slice(0, 24)
      .map((h, i) =>
        `${i + 1}. TITLE: ${h.title}\n   URL: ${h.url}\n   SNIPPET: ${(h.description ?? "").slice(0, 400)}\n   DATE: ${h.published_at ?? "unknown"}`
      )
      .join("\n");

    const systemPrompt =
      `You curate a short daily "What's new" digest for students taking the course "${courseName}". Today is ${today}.

COURSE CONCEPTS:
${conceptNames.length ? conceptNames.map((c) => `- ${c}`).join("\n") : "- (no concepts listed)"}

You are given real web search results. Select the 4 to 6 most relevant, recent, and genuinely interesting items for a student of this course.

STRICT RULES
- Use ONLY the given search results. Never invent a headline, URL, source, or date.
- Copy each item's URL EXACTLY as given.
- Skip results that are not news/updates or that have nothing to do with the course concepts.
- "concept" must be the course concept the item relates to, copied exactly from the concept list. If no concept fits closely, use the single best general label from the list; if the list is empty, use the course name.
- "summary" is 1-2 short sentences (max 45 words) explaining what happened and why it matters to a student of this course.

OUTPUT
Return strict JSON with one key "items": an array of 4-6 objects each with:
- "headline": string
- "summary": string
- "concept": string
- "url": string (exactly as given)
- "source": string (publication or domain)
- "published_at": string or null (as given)

Output only JSON. No prose, no markdown fences.`;

    const aiRes = await loggedGatewayFetch(
      FUNCTION_NAME,
      { model: MODEL, purpose: "course-news", course_id: courseId },
      "https://ai.gateway.lovable.dev/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: MODEL,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: `SEARCH RESULTS:\n${sourceList}` },
          ],
          response_format: { type: "json_object" },
        }),
      },
    );

    if (aiRes.status === 429) {
      return jsonResp({ error: "Too many requests right now. Please try again in a minute." }, 429);
    }
    if (aiRes.status === 402) {
      return jsonResp({ error: "AI credits are exhausted. Please contact your administrator." }, 402);
    }
    if (!aiRes.ok) {
      const detail = await aiRes.text().catch(() => "");
      console.error("course-news gateway error", aiRes.status, detail.slice(0, 500));
      return jsonResp({ error: "Could not generate news right now." }, 502);
    }

    const aiJson = await aiRes.json();
    const content: string = aiJson?.choices?.[0]?.message?.content ?? "";
    let parsed: { items?: unknown } = {};
    try {
      parsed = JSON.parse(content.replace(/^```json\s*|```$/g, "").trim());
    } catch {
      console.error("course-news: unparsable model output", content.slice(0, 300));
      return jsonResp({ error: "Could not generate news right now." }, 502);
    }

    const allowed = new Map(hits.map((h) => [h.url, h]));
    const items = (Array.isArray(parsed.items) ? parsed.items : [])
      .map((raw) => {
        const o = raw as Record<string, unknown>;
        const url = String(o.url ?? "");
        const hit = allowed.get(url);
        if (!hit) return null;
        return {
          headline: String(o.headline ?? hit.title).slice(0, 200),
          summary: String(o.summary ?? "").slice(0, 400),
          concept: String(o.concept ?? "").slice(0, 120) || courseName,
          url,
          source: String(o.source ?? hit.source ?? hostOf(url)),
          published_at: o.published_at ? String(o.published_at) : (hit.published_at ?? null),
        };
      })
      .filter((x): x is NonNullable<typeof x> => !!x)
      .slice(0, 6);

    if (items.length === 0) {
      return jsonResp({ error: "No relevant news found for your course today." }, 404);
    }

    return jsonResp({ items, generated_at: new Date().toISOString() });
  } catch (e) {
    console.error("course-news failed:", e);
    return jsonResp({ error: e instanceof Error ? e.message : "Unexpected error" }, 500);
  }
});
