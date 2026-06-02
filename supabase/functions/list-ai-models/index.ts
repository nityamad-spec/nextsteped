import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Curated fallback list (mirrors src/lib/aiModels.ts). Used when the AI Gateway
// does not expose a /models endpoint or the call fails.
const FALLBACK_MODELS = [
  { id: "google/gemini-2.5-pro", label: "Gemini 2.5 Pro", family: "gemini" },
  { id: "google/gemini-2.5-flash", label: "Gemini 2.5 Flash", family: "gemini" },
  { id: "google/gemini-2.5-flash-lite", label: "Gemini 2.5 Flash-Lite", family: "gemini" },
  { id: "google/gemini-3-flash-preview", label: "Gemini 3 Flash (preview)", family: "gemini" },
  { id: "google/gemini-3.1-flash-lite-preview", label: "Gemini 3.1 Flash-Lite (preview)", family: "gemini" },
  { id: "google/gemini-3.1-pro-preview", label: "Gemini 3.1 Pro (preview)", family: "gemini" },
  { id: "google/gemini-3.5-flash", label: "Gemini 3.5 Flash", family: "gemini" },
  { id: "openai/gpt-5", label: "GPT-5", family: "openai" },
  { id: "openai/gpt-5-mini", label: "GPT-5 Mini", family: "openai" },
  { id: "openai/gpt-5-nano", label: "GPT-5 Nano", family: "openai" },
];

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");

    // Admin gate.
    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.replace("Bearer ", "").trim();
    if (!token) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userClient = createClient(SUPABASE_URL, SERVICE_KEY, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser(token);
    if (userErr || !userData?.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const admin = createClient(SUPABASE_URL, SERVICE_KEY);
    const { data: isAdmin } = await admin.rpc("is_admin", { _user_id: userData.user.id });
    if (!isAdmin) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Try to fetch live catalog from the AI Gateway. If it's not available,
    // gracefully return the curated fallback so the admin UI is always usable.
    let liveModels: { id: string; label: string; family: string }[] | null = null;
    if (LOVABLE_API_KEY) {
      try {
        const resp = await fetch("https://ai.gateway.lovable.dev/v1/models", {
          headers: { Authorization: `Bearer ${LOVABLE_API_KEY}` },
        });
        if (resp.ok) {
          const json = await resp.json();
          const list = Array.isArray(json?.data) ? json.data : [];
          liveModels = list
            .map((m: any) => {
              const id = m?.id as string | undefined;
              if (!id) return null;
              const family = id.startsWith("google/")
                ? "gemini"
                : id.startsWith("openai/")
                ? "openai"
                : "other";
              return { id, label: id.split("/").pop() ?? id, family };
            })
            .filter(Boolean);
          // Filter out non-chat models (images, embeddings) heuristically.
          liveModels = liveModels!.filter(
            (m) => !/image|embedding|tts|audio/i.test(m.id),
          );
          if (liveModels.length === 0) liveModels = null;
        }
      } catch (e) {
        console.warn("[list-ai-models] gateway fetch failed:", e);
      }
    }

    return new Response(
      JSON.stringify({
        models: liveModels ?? FALLBACK_MODELS,
        source: liveModels ? "gateway" : "fallback",
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("list-ai-models error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
