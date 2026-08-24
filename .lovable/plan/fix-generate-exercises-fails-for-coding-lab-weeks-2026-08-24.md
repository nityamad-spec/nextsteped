# Fix: "Generate exercises" fails for coding/lab weeks

## Root cause (confirmed from gateway logs)

Every exercise-generation call to the AI gateway is rejected with **HTTP 400**. The gateway's error message (log_id `01a032bc-4745-7b35-a670-e6886a6e7c8e`, 2026-08-24T07:46:35Z):

> "Function tools with reasoning_effort are not supported for gpt-5.6-sol in /v1/chat/completions. To use function tools, use /v1/responses or set reasoning_effort to 'none'."

`generate-coding-exercises` calls `openai/gpt-5.6-sol` via `/v1/chat/completions` with a function tool (`author_exercise`) and `tool_choice`. That model does not accept function tools on the chat-completions endpoint, so all calls fail, both attempts are burned, and the function returns the 502 "The AI could not produce a valid exercise" message shown in the screenshot.

Two secondary issues found while diagnosing:

1. **Wasted retry**: a 400 is a terminal request error, but the function retries it once with "PREVIOUS ATTEMPT WAS REJECTED — gateway error 400", doubling latency and cost for a failure that can never succeed.
2. **Deployed function is stale**: the gateway request body shows the old tool schema (no `starter_code`), i.e. the starter-code update from the terminal-practice work has not been deployed yet. It will deploy with this fix.

## Fix (recommended)

In `supabase/functions/generate-coding-exercises/index.ts`:

1. Add `"reasoning_effort": "none"` to the chat-completions request body — the exact remedy the gateway error message prescribes. Keeps the current model, prompt, tool schema, and NDJSON flow unchanged.
2. Treat HTTP 400 as terminal: on a 400 response, throw immediately with the gateway's error message instead of retrying (same pattern already used for 429/402).
3. Redeploy the function (automatic on save) and run a live test generation for Week 2 of the Python course to confirm exercises are produced and saved as drafts.

## Alternative considered

- Migrate the call to the gateway `/v1/responses` API (the other remedy in the error message). This is the "proper" path for OpenAI models but is a larger rewrite of the request/response parsing for no functional gain here. Not recommended now.
- Switching to a Gemini model (supports function tools on chat completions) was also considered; rejected to avoid changing output quality/behavior of an already-tuned prompt.

## Risks

- `reasoning_effort: "none"` disables model reasoning for this call. Exercise authoring is structured tool output, not deep reasoning, so quality impact should be minimal — the live test in step 3 verifies this.
- No database or frontend changes required.
