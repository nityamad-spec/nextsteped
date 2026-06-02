// Resolves the model identifier an edge function should send to the AI gateway,
// preferring an admin-configured override from `public.edge_function_model_overrides`
// and falling back to the registry default that the function passes in.
//
// Overrides are fetched once per cold start (per Deno isolate) and cached in
// memory. A change in the admin UI takes effect for subsequent cold starts; in
// practice this means within seconds-to-minutes, which is acceptable for an
// admin tuning knob.

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
    .from("edge_function_model_overrides")
    .select("function_name, stage, model");
  if (error) {
    console.warn("[resolveModel] override fetch failed:", error.message);
    return new Map();
  }
  const map = new Map<CacheKey, string>();
  for (const row of data ?? []) {
    map.set(key(row.function_name as string, row.stage as string | null), row.model as string);
  }
  return map;
}

export async function resolveModel(
  functionName: string,
  stage: string | null | undefined,
  defaultModel: string,
): Promise<string> {
  try {
    if (!cache) {
      if (!inflight) inflight = loadOverrides();
      cache = await inflight;
      inflight = null;
    }
    return cache.get(key(functionName, stage)) ?? defaultModel;
  } catch (e) {
    console.warn("[resolveModel] falling back to default:", e);
    return defaultModel;
  }
}
