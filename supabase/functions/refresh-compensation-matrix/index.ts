/**
 * refresh-compensation-matrix
 *
 * Admin-triggered refresh of the fresh-grad compensation matrix (India, LPA).
 * Researches public salary pages with Firecrawl (Levels.fyi, Glassdoor,
 * AmbitionBox, Ambitionbox-like aggregators), hands the findings to the model,
 * validates every returned cell, and writes the ones that pass.
 *
 * Cells flagged is_manual are never overwritten.
 *
 * Auth:   Bearer token of an admin.
 * Input:  {} (optional { role_ids: uuid[] } to limit the refresh)
 * Output: { updated: number, skipped: number, sources: string[], run_id }
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { loggedGatewayFetch } from "../_shared/ai-log.ts";

const FUNCTION_NAME = "refresh-compensation-matrix";
const MODEL = "openai/gpt-6-astra";
const FIRECRAWL_V2 = "https://api.firecrawl.dev/v2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const MAX_LPA = 150;

interface CellOut {
  role: string;
  tier: string;
  not_typical: boolean;
  low_lpa: number | null;
  high_lpa: number | null;
  base_note: string | null;
  bonus_note: string | null;
  equity_note: string | null;
  note: string | null;
}

function schema(roleTitles: string[], tierKeys: string[]) {
  return {
    type: "object",
    additionalProperties: false,
    required: ["cells", "sources"],
    properties: {
      cells: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: [
            "role",
            "tier",
            "not_typical",
            "low_lpa",
            "high_lpa",
            "base_note",
            "bonus_note",
            "equity_note",
            "note",
          ],
          properties: {
            role: { type: "string", enum: roleTitles },
            tier: { type: "string", enum: tierKeys },
            not_typical: { type: "boolean" },
            low_lpa: { type: ["number", "null"] },
            high_lpa: { type: ["number", "null"] },
            base_note: { type: ["string", "null"] },
            bonus_note: { type: ["string", "null"] },
            equity_note: { type: ["string", "null"] },
            note: { type: ["string", "null"] },
          },
        },
      },
      sources: { type: "array", items: { type: "string" } },
    },
  };
}

async function firecrawlSearch(apiKey: string, query: string): Promise<string> {
  const res = await fetch(`${FIRECRAWL_V2}/search`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      query,
      limit: 4,
      lang: "en",
      country: "in",
      tbs: "qdr:y",
      scrapeOptions: { formats: ["markdown"] },
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    console.error(`[${FUNCTION_NAME}] firecrawl ${res.status}: ${body.slice(0, 300)}`);
    throw new Error(`Search failed (HTTP ${res.status})`);
  }
  const json = await res.json();
  const results = Array.isArray(json?.data) ? json.data : Array.isArray(json?.web) ? json.web : [];
  return results
    .map((r: any) => {
      const text = typeof r?.markdown === "string" ? r.markdown : (r?.description ?? "");
      return `SOURCE: ${r?.title ?? ""} (${r?.url ?? ""})\n${String(text).slice(0, 4000)}`;
    })
    .join("\n\n---\n\n");
}

async function run(req: Request): Promise<{ status: number; payload: unknown }> {
  const lovableKey = Deno.env.get("LOVABLE_API_KEY");
  if (!lovableKey) throw new Error("LOVABLE_API_KEY not configured");
  const firecrawlKey = Deno.env.get("FIRECRAWL_API_KEY");
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) {
    return { status: 401, payload: { error: "Not authenticated" } };
  }
  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: claimsData, error: claimsErr } = await userClient.auth.getClaims(
    authHeader.slice("Bearer ".length),
  );
  if (claimsErr || !claimsData?.claims?.sub) {
    return { status: 401, payload: { error: "Not authenticated" } };
  }
  const userId = claimsData.claims.sub as string;

  const admin = createClient(supabaseUrl, serviceKey);
  const { data: prof } = await admin.from("profiles").select("role").eq("id", userId).maybeSingle();
  if (prof?.role !== "admin") return { status: 403, payload: { error: "Admins only" } };

  if (!firecrawlKey) {
    return {
      status: 400,
      payload: {
        error:
          "Web research isn't connected yet. Connect Firecrawl in the project's connectors, then refresh again. You can still edit any figure by hand.",
      },
    };
  }

  // Rate limit: at most 4 runs in the last 24h.
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { count: recentRuns } = await admin
    .from("comp_refresh_runs")
    .select("id", { count: "exact", head: true })
    .gte("started_at", since);
  if ((recentRuns ?? 0) >= 4) {
    return { status: 429, payload: { error: "Refresh limit reached for today. Try again tomorrow." } };
  }

  const [{ data: roles }, { data: tiers }, { data: cells }] = await Promise.all([
    admin.from("comp_roles").select("*").eq("active", true).order("position"),
    admin.from("comp_tiers").select("*").order("position"),
    admin.from("comp_cells").select("*"),
  ]);
  if (!roles?.length || !tiers?.length) {
    return { status: 400, payload: { error: "Add at least one role and one tier first." } };
  }

  const { data: runRow } = await admin
    .from("comp_refresh_runs")
    .insert({
      status: "running",
      model: MODEL,
      created_by: userId,
      snapshot: cells ?? [],
    })
    .select("id")
    .maybeSingle();
  const runId = runRow?.id ?? null;

  const fail = async (message: string, status: number) => {
    if (runId) {
      await admin
        .from("comp_refresh_runs")
        .update({ status: "failed", message, finished_at: new Date().toISOString() })
        .eq("id", runId);
    }
    return { status, payload: { error: message } };
  };

  // 1. Research — one search per role, bounded.
  const research: string[] = [];
  const sources = new Set<string>();
  for (const role of roles.slice(0, 8)) {
    const query = `${role.title} fresher salary India LPA 2026 levels.fyi OR glassdoor OR ambitionbox product companies startups`;
    try {
      const text = await firecrawlSearch(firecrawlKey, query);
      if (text) {
        research.push(`### ${role.title}\n${text}`);
        for (const m of text.matchAll(/\((https?:\/\/[^)\s]+)\)/g)) sources.add(m[1]);
      }
    } catch (e) {
      console.error(`[${FUNCTION_NAME}] research failed for ${role.title}`, e);
    }
  }
  if (research.length === 0) {
    return await fail("Could not read any salary sources right now. Try again shortly.", 502);
  }

  // 2. Model pass.
  const roleTitles = roles.map((r: any) => r.title);
  const tierKeys = tiers.map((t: any) => t.key);
  const tierDesc = tiers
    .map((t: any) => `${t.key} = ${t.label} (${t.examples ?? "—"})`)
    .join("; ");

  const instructions = [
    "You compile fresh-graduate (0-1 year experience) compensation guardrails for engineering and data roles in India.",
    "All figures are total annual compensation in LPA (lakhs per annum, INR).",
    "Use only the research provided plus well-established market knowledge; do not invent outliers.",
    "Return one cell for EVERY role x tier combination.",
    "low_lpa and high_lpa describe the typical middle of the market, not extreme outliers: high_lpa must be greater than low_lpa, both between 3 and 120, and the spread should be realistic (roughly 1.3x to 2.2x).",
    "Tier-1 cash is normally the highest; startups may match or exceed it only through equity — reflect that in equity_note.",
    "If a role is genuinely not hired at fresh-grad level in a tier, set not_typical true and all numbers null, with a one-line note explaining why.",
    "base_note, bonus_note and equity_note are short phrases (under 60 characters) describing the split.",
    "note is one sentence on what pushes a candidate to the top of the range.",
    "sources: the domains or page titles you relied on.",
  ].join("\n");

  const input = `ROLES: ${roleTitles.join(", ")}
TIERS: ${tierDesc}

RESEARCH:
${research.join("\n\n").slice(0, 60000)}`;

  const resp = await loggedGatewayFetch(
    FUNCTION_NAME,
    { model: MODEL, purpose: "compensation-matrix-refresh", attempt: 1, total_attempts: 1 },
    "https://ai.gateway.lovable.dev/v1/responses",
    {
      method: "POST",
      headers: { Authorization: `Bearer ${lovableKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: MODEL,
        instructions,
        input,
        stream: false,
        store: false,
        reasoning: { effort: "low" },
        max_output_tokens: 12000,
        text: {
          format: {
            type: "json_schema",
            name: "compensation_matrix",
            strict: true,
            schema: schema(roleTitles, tierKeys),
          },
        },
      }),
    },
  );

  if (!resp.ok) {
    const status = resp.status;
    const errText = await resp.text().catch(() => "");
    console.error(`[${FUNCTION_NAME}] gateway ${status}:`, errText.slice(0, 400));
    let msg = `AI gateway error (HTTP ${status}).`;
    if (status === 429) msg = "Rate limited by the AI service. Try again shortly.";
    else if (status === 402) msg = "AI credits exhausted. Add credits in workspace settings.";
    return await fail(msg, status === 429 || status === 402 ? status : 502);
  }

  const json = await resp.json();
  let text: string = typeof json?.output_text === "string" ? json.output_text : "";
  if (!text && Array.isArray(json?.output)) {
    for (const item of json.output) {
      for (const c of item?.content ?? []) if (typeof c?.text === "string") text += c.text;
    }
  }
  let parsed: { cells: CellOut[]; sources: string[] };
  try {
    parsed = JSON.parse(text);
  } catch {
    return await fail("The AI returned an unreadable result. Try again.", 502);
  }

  // 3. Validate + write.
  const roleByTitle = new Map(roles.map((r: any) => [r.title, r]));
  const tierByKey = new Map(tiers.map((t: any) => [t.key, t]));
  const manual = new Set(
    (cells ?? []).filter((c: any) => c.is_manual).map((c: any) => `${c.role_id}:${c.tier_id}`),
  );

  let updated = 0;
  let skipped = 0;
  const now = new Date().toISOString();
  const sourceList = [...new Set([...(parsed.sources ?? []), ...sources])].slice(0, 12);
  const sourceText = sourceList.join(", ").slice(0, 600);

  for (const cell of parsed.cells ?? []) {
    const role = roleByTitle.get(cell.role);
    const tier = tierByKey.get(cell.tier);
    if (!role || !tier) {
      skipped++;
      continue;
    }
    if (manual.has(`${role.id}:${tier.id}`)) {
      skipped++;
      continue;
    }

    let low = typeof cell.low_lpa === "number" ? cell.low_lpa : null;
    let high = typeof cell.high_lpa === "number" ? cell.high_lpa : null;
    const notTypical = cell.not_typical === true;

    if (!notTypical) {
      if (low === null || high === null) {
        skipped++;
        continue;
      }
      if (low > high) [low, high] = [high, low];
      if (low < 3 || high > MAX_LPA || high <= low) {
        skipped++;
        continue;
      }
    } else {
      low = null;
      high = null;
    }

    const payload = {
      role_id: role.id,
      tier_id: tier.id,
      low_lpa: low,
      high_lpa: high,
      mid_lpa: low !== null && high !== null ? Math.round(((low + high) / 2) * 10) / 10 : null,
      base_note: cell.base_note?.slice(0, 120) ?? null,
      bonus_note: cell.bonus_note?.slice(0, 120) ?? null,
      equity_note: cell.equity_note?.slice(0, 160) ?? null,
      note: cell.note?.slice(0, 400) ?? null,
      not_typical: notTypical,
      is_manual: false,
      sources: sourceText,
      updated_at: now,
    };

    const { error } = await admin
      .from("comp_cells")
      .upsert(payload, { onConflict: "role_id,tier_id" });
    if (error) {
      console.error(`[${FUNCTION_NAME}] upsert failed`, error.message);
      skipped++;
    } else {
      updated++;
    }
  }

  if (updated === 0) {
    return await fail("No figures passed the sanity checks, so nothing was changed.", 502);
  }

  if (runId) {
    await admin
      .from("comp_refresh_runs")
      .update({
        status: "success",
        finished_at: now,
        cells_updated: updated,
        sources: sourceText,
        message: `${updated} updated, ${skipped} skipped`,
      })
      .eq("id", runId);
  }

  return { status: 200, payload: { updated, skipped, sources: sourceList, run_id: runId } };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const { status, payload } = await run(req);
    return new Response(JSON.stringify(payload), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error(`[${FUNCTION_NAME}]`, e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unexpected error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
