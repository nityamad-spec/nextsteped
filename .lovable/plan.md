# Plan: Maximize Lesson Plan Quality via LLM Parameter Tuning

Goal: Push the two LLM calls in `supabase/functions/generate-lesson-plan/index.ts` toward maximum quality, factuality, and pedagogical realism — cost is not a constraint.

## Scope
Single file: `supabase/functions/generate-lesson-plan/index.ts`
Two LLM calls:
- **Call A** — `callEffortLLM()` (concept complexity / effort estimation)
- **Call B** — `authorResp` (week authoring: names, overviews, resources)

No DB schema changes, no frontend changes (ETA already bumped). No prompt rewrites beyond minor reinforcement of factuality/realism guidance.

## Parameter Changes

### Call A — Effort Estimation (currently `google/gemini-2.5-flash`)
Upgrade to a stronger reasoning model since per-concept effort estimates anchor the entire allocation:

| Param | New value | Rationale |
|---|---|---|
| `model` | `google/gemini-2.5-pro` | Better numerical/pedagogical judgment than flash |
| `temperature` | `0.2` | Low — estimates should be stable, not creative |
| `top_p` | `0.9` | Mild nucleus filtering |
| `max_tokens` | `8192` | Comfortably fits per-concept rationales for large concept lists |
| `reasoning` | `{ effort: "high" }` | Deeper analysis per concept |
| `seed` | `42` | Reproducibility across reruns |

### Call B — Week Authoring (currently `google/gemini-2.5-pro`)
Keep model, raise output capacity and add reasoning + a touch of variation for richer prose:

| Param | New value | Rationale |
|---|---|---|
| `model` | `google/gemini-2.5-pro` (unchanged) | Already top-tier |
| `temperature` | `0.5` | Some variation for engaging overviews, still grounded |
| `top_p` | `0.9` | Nucleus sampling |
| `max_tokens` | `16384` | Room for ~16 weeks × (name + rich overview + 3 resources + outcomes) without truncation |
| `reasoning` | `{ effort: "high" }` | Forces planning of week-to-week pedagogical arc |
| `frequency_penalty` | `0.2` | Reduces repetitive overview phrasing across weeks |
| `presence_penalty` | `0.1` | Encourages introducing fresh framing per week |
| `seed` | `42` | Reproducibility |

## Prompt Reinforcements (small, surgical)
Add 2–3 bullets to each system prompt to align with the higher-quality settings:

- **Effort prompt**: "Calibrate `estimated_sessions` to an *average* student (not top quartile). Account for prerequisite chaining and common misconceptions. Be conservative — under-estimating mastery time is the most common failure."
- **Author prompt**: "Each week's `overview` must be 3–5 sentences: (1) what the student will be able to do by end of week, (2) how it builds on prior weeks, (3) the key misconception or stumbling block to watch for. Resources must be real, well-known, and freely accessible (e.g. official Python docs, Real Python, MDN). Do not invent URLs — if unsure, omit `url`."

## Robustness Additions
- Wrap both `fetch` calls with a single retry on 5xx (1 retry, 2s backoff). Existing 429/402 handling stays as-is.
- Log final `usage` object from each response so we can confirm we aren't hitting `max_tokens`.

## Out of Scope
- Streaming progress to client
- Adding a third LLM call (e.g. critique pass) — can be a follow-up if quality still falls short
- Frontend ETA change (already at 90s / 150s warning, sufficient for `reasoning: high`)

## Files to Edit
- `supabase/functions/generate-lesson-plan/index.ts` (only)

## Verification
After deploy, regenerate a plan on `/teacher/setup/lesson-plan` and confirm:
1. All concepts still appear (existing coverage check)
2. Week overviews are noticeably richer / less repetitive
3. Edge function logs show no truncation (finish_reason ≠ `length`)
