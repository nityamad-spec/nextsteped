/**
 * refresh-course-jobs
 *
 * Course teachers only. Pulls entry-level listings for the course's target role
 * from every active source, classifies only unseen listings with the AI gateway
 * (role fit, entry level, location, tier, required skills), upserts accepted
 * jobs and prunes jobs that disappeared. A failed refresh leaves jobs untouched.
 * 60s cooldown + single-flight lock via course_job_refreshes.
 */
import { z } from "https://esm.sh/zod@3.23.8";
import { loggedGatewayFetch } from "../_shared/ai-log.ts";
import { adminClient, assertSafeUrl, corsHeaders, json, requireCourseTeacher } from "../_shared/job-sources.ts";

const FUNCTION_NAME = "refresh-course-jobs";
const MODEL = "openai/gpt-6-astra";
const COOLDOWN_MS = 60_000;
const MAX_NEW_PER_RUN = 60;
const BATCH = 12;
const SENIOR_RE = /\b(senior|sr\.?|lead|principal|staff|manager|head|director|vp|architect|chief)\b/i;

type Raw = { key: string; title: string; company: string; location: string; url: string; salary: string | null; description: string; sourceId: string };

const Body = z.object({ course_id: z.string().uuid() });

function strip(html: string) {
  return html.replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
}
function norm(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

async function fetchWithTimeout(url: string, init: RequestInit = {}, ms = 20000) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: ctl.signal, redirect: "follow" });
  } finally {
    clearTimeout(t);
  }
}

function keyHeaders(key: string | null): Record<string, string> {
  return key ? { Authorization: `Bearer ${key}`, "x-api-key": key } : {};
}

