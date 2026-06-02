import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

type OverrideInput = {
  function_name: string;
  stage?: string | null;
  // prompt = null (or "") means "delete the override and use the registry default".
  prompt: string | null;
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const token = (req.headers.get("Authorization") ?? "").replace("Bearer ", "").trim();
    if (!token) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userClient = createClient(SUPABASE_URL, SERVICE_KEY, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser(token);
    if (userErr || !userData?.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userId = userData.user.id;
    const admin = createClient(SUPABASE_URL, SERVICE_KEY);
    const { data: isAdmin } = await admin.rpc("is_admin", { _user_id: userId });
    if (!isAdmin) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = (await req.json()) as { overrides?: OverrideInput[] };
    const overrides = Array.isArray(body?.overrides) ? body.overrides : [];
    if (overrides.length === 0) {
      return new Response(JSON.stringify({ ok: true, applied: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    for (const o of overrides) {
      if (!o || typeof o.function_name !== "string" || !o.function_name) {
        return new Response(JSON.stringify({ error: "invalid override entry" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    const deletes = overrides.filter((o) => o.prompt === null || o.prompt === "");
    const upserts = overrides
      .filter((o) => typeof o.prompt === "string" && o.prompt.length > 0)
      .map((o) => ({
        function_name: o.function_name,
        stage: o.stage ?? null,
        prompt: o.prompt as string,
        updated_by: userId,
        updated_at: new Date().toISOString(),
      }));

    for (const d of deletes) {
      const q = admin
        .from("edge_function_prompt_overrides")
        .delete()
        .eq("function_name", d.function_name);
      const { error } = await (d.stage == null ? q.is("stage", null) : q.eq("stage", d.stage));
      if (error) {
        return new Response(JSON.stringify({ error: error.message }), {
          status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    for (const u of upserts) {
      const q = admin
        .from("edge_function_prompt_overrides")
        .delete()
        .eq("function_name", u.function_name);
      await (u.stage == null ? q.is("stage", null) : q.eq("stage", u.stage));
      const { error } = await admin.from("edge_function_prompt_overrides").insert(u);
      if (error) {
        return new Response(JSON.stringify({ error: error.message }), {
          status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    return new Response(JSON.stringify({ ok: true, applied: overrides.length }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("set-prompt-override error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
