import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function mimeFor(name: string): string {
  const ext = name.split(".").pop()?.toLowerCase() || "";
  const m: Record<string, string> = {
    pdf: "application/pdf",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    txt: "text/plain",
    csv: "text/csv",
  };
  return m[ext] || "application/octet-stream";
}

async function blobToBase64(blob: Blob): Promise<string> {
  const buf = new Uint8Array(await blob.arrayBuffer());
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < buf.length; i += chunk) {
    binary += String.fromCharCode.apply(
      null,
      Array.from(buf.subarray(i, i + chunk)) as unknown as number[],
    );
  }
  return btoa(binary);
}

// Pull YouTube URLs out of raw text. Covers watch, youtu.be, shorts, playlist,
// channel, and @handle URLs. Returns canonicalized, deduped list with kind +
// optional 11-char video_id.
function extractLinksFromText(text: string): Array<{ url: string; kind: string; video_id: string | null }> {
  const re =
    /https?:\/\/(?:www\.|m\.)?(?:youtube\.com\/(?:watch\?[^\s"'<>)]*v=([A-Za-z0-9_-]{11})|shorts\/([A-Za-z0-9_-]{11})|playlist\?[^\s"'<>)]*list=([A-Za-z0-9_-]+)|channel\/([A-Za-z0-9_-]+)|@([A-Za-z0-9_.-]+))|youtu\.be\/([A-Za-z0-9_-]{11}))[^\s"'<>)\]]*/gi;
  const out = new Map<string, { url: string; kind: string; video_id: string | null }>();
  let match: RegExpExecArray | null;
  while ((match = re.exec(text)) !== null) {
    const raw = match[0];
    const watchId = match[1] || match[7];
    const shortsId = match[2];
    const listId = match[3];
    const channelId = match[4];
    const handle = match[5];

    let url = raw;
    let kind = "other";
    let video_id: string | null = null;

    if (watchId) {
      url = `https://www.youtube.com/watch?v=${watchId}`;
      kind = "video";
      video_id = watchId;
    } else if (shortsId) {
      url = `https://www.youtube.com/shorts/${shortsId}`;
      kind = "video";
      video_id = shortsId;
    } else if (listId) {
      url = `https://www.youtube.com/playlist?list=${listId}`;
      kind = "playlist";
    } else if (channelId) {
      url = `https://www.youtube.com/channel/${channelId}`;
      kind = "channel";
    } else if (handle) {
      url = `https://www.youtube.com/@${handle}`;
      kind = "channel";
    }

    if (!out.has(url)) out.set(url, { url, kind, video_id });
  }
  return Array.from(out.values());
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");

    const authHeader = req.headers.get("Authorization") || "";
    if (!authHeader.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Missing Authorization" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Validate user via anon client + provided JWT.
    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userRes, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userRes?.user) {
      return new Response(JSON.stringify({ error: "Invalid auth" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userId = userRes.user.id;

    const { courseId, fileId, storagePath, fileName } = await req.json();
    if (!courseId || !storagePath) {
      return new Response(JSON.stringify({ error: "courseId and storagePath required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

    // Authorize: caller must be a course member (owner or collaborator).
    const { data: isMember } = await admin.rpc("is_course_member", {
      _course_id: courseId,
      _user_id: userId,
    });
    if (!isMember) {
      return new Response(JSON.stringify({ error: "Not a course member" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Download file from storage.
    const { data: blob, error: dlErr } = await admin.storage
      .from("course-materials")
      .download(storagePath);
    if (dlErr || !blob) {
      return new Response(JSON.stringify({ error: dlErr?.message || "Download failed" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const resolvedName = fileName || storagePath.split("/").pop() || "file";
    const ext = resolvedName.split(".").pop()?.toLowerCase() || "";

    // Extract raw text. txt/csv decode directly; pdf/docx go through Gemini.
    let rawText = "";
    if (ext === "txt" || ext === "csv") {
      rawText = await blob.text();
    } else if (ext === "pdf" || ext === "docx") {
      if (!LOVABLE_API_KEY) {
        return new Response(JSON.stringify({ error: "AI gateway not configured" }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const fileBase64 = await blobToBase64(blob);
      const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash-lite",
          messages: [
            {
              role: "system",
              content:
                "You extract YouTube URLs from documents. Return every YouTube URL you find, one per line. Output URLs only — no commentary, no numbering, no other text. If none are found, output nothing.",
            },
            {
              role: "user",
              content: [
                { type: "text", text: `Extract YouTube URLs from this document (${resolvedName}):` },
                {
                  type: "image_url",
                  image_url: { url: `data:${mimeFor(resolvedName)};base64,${fileBase64}` },
                },
              ],
            },
          ],
        }),
      });
      if (!aiRes.ok) {
        const t = await aiRes.text();
        return new Response(JSON.stringify({ error: `AI extraction failed: ${t}` }), {
          status: 502,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const aiJson = await aiRes.json();
      rawText = aiJson?.choices?.[0]?.message?.content || "";
    } else {
      return new Response(JSON.stringify({ error: `Unsupported file type: ${ext}` }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const links = extractLinksFromText(rawText);
    if (links.length === 0) {
      return new Response(JSON.stringify({ inserted: 0, skipped: 0, total: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const rows = links.map((l) => ({
      course_id: courseId,
      teacher_id: userId,
      source_file_id: fileId || null,
      url: l.url,
      video_id: l.video_id,
      kind: l.kind,
    }));

    const { data: upserted, error: upErr } = await admin
      .from("course_youtube_links")
      .upsert(rows, { onConflict: "course_id,url", ignoreDuplicates: true })
      .select("id");

    if (upErr) {
      return new Response(JSON.stringify({ error: upErr.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const inserted = upserted?.length ?? 0;
    return new Response(
      JSON.stringify({
        inserted,
        skipped: links.length - inserted,
        total: links.length,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("extract-youtube-links error:", err);
    return new Response(JSON.stringify({ error: String((err as Error)?.message || err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