function pick(o: any, names: string[]): string {
  for (const n of names) {
    const v = n.split(".").reduce((a, k) => (a == null ? a : a[k]), o);
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return "";
}

function fromJsonList(list: any[], sourceId: string): Raw[] {
  return list.map((j) => {
    const url = pick(j, ["url", "apply_url", "applyUrl", "link", "redirect_url", "job_url"]);
    const title = pick(j, ["title", "job_title", "name", "position"]);
    return {
      key: url || `${title}|${pick(j, ["company_name", "company"])}`,
      title,
      company: pick(j, ["company_name", "company", "company.display_name", "companyName", "organization"]),
      location: pick(j, ["candidate_required_location", "location", "location.display_name", "job_location", "city"]),
      url,
      salary: pick(j, ["salary", "salary_range", "package", "compensation"]) || null,
      description: strip(pick(j, ["description", "summary", "content", "snippet"])).slice(0, 1200),
      sourceId,
    };
  }).filter((r) => r.title && r.url);
}

async function fetchSource(src: any, key: string | null, role: string): Promise<Raw[]> {
  const base = await assertSafeUrl(src.url);
  if (src.source_type === "careers") {
    const fc = Deno.env.get("FIRECRAWL_API_KEY");
    if (!fc) throw new Error("Careers-page scraping isn't configured.");
    const res = await fetchWithTimeout("https://api.firecrawl.dev/v2/scrape", {
      method: "POST",
      headers: { Authorization: `Bearer ${fc}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        url: base.toString(),
        onlyMainContent: true,
        formats: [{
          type: "json",
          prompt: `List every job opening on this page (title, company, location, apply link, salary if shown, short description).`,
          schema: {
            type: "object",
            properties: {
              jobs: { type: "array", items: { type: "object", properties: {
                title: { type: "string" }, company: { type: "string" }, location: { type: "string" },
                url: { type: "string" }, salary: { type: "string" }, description: { type: "string" },
              } } },
            },
          },
        }],
      }),
    }, 45000);
    if (!res.ok) throw new Error(`careers page HTTP ${res.status}`);
    const data = await res.json();
    const jobs = (data?.data?.json ?? data?.json)?.jobs ?? [];
    return fromJsonList(jobs.map((j: any) => ({ ...j, url: j.url ? new URL(j.url, base).toString() : "" })), src.id);
  }

  const u = new URL(base.toString());
  if (/remotive\.com$/i.test(u.hostname) && !u.searchParams.has("search")) {
    u.searchParams.set("search", role);
    u.searchParams.set("limit", "100");
  }
  const res = await fetchWithTimeout(u.toString(), { headers: { Accept: "application/json, application/rss+xml, application/xml, text/xml", ...keyHeaders(key) } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const text = await res.text();
  const trimmed = text.trimStart();
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    const data = JSON.parse(trimmed);
    const list = Array.isArray(data) ? data : data.jobs ?? data.results ?? data.data ?? data.items ?? [];
    return fromJsonList(Array.isArray(list) ? list : [], src.id);
  }
  // RSS / Atom
  const items = [...trimmed.matchAll(/<(item|entry)\b[\s\S]*?<\/\1>/gi)].map((m) => m[0]);
  const tag = (x: string, t: string) => {
    const m = x.match(new RegExp(`<${t}[^>]*>([\\s\\S]*?)<\\/${t}>`, "i"));
    return m ? strip(m[1].replace(/<!\[CDATA\[|\]\]>/g, "")) : "";
  };
  return items.map((x) => {
    const link = tag(x, "link") || (x.match(/<link[^>]*href="([^"]+)"/i)?.[1] ?? "");
    const title = tag(x, "title");
    return {
      key: link || title, title, company: tag(x, "company") || tag(x, "author") || tag(x, "dc:creator"),
      location: tag(x, "location") || tag(x, "region"), url: link, salary: tag(x, "salary") || null,
      description: (tag(x, "description") || tag(x, "summary")).slice(0, 1200), sourceId: src.id,
    };
  }).filter((r) => r.title && r.url);
}

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["results"],
  properties: {
    results: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["index", "accept", "reason", "is_remote", "location", "tier", "package", "skills"],
        properties: {
          index: { type: "integer" },
          accept: { type: "boolean" },
          reason: { type: "string" },
          is_remote: { type: "boolean" },
          location: { type: "string" },
          tier: { type: "string", enum: ["accessible", "moderate", "competitive"] },
          package: { type: ["string", "null"] },
          skills: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              required: ["skill", "level"],
              properties: { skill: { type: "string" }, level: { type: "string", enum: ["basic", "working", "advanced"] } },
            },
          },
        },
      },
    },
  },
};

async function classify(batch: Raw[], role: string, courseSkills: string[], lovableKey: string, courseId: string) {
  const instructions = `You screen job listings for an Indian skilling course training students for the role "${role}".
For each listing decide "accept" = true only if ALL hold:
1. Right role: the job is genuinely a "${role}" role or a very close equivalent.
2. Entry level: suitable for freshers or 0-2 years of experience. Reject anything needing 3+ years, senior, lead or manager roles.
3. Location: based in India, OR remote AND open to candidates in India (reject remote roles restricted to other countries/regions such as "US only", "EU only").
Tier (competitiveness for a new graduate):
- accessible: high-volume or fresher hiring, low skill bar.
- moderate: typical entry-level role.
- competitive: well-known employers, global remote roles with huge applicant pools, premium pay, degree filters, or a broad skills list.
Skills: list the required skills with level basic/working/advanced (max 10). When a requirement matches one of the COURSE SKILLS, use that exact name: ${courseSkills.length ? courseSkills.join(", ") : "(none yet)"}.
"package": salary/CTC as written in the listing, or null if missing. Never invent one.
"location": short clean location (e.g. "Bengaluru, India" or "Remote (India)").
Return one result per listing using its index.`;
  const input = batch.map((r, i) =>
    `#${i}\nTitle: ${r.title}\nCompany: ${r.company}\nLocation: ${r.location || "unspecified"}\nSalary: ${r.salary ?? "unspecified"}\nDescription: ${r.description || "(none)"}`
  ).join("\n\n");
  const resp = await loggedGatewayFetch(
    FUNCTION_NAME,
    { model: MODEL, purpose: "job-classify", course_id: courseId },
    "https://ai.gateway.lovable.dev/v1/responses",
    {
      method: "POST",
      headers: { Authorization: `Bearer ${lovableKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: MODEL, instructions, input, stream: false, store: false, reasoning: { effort: "low" },
        text: { format: { type: "json_schema", name: "job_screen", strict: true, schema: SCHEMA } },
      }),
    },
  );
  if (!resp.ok) {
    const t = await resp.text().catch(() => "");
    console.error(`[${FUNCTION_NAME}] gateway ${resp.status}: ${t.slice(0, 300)}`);
    const err = new Error(resp.status === 402 ? "AI credits are exhausted." : resp.status === 429 ? "The AI service is busy. Try again in a minute." : `AI check failed (HTTP ${resp.status}).`);
    (err as any).status = resp.status;
    throw err;
  }
  const data = await resp.json();
  let text = typeof data?.output_text === "string" ? data.output_text : "";
  if (!text && Array.isArray(data?.output)) for (const it of data.output) for (const c of it?.content ?? []) if (typeof c?.text === "string") text += c.text;
  return (JSON.parse(text).results ?? []) as any[];
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return json({ error: "Invalid request." }, 400);
  const courseId = parsed.data.course_id;
  const admin = adminClient();
  const uid = await requireCourseTeacher(req, admin, courseId);
  if (!uid) return json({ error: "Only this course's professors can refresh jobs." }, 403);

  const lovableKey = Deno.env.get("LOVABLE_API_KEY");
  if (!lovableKey) return json({ error: "AI is not configured." }, 500);

  const { data: course } = await admin.from("courses").select("course_type, target_role, name").eq("id", courseId).maybeSingle();
  if (!course || (course as any).course_type !== "employment") return json({ error: "Jobs are only available for skilling courses." }, 400);
  const role = ((course as any).target_role as string | null)?.trim();
  if (!role) return json({ error: "Set the target role on your Course Dashboard before refreshing jobs." }, 400);

  const { data: sources } = await admin.from("course_job_sources").select("*").eq("course_id", courseId).eq("active", true);
  if (!sources?.length) return json({ error: "Turn on at least one job source before refreshing." }, 400);

  // Cooldown + lock.
  const { data: last } = await admin.from("course_job_refreshes").select("status, started_at")
    .eq("course_id", courseId).order("started_at", { ascending: false }).limit(1).maybeSingle();
  if (last) {
    const age = Date.now() - new Date(last.started_at).getTime();
    if (last.status === "running" && age < 5 * 60_000) return json({ error: "A refresh is already running." }, 409);
    if (age < COOLDOWN_MS) {
      const wait = Math.ceil((COOLDOWN_MS - age) / 1000);
      return json({ error: `Please wait ${wait}s before refreshing again.`, retry_after: wait }, 429);
    }
  }
  const { data: run, error: runErr } = await admin.from("course_job_refreshes")
    .insert({ course_id: courseId, started_by: uid }).select("id").single();
  if (runErr) return json({ error: runErr.message }, 500);

  const finish = async (patch: Record<string, unknown>) =>
    admin.from("course_job_refreshes").update({ ...patch, finished_at: new Date().toISOString() }).eq("id", run.id);

  try {
    const ids = sources.map((s: any) => s.id);
    const { data: secrets } = await admin.from("course_job_source_secrets").select("source_id, api_key").in("source_id", ids);
    const keyBy = new Map((secrets ?? []).map((s: any) => [s.source_id, s.api_key]));

    const sourceErrors: string[] = [];
    const results = await Promise.all(sources.map(async (s: any) => {
      try {
        return await fetchSource(s, keyBy.get(s.id) ?? null, role);
      } catch (e) {
        sourceErrors.push(`${s.name}: ${(e as Error).message}`);
        return [] as Raw[];
      }
    }));
    if (sourceErrors.length === sources.length) {
      throw new Error(`No source could be reached. ${sourceErrors.join("; ")}`);
    }

    // Title filter + cross-source dedup.
    const seen = new Set<string>();
    const all: Raw[] = [];
    for (const r of results.flat()) {
      if (SENIOR_RE.test(r.title)) continue;
      const dk = `${norm(r.title)}|${norm(r.company)}`;
      if (seen.has(dk) || seen.has(r.key)) continue;
      seen.add(dk);
      seen.add(r.key);
      all.push(r);
    }

    const [{ data: existing }, { data: rejected }, { data: tags }] = await Promise.all([
      admin.from("course_jobs").select("id, external_key").eq("course_id", courseId),
      admin.from("course_job_rejections").select("external_key").eq("course_id", courseId),
      admin.from("concept_skill_tags").select("skill").eq("course_id", courseId),
    ]);
    const existingKeys = new Set((existing ?? []).map((j: any) => j.external_key));
    const rejectedKeys = new Set((rejected ?? []).map((j: any) => j.external_key));
    const courseSkills = [...new Set((tags ?? []).map((t: any) => t.skill))];

    const fresh = all.filter((r) => !existingKeys.has(r.key) && !rejectedKeys.has(r.key)).slice(0, MAX_NEW_PER_RUN);
    const batches: Raw[][] = [];
    for (let i = 0; i < fresh.length; i += BATCH) batches.push(fresh.slice(i, i + BATCH));
    const classified = await Promise.all(batches.map((b) => classify(b, role, courseSkills, lovableKey, courseId)));

    const now = new Date().toISOString();
    const inserts: any[] = [];
    const rejects: any[] = [];
    batches.forEach((b, bi) => {
      const byIdx = new Map(classified[bi].map((r: any) => [r.index, r]));
      b.forEach((raw, i) => {
        const c: any = byIdx.get(i);
        if (!c) return; // not judged; retry next run
        if (!c.accept) {
          rejects.push({ course_id: courseId, external_key: raw.key });
          return;
        }
        inserts.push({
          course_id: courseId, source_id: raw.sourceId, external_key: raw.key, title: raw.title.slice(0, 300),
          company: raw.company.slice(0, 200), location: (c.location || raw.location).slice(0, 200), is_remote: !!c.is_remote,
          package: c.package || raw.salary || null, apply_url: raw.url, tier: c.tier, skills: c.skills ?? [],
          first_seen_at: now, last_seen_at: now,
        });
      });
    });

    if (inserts.length) {
      const { error } = await admin.from("course_jobs").upsert(inserts, { onConflict: "course_id,external_key" });
      if (error) throw new Error(error.message);
    }
    if (rejects.length) await admin.from("course_job_rejections").upsert(rejects, { onConflict: "course_id,external_key", ignoreDuplicates: true });

    // Touch still-listed jobs; prune ones that vanished — only from sources that answered.
    const liveKeys = new Set(all.map((r) => r.key));
    const okSourceIds = new Set(sources.filter((s: any) => !sourceErrors.some((e) => e.startsWith(`${s.name}:`))).map((s: any) => s.id));
    const { data: current } = await admin.from("course_jobs").select("id, external_key, source_id").eq("course_id", courseId);
    const stillIds: string[] = [];
    const goneIds: string[] = [];
    for (const j of current ?? []) {
      if (liveKeys.has(j.external_key)) stillIds.push(j.id);
      else if (!j.source_id || okSourceIds.has(j.source_id) || !ids.includes(j.source_id)) goneIds.push(j.id);
    }
    if (stillIds.length) await admin.from("course_jobs").update({ last_seen_at: now }).in("id", stillIds);
    if (goneIds.length) await admin.from("course_jobs").delete().in("id", goneIds);

    const { count } = await admin.from("course_jobs").select("id", { count: "exact", head: true }).eq("course_id", courseId);
    await finish({
      status: "succeeded", fetched_count: all.length, new_count: inserts.length, removed_count: goneIds.length,
      live_count: count ?? 0, error: sourceErrors.length ? sourceErrors.join("; ").slice(0, 1000) : null,
    });
    return json({ ok: true, fetched: all.length, added: inserts.length, removed: goneIds.length, live: count ?? 0, warnings: sourceErrors });
  } catch (e) {
    const msg = (e as Error).message || "Refresh failed.";
    console.error(`[${FUNCTION_NAME}]`, msg);
    await finish({ status: "failed", error: msg.slice(0, 1000) });
    const status = (e as any).status === 402 || (e as any).status === 429 ? (e as any).status : 502;
    return json({ error: `${msg} Your previous jobs were kept.` }, status);
  }
});
