// Integration test: updating an admin prompt override should change the next
// edge-function call's output (proves the no-cache resolvePrompt path works
// end-to-end against the deployed functions).
//
// Requires admin credentials to be present in `.env`:
//   TEST_ADMIN_EMAIL=...
//   TEST_ADMIN_PASSWORD=...
// (the admin must have profiles.role = 'admin').
//
// Run via the Lovable test runner against the deployed Supabase project.

import "https://deno.land/std@0.224.0/dotenv/load.ts";
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("VITE_SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("VITE_SUPABASE_PUBLISHABLE_KEY")!;
const ADMIN_EMAIL = Deno.env.get("TEST_ADMIN_EMAIL");
const ADMIN_PASSWORD = Deno.env.get("TEST_ADMIN_PASSWORD");

const FN_NAME = "classify-question";

// Course-related question; with the DEFAULT prompt this should classify as
// relevant=true. With our override we force relevant=false, which proves the
// override took effect on the very next invocation.
const COURSE_PAYLOAD = {
  message: "Can you explain how a for-loop works in Python?",
  courseName: "Intro to Python",
  objectives: ["Understand control flow", "Write basic Python programs"],
  concepts: ["for loops", "while loops", "conditionals"],
};

const FORCE_FALSE_PROMPT = [
  "You are a classifier. Ignore the question content entirely.",
  "You MUST always call the `classify_relevance` tool with `relevant=false`,",
  "no matter what the user message says.",
].join(" ");

async function callClassify(token: string): Promise<{ relevant: boolean }> {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/${FN_NAME}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      apikey: SUPABASE_ANON_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(COURSE_PAYLOAD),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(`classify-question ${res.status}: ${JSON.stringify(body)}`);
  return body;
}

async function setOverride(token: string, prompt: string | null): Promise<void> {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/set-prompt-override`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      apikey: SUPABASE_ANON_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      overrides: [{ function_name: FN_NAME, stage: null, prompt }],
    }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`set-prompt-override ${res.status}: ${text}`);
}

Deno.test({
  name: "admin prompt override takes effect on the next edge-function call",
  ignore: !ADMIN_EMAIL || !ADMIN_PASSWORD,
  sanitizeOps: false,
  sanitizeResources: false,
  async fn() {
    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    const { data: signIn, error: signInErr } = await supabase.auth.signInWithPassword({
      email: ADMIN_EMAIL!,
      password: ADMIN_PASSWORD!,
    });
    if (signInErr || !signIn.session) {
      throw new Error(`admin sign-in failed: ${signInErr?.message}`);
    }
    const token = signIn.session.access_token;

    // Ensure we start from a clean slate (no override) so the baseline call
    // reflects the hardcoded default prompt.
    await setOverride(token, null);

    try {
      // 1. Baseline with default prompt: course-related question → relevant.
      const baseline = await callClassify(token);
      assertEquals(baseline.relevant, true, "baseline (default prompt) should classify as relevant");

      // 2. Install override that forces relevant=false.
      await setOverride(token, FORCE_FALSE_PROMPT);

      // 3. Next call must reflect the new override (no cold-start wait).
      const overridden = await callClassify(token);
      assertEquals(
        overridden.relevant,
        false,
        "after saving override, next call must use the new prompt and return relevant=false",
      );

      // 4. Remove override and confirm we revert to the default behavior.
      await setOverride(token, null);
      const reverted = await callClassify(token);
      assertEquals(reverted.relevant, true, "after clearing override, default prompt should return relevant=true");
    } finally {
      // Best-effort cleanup so a failed assertion doesn't leave the override behind.
      try { await setOverride(token, null); } catch { /* ignore */ }
      await supabase.auth.signOut();
    }
  },
});
