// Resolves the system prompt an edge function should send to the AI gateway,
// preferring an admin-configured override from `public.edge_function_prompt_overrides`
// and falling back to the default the function passes in.
//
// Supports `{{placeholder}}` interpolation against a values map provided by
// the caller. Unknown placeholders are left untouched (they render literally to
// the model). Overrides are cached per cold start (per Deno isolate).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

type CacheKey = string; // `${function_name}::${stage ?? ""}`

let cache: Map<CacheKey, string> | null = null;
let inflight: Promise<Map<CacheKey, string>> | null = null;

const key = (fn: string, stage?: string | null): CacheKey =>
  `${fn}::${stage ?? ""}`;

async function loadOverrides(): Promise<Map<CacheKey, string>> {
  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceKey) return new Map();
  const admin = createClient(url, serviceKey);
  const { data, error } = await admin
    .from("edge_function_prompt_overrides")
    .select("function_name, stage, prompt");
  if (error) {
    console.warn("[resolvePrompt] override fetch failed:", error.message);
    return new Map();
  }
  const map = new Map<CacheKey, string>();
  for (const row of data ?? []) {
    map.set(
      key(row.function_name as string, row.stage as string | null),
      row.prompt as string,
    );
  }
  return map;
}

function interpolate(template: string, values: Record<string, unknown>): string {
  return template.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (match, name) => {
    if (Object.prototype.hasOwnProperty.call(values, name)) {
      const v = values[name];
      return v === null || v === undefined ? "" : String(v);
    }
    return match; // leave unknown placeholders literal
  });
}

export async function resolvePrompt(
  functionName: string,
  stage: string | null | undefined,
  defaultPrompt: string,
  values: Record<string, unknown> = {},
): Promise<string> {
  try {
    if (!cache) {
      if (!inflight) inflight = loadOverrides();
      cache = await inflight;
      inflight = null;
    }
    const template = cache.get(key(functionName, stage)) ?? defaultPrompt;
    return interpolate(template, values);
  } catch (e) {
    console.warn("[resolvePrompt] falling back to default:", e);
    return interpolate(defaultPrompt, values);
  }
}
