

## Add Student AI Cost Calculator to Admin Dashboard

Add an interactive panel on the Admin Dashboard that estimates per-student AI cost based on configurable inputs (prompts/day, days, input/output tokens, model pricing).

### Where it goes

New tab **"Cost Calculator"** added to the existing tabs in `src/pages/admin/AdminDashboard.tsx` (alongside Pending / Approved / Rejected / Settings). Keeps the page structure intact and discoverable from the admin landing.

### Panel layout

```text
┌─ Student AI Usage & Cost Calculator ──────────────────────┐
│ Model:  [ gemini-2.5-flash-lite ▾ ]   (presets fill rates)│
│                                                            │
│ Usage assumptions          Token assumptions              │
│ Prompts/day:    [ 100  ]   Input tokens/prompt:  [ 4550 ] │
│ Days:           [ 180  ]   Output tokens/prompt: [  500 ] │
│                                                            │
│ Pricing (per 1M tokens, USD)                              │
│ Input price:  [ 0.10 ]    Output price:  [ 0.40 ]         │
│                                                            │
│ ── Results ──────────────────────────────────────────────  │
│ Total prompts:        18,000                              │
│ Total input tokens:   81,900,000                          │
│ Total output tokens:    9,000,000                         │
│ Input cost:           $ 8.19                              │
│ Output cost:          $ 3.60                              │
│ Cost per prompt:      $0.000655                           │
│ ─────────────────────────────────────────                  │
│ TOTAL PER STUDENT:    $11.79                              │
│                                                            │
│ Class size: [ 60 ]   →  Total class cost:  $707.40        │
└────────────────────────────────────────────────────────────┘
```

### Behavior

- All fields are controlled `Input` (number) components; results recompute live via `useMemo`.
- **Model preset dropdown** auto-fills input/output prices for the Lovable AI Gateway models the project uses:
  - `google/gemini-2.5-flash-lite` — $0.10 / $0.40
  - `google/gemini-2.5-flash` — $0.30 / $2.50
  - `google/gemini-2.5-pro` — $1.25 / $10.00
  - `openai/gpt-5-mini` — $0.25 / $2.00
  - `openai/gpt-5` — $1.25 / $10.00
  - `Custom` — leaves prices editable without overwriting
- Changing prices manually after picking a preset switches model label to "Custom".
- Defaults match the analysis already discussed: 100 prompts/day, 180 days, 4,550 input tokens, 500 output tokens, flash-lite pricing — so the panel opens showing the ~$11.79/student baseline.
- Optional **class-size multiplier** at the bottom shows cost × students.
- Pure client-side calculation. No DB writes, no edge functions, no schema changes.

### Files

- **Edit** `src/pages/admin/AdminDashboard.tsx` — add a new `<TabsTrigger value="calculator">` and `<TabsContent value="calculator">` rendering the calculator inline (kept in the same file for cohesion with the existing Settings tab pattern), or extract to a small `CostCalculator` sub-component within the same file.

### Out of scope

- Tracking real usage (no DB schema changes).
- Adjusting actual `max_tokens` caps in `supabase/functions/chat/index.ts`.
- Adding rate-limit quotas. (Can be a follow-up if you want enforcement instead of just estimation.)

