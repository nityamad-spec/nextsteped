// End-to-end tests for run-code: calls the deployed edge function with a real
// student JWT and verifies actual Judge0 execution results.
//
// Requires env (auto-injected by the Lovable test runner):
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_ANON_KEY
// If any are missing the suite skips, so unit-only runs still pass.
//
// NOTE: we deliberately do NOT import std/dotenv/load.ts unconditionally — it
// reads `.env` at import time and the runner only grants --allow-net/--allow-env.

import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

try {
  const status = await Deno.permissions.query({ path: ".env", name: "read" });
  if (status.state === "granted") {
    await import("https://deno.land/std@0.224.0/dotenv/load.ts");
  }
} catch {
  // Injected environment variables win in every runner we care about.
}

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? Deno.env.get("VITE_SUPABASE_URL");
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const ANON_KEY =
  Deno.env.get("SUPABASE_ANON_KEY") ??
  Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ??
  Deno.env.get("VITE_SUPABASE_PUBLISHABLE_KEY");

const haveEnv = Boolean(SUPABASE_URL && SERVICE_KEY && ANON_KEY);
const FN_URL = `${SUPABASE_URL}/functions/v1/run-code`;

const admin = haveEnv ? createClient(SUPABASE_URL!, SERVICE_KEY!) : null;

function itest(name: string, fn: () => Promise<void>) {
  Deno.test({ name, ignore: !haveEnv, fn, sanitizeOps: false, sanitizeResources: false });
}

// ---------- Fixture ----------

type Fixture = { studentId: string; jwt: string };

let fixture: Fixture | null = null;

async function getFixture(): Promise<Fixture> {
  if (fixture) return fixture;
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const email = `runcode-${stamp}@test.local`;
  const password = "Passw0rd!Test";

  const { data, error } = await admin!.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: "Run Code Tester", role: "student" },
  });
  if (error) throw error;
  const studentId = data.user!.id;

  await admin!
    .from("profiles")
    .upsert([{ id: studentId, email, name: "Run Code Tester", role: "student" }], {
      onConflict: "id",
    });

  const userClient = createClient(SUPABASE_URL!, ANON_KEY!);
  const { data: signIn, error: signErr } = await userClient.auth.signInWithPassword({
    email,
    password,
  });
  if (signErr) throw signErr;

  fixture = { studentId, jwt: signIn.session!.access_token };
  return fixture;
}

async function callFn(body: Record<string, unknown>, jwt?: string) {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    apikey: ANON_KEY!,
  };
  if (jwt) headers.Authorization = `Bearer ${jwt}`;
  const res = await fetch(FN_URL, { method: "POST", headers, body: JSON.stringify(body) });
  const text = await res.text();
  let json: any = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* keep raw text */
  }
  return { status: res.status, json, text };
}

// ---------- Auth & validation ----------

itest("e2e: 401 without an Authorization header", async () => {
  const { status, json } = await callFn({ language: "python", code: "print(1)" });
  assertEquals(status, 401);
  assert(typeof json?.error === "string");
});

itest("e2e: 401 with an invalid JWT", async () => {
  const { status } = await callFn({ language: "python", code: "print(1)" }, "not-a-real-jwt");
  assertEquals(status, 401);
});

itest("e2e: 400 on unsupported language", async () => {
  const { jwt } = await getFixture();
  const { status, json } = await callFn({ language: "brainfuck", code: "+++" }, jwt);
  assertEquals(status, 400);
  assertEquals(json.error, "Unsupported language");
});

itest("e2e: 400 on empty code", async () => {
  const { jwt } = await getFixture();
  const { status, json } = await callFn({ language: "python", code: "   \n  " }, jwt);
  assertEquals(status, 400);
  assertEquals(json.error, "No code to run");
});

// ---------- Real execution through Judge0 ----------

