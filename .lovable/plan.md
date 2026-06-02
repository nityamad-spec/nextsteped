
# Version & display edge function system prompts

Goal: make every AI edge function pull its system prompt from a single versioned module, and surface those prompts in an admin-only page so changes between deployments are easy to verify.

## 1. Shared prompts module

New file: `supabase/functions/_shared/prompts.ts`

Exports a typed registry:

```ts
export type PromptEntry = {
  function: string;          // edge function name
  model: string;             // e.g. "google/gemini-2.5-pro"
  version: string;           // semver-ish, bumped manually on edit
  updated_at: string;        // ISO date, bumped with version
  description: string;       // one-liner of purpose
  system_prompt: string;     // the exact string sent as system message
  notes?: string;            // optional: tool-call schema name, batching, etc.
};

export const PROMPTS = {
  "parse-syllabus":            { ... },
  "extract-lesson-plan":       { ... },
  "extract-youtube-links":     { ... },
  "suggest-concepts":          { ... },
  "recommend-additional-concepts": { ... },
  "generate-lesson-plan.reorder":       { ... },
  "generate-lesson-plan.effort":        { ... },
  "generate-lesson-plan.author-weeks":  { ... },
  "regenerate-lesson-plan-week": { ... },
  "generate-diagnostic-questions": { ... },
  "chat":                      { ... },
  "classify-question":         { ... },
  "explain-answers":           { ... },
  "suggest-lesson":            { ... },
  "quality-check":             { ... },
  "teacher-chat":              { ... },  // if present
} satisfies Record<string, PromptEntry>;
```

Each existing edge function is edited to:
- Import its entry: `import { PROMPTS } from "../_shared/prompts.ts";`
- Replace the inline `systemPrompt` string with `PROMPTS["<name>"].system_prompt`
- Log `prompt_version` alongside the existing model in `console.log` for traceability

Generation pipelines that use multiple prompts (e.g. `generate-lesson-plan` has 3 stages) get one entry per stage, keyed `<function>.<stage>`.

## 2. Expose prompts to the client

New edge function: `supabase/functions/list-prompts/index.ts`
- `verify_jwt = false` in `supabase/config.toml` (we gate on role in code)
- Validates JWT manually, then checks `public.is_admin(user_id)` — non-admins get 403
- Returns `{ prompts: PromptEntry[] }` straight from the shared module

This avoids bundling the prompt text into the client bundle and ensures the admin always sees what is actually deployed.

## 3. Admin viewer page

New route: `/admin/prompts` (added to `src/App.tsx` under `AdminLayout`)

New file: `src/pages/admin/AdminPrompts.tsx`
- Calls `supabase.functions.invoke("list-prompts")` once
- Renders a searchable table: Function · Stage · Model · Version · Updated · short description
- Row click opens a side sheet with the full prompt text in a `<pre>` block, copy button, and the notes field
- Tailwind tokens only, shadcn `Table`, `Sheet`, `Input`, `Badge` components
- Empty/error/loading states

New nav entry in `src/layouts/AdminLayout.tsx` sidebar: "AI Prompts" → `/admin/prompts`.

## 4. Version bump convention

A short comment block at the top of `prompts.ts` documents the rule:
> When you edit any `system_prompt`, bump that entry's `version` (patch for wording, minor for structural change) and update `updated_at`. Do not edit prompts inline in edge functions.

No DB tables, no migration history (per chosen option). History can be added later if needed.

## Files touched

New:
- `supabase/functions/_shared/prompts.ts`
- `supabase/functions/list-prompts/index.ts`
- `src/pages/admin/AdminPrompts.tsx`

Edited (replace inline system prompt with shared import):
- `supabase/functions/parse-syllabus/index.ts`
- `supabase/functions/extract-lesson-plan/index.ts`
- `supabase/functions/extract-youtube-links/index.ts`
- `supabase/functions/suggest-concepts/index.ts`
- `supabase/functions/recommend-additional-concepts/index.ts`
- `supabase/functions/generate-lesson-plan/index.ts` (3 stages)
- `supabase/functions/regenerate-lesson-plan-week/index.ts`
- `supabase/functions/generate-diagnostic-questions/index.ts`
- `supabase/functions/chat/index.ts`
- `supabase/functions/classify-question/index.ts`
- `supabase/functions/explain-answers/index.ts`
- `supabase/functions/suggest-lesson/index.ts`
- `supabase/functions/quality-check/index.ts`
- `src/App.tsx` (route)
- `src/layouts/AdminLayout.tsx` (nav link)
- `supabase/config.toml` (config block for `list-prompts` with `verify_jwt = false`)

## Out of scope

- No DB-backed prompt history or diff view (option 2 was not selected).
- No runtime override of prompts from the DB — `prompts.ts` is the source of truth.
- Non-AI edge functions (auth, wipe, seed, etc.) are not included.
