// Resolves the system prompt an edge function should send to the AI gateway,
// preferring an admin-configured override from `public.edge_function_prompt_overrides`
// and falling back to the default the function passes in.
//
// Supports `{{placeholder}}` interpolation against a values map provided by
// the caller. Unknown placeholders are left untouched (they render literally to
// the model).
//
// NOTE: no in-memory cache — overrides are fetched on every call so admin edits
// take effect on the next invocation without waiting for a cold start.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

async function loadOverride(
  functionName: string,
  stage: string | null | undefined,
): Promise<string | null> {
  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceKey) return null;
  const admin = createClient(url, serviceKey);
  let q = admin
    .from("edge_function_prompt_overrides")
    .select("prompt")
    .eq("function_name", functionName)
    .limit(1);
  q = stage == null ? q.is("stage", null) : q.eq("stage", stage);
  const { data, error } = await q.maybeSingle();
  if (error) {
    console.warn("[resolvePrompt] override fetch failed:", error.message);
    return null;
  }
  return (data?.prompt as string | undefined) ?? null;
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
    const override = await loadOverride(functionName, stage);
    return interpolate(override ?? defaultPrompt, values);
  } catch (e) {
    console.warn("[resolvePrompt] falling back to default:", e);
    return interpolate(defaultPrompt, values);
  }
}