itest("e2e: python hello world returns stdout", async () => {
  const { jwt } = await getFixture();
  const { status, json } = await callFn(
    { language: "python", code: 'print("hello from python")' },
    jwt,
  );
  assertEquals(status, 200, `unexpected body: ${JSON.stringify(json)}`);
  assertEquals(json.stdout.trim(), "hello from python");
  assertEquals(json.statusId, 3); // Accepted
  assertEquals(json.stderr, "");
});

itest("e2e: python reads stdin", async () => {
  const { jwt } = await getFixture();
  const { status, json } = await callFn(
    {
      language: "python",
      code: "import sys\nname = sys.stdin.readline().strip()\nprint(f'hi {name}')",
      stdin: "ada\n",
    },
    jwt,
  );
  assertEquals(status, 200, `unexpected body: ${JSON.stringify(json)}`);
  assertEquals(json.stdout.trim(), "hi ada");
});

itest("e2e: python runtime error surfaces stderr", async () => {
  const { jwt } = await getFixture();
  const { status, json } = await callFn({ language: "python", code: "1/0" }, jwt);
  assertEquals(status, 200, `unexpected body: ${JSON.stringify(json)}`);
  assert(json.statusId > 3, `expected error status, got ${json.statusId}`);
  assert(
    json.stderr.includes("ZeroDivisionError"),
    `expected ZeroDivisionError in stderr: ${json.stderr}`,
  );
});

itest("e2e: javascript hello world returns stdout", async () => {
  const { jwt } = await getFixture();
  const { status, json } = await callFn(
    { language: "javascript", code: 'console.log("hello from node")' },
    jwt,
  );
  assertEquals(status, 200, `unexpected body: ${JSON.stringify(json)}`);
  assertEquals(json.stdout.trim(), "hello from node");
});

itest("e2e: cpp compiles and runs", async () => {
  const { jwt } = await getFixture();
  const code = `#include <iostream>
int main() { std::cout << "hello from cpp" << std::endl; return 0; }`;
  const { status, json } = await callFn({ language: "cpp", code }, jwt);
  assertEquals(status, 200, `unexpected body: ${JSON.stringify(json)}`);
  assertEquals(json.compileOutput, "");
  assertEquals(json.stdout.trim(), "hello from cpp");
});

itest("e2e: cpp compile error surfaces compileOutput", async () => {
  const { jwt } = await getFixture();
  const { status, json } = await callFn(
    { language: "cpp", code: "int main() { this is not c++ }" },
    jwt,
  );
  assertEquals(status, 200, `unexpected body: ${JSON.stringify(json)}`);
  assert(json.compileOutput.length > 0, "expected compiler diagnostics");
  assertEquals(json.stdout, "");
});

itest("e2e: java compiles and runs", async () => {
  const { jwt } = await getFixture();
  const code = `public class Main {
  public static void main(String[] args) { System.out.println("hello from java"); }
}`;
  const { status, json } = await callFn({ language: "java", code }, jwt);
  assertEquals(status, 200, `unexpected body: ${JSON.stringify(json)}`);
  assertEquals(json.stdout.trim(), "hello from java");
});

itest("e2e: reports time and memory metrics", async () => {
  const { jwt } = await getFixture();
  const { status, json } = await callFn({ language: "python", code: "print(2+2)" }, jwt);
  assertEquals(status, 200, `unexpected body: ${JSON.stringify(json)}`);
  assertEquals(json.stdout.trim(), "4");
  assert(json.time !== null, "expected a time measurement");
  assert(json.memory !== null, "expected a memory measurement");
  assert(typeof json.status === "string" && json.status.length > 0);
});

// ---------- Cleanup ----------

Deno.test({
  name: "e2e: cleanup run-code fixture",
  ignore: !haveEnv,
  sanitizeOps: false,
  sanitizeResources: false,
  fn: async () => {
    if (!fixture) return;
    await admin!.from("profiles").delete().eq("id", fixture.studentId);
    await admin!.auth.admin.deleteUser(fixture.studentId).catch(() => {});
    fixture = null;
  },
});
