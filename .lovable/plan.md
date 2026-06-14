# Stage 4 Risk Mitigation — Options

Stage 4 is the `callGateway` function (L395-629). It issues the AI Gateway call per tier, with 2 retries × 35s timeout × 4 tiers × 2 outer MAX_ATTEMPTS — up to ~140s worst case. Three concrete risks; each has independent options.

---

## Risk A — Worst-case time budget approaches Supabase 150s limit

**Current:** 4 tiers × 2 outer attempts × 2 gateway retries × 35s = ~140s. A single slow tier can push the function over the limit, killing the whole run.

**Options:**

1. **Tighten per-call timeout + cap retries** — Drop `GATEWAY_CALL_TIMEOUT_MS` to 25s, `GATEWAY_RETRIES` to 1 (no inner retry). Max ≈ 4×2×25 = 200s still over; combine with #2 or #3.
2. **Run tiers in parallel with `Promise.allSettled`** — Stage 7 already does this. Confirm/keep parallel; worst case becomes max(tier), not sum. ~70s ceiling.
3. **Global deadline** — Track `startedAt` at request entry, pass `deadlineMs` into `callGateway`. Skip remaining retries when budget < required. Return partial result with `warning: "tier X skipped"` rather than 500.
4. **Per-tier soft fail + background continuation** — On deadline hit, return what we have and finish remaining tiers via `EdgeRuntime.waitUntil` (writes directly to DB when done). Requires UI polling.

Recommended combo: **#2 + #3** (parallel + deadline-aware) — minimal surface area, no UX change.

---

## Risk B — No explicit 402 (credits exhausted) handling

**Current:** L551 treats 402 as "client error" → throws generic `AI gateway 402: ...`. UI surfaces as opaque failure; teacher cannot tell credits are the issue.

**Options:**

1. **Typed error path** — Detect `response.status === 402` before the generic 4xx branch, throw `new Error("AI_CREDITS_EXHAUSTED")`. Top-level handler returns structured `{ error: "credits_exhausted", message }` and the UI shows a "Add credits" CTA.
2. **Same as #1 + short-circuit other tiers** — On 402 from any tier, cancel siblings (AbortController) so we don't burn more failed calls.
3. **Pre-flight credit check** — Cheap GET to gateway/billing endpoint before generation. Heavier and gateway doesn't expose this today; skip.

Recommended: **#1 + #2**.

---

## Risk C — `EdgeRuntime.waitUntil` not always available

**Current:** Used for fire-and-forget logging (`logGatewayCall`). On local Deno or older runtimes, `EdgeRuntime` is undefined → throws inside log path → can mask real errors.

**Options:**

1. **Feature-detect once** — `const waitUntil = typeof EdgeRuntime !== "undefined" ? EdgeRuntime.waitUntil.bind(EdgeRuntime) : (p) => { p.catch(()=>{}); };` Use the shim everywhere.
2. **Await logs inline** — Simpler, but adds ~50-200ms per call to the time budget. Conflicts with Risk A.
3. **Queue logs and flush at end** — Push log rows into an array, single `insert` before responding. One round-trip, fully deterministic. Best fit if logs are insert-only.

Recommended: **#1** (zero latency, safe everywhere) or **#3** (cleaner, one insert).

---

## Suggested bundle

If you want a single coherent change set:

- **A2 + A3:** Parallel tiers + global deadline with partial-success response.
- **B1 + B2:** 402 detection, cancel siblings, structured error.
- **C1:** `waitUntil` shim in a shared helper.

Net effect: worst case drops from ~140s to ~70s, hard 500s on credits become actionable UI errors, log path safe in all runtimes. ~120-180 LOC change, isolated to `generate-diagnostic-questions/index.ts`.

---

**Which option(s) do you want me to turn into an implementation plan?** Pick by letter+number (e.g. "A2, A3, B1, C1") or say "the suggested bundle".
