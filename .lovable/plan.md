## Change 1 — Upload progress + gated Next (front-end only)

**Where:** `src/components/FileUploadZone.tsx`, `src/pages/teacher/CourseMaterials.tsx`.

Today the syllabus card shows a styled "Uploading… / Parsing…" progress card (border-primary/30, bg-primary/5, `<Progress>` + step labels), but the other three upload zones (Past Course Materials, Lesson Plans, YouTube Links) show only a tiny spinner. The Next button is gated only on syllabus parse status.

**UI changes:**

1. In `FileUploadZone`, extend the existing progress card so it renders for **every** `folderType`, not just `syllabus`:
   - While `uploading` is true → "Uploading <folderType label>…", indeterminate-style timed `<Progress>` bar (same `UPLOAD_EST_MS` heuristic), "Step 1 of 2: secure upload" subtext when a post-upload step exists, otherwise just "Uploading…".
   - For `lesson-plan-docs` and `youtube-links`, keep a second "Processing…" phase driven by a new local `processing` flag set to true around the `onUploadComplete` callback (wrap the existing `await onUploadComplete?.(...)` so the bar stays visible until extraction returns). Syllabus keeps its existing parse-substeps view unchanged.
   - On success show a brief green "Upload complete ✓" confirmation row (re-uses `Check` icon already imported) that auto-dismisses after ~2s.
   - Styling matches the current syllabus card exactly (same border, bg, spacing, `Progress` height).

2. Surface an `onUploadingChange?: (busy: boolean) => void` prop from `FileUploadZone` that fires true while `uploading || processing` is true.

3. In `CourseMaterials.tsx`, track `uploadingMap` keyed by zone (`syllabus | lesson-plans | lesson-plan-docs | youtube-links`). Wire each `<FileUploadZone>` to set its slot. Extend the existing `canContinue` logic so Next is also disabled while **any** zone reports busy. Add a visible reason line above `SetupModuleNav` like "Waiting for uploads to finish…" when blocked by uploads (styled like the existing parse-waiting message). The `SetupModuleNav` `nextDisabled` already produces the muted/disabled look; no new styling needed.

4. Required-uploads rule stays unchanged: only the syllabus is required to enable Next. Other zones only block Next while their own upload/processing is mid-flight (the user can choose not to upload them).

**No back-end work needed** for Change 1 — `uploading` and `onUploadComplete` are already client-side; the existing parse status from `parse-syllabus` is already streamed back through `onParseStatusChange`.

---

## Change 2 — Admin model picker per setup step

### Front-end (build now)

**Where:** `src/pages/admin/AdminPrompts.tsx` (rename section or add a sibling page `AdminModels.tsx` reachable from the same Admin nav entry — I'll add a tab toggle inside `AdminPrompts` to avoid a new route).

- New "Models" tab listing every entry from the prompts registry that has a `model` field (syllabus extraction, concept suggestion, lesson-plan generation stages, diagnostic generation, chat, classify-question, explain-answers, quality-check, etc. — one row per stage, label = `function` + optional `stage`).
- Each row: step name, current model badge, `<Select>` dropdown of available Gemini/Lovable AI models.
- "Refresh models" button above the table with a spinner state; on click calls a (new) backend endpoint and repopulates dropdown options.
- "Save" per row (or a single "Save changes" button at the top) calls a (new) backend endpoint to persist the selection.
- Dropdowns initially populated from a hard-coded fallback list mirroring the Lovable AI catalog so the UI is usable even before the back end ships.
- Styling uses existing shadcn `Table`, `Select`, `Button`, `Badge` — matches current `AdminPrompts` layout.

### Back-end pieces that need your approval before I touch them

Please confirm each item:

1. **Storage of per-step model selection.** New table `public.edge_function_model_overrides (function_name text, stage text null, model text, updated_at, updated_by)` with admin-only RLS + `GRANT`s, read via a new `get-model-overrides` edge function (or `supabase.from(...).select()` directly if you prefer). Needed so selections persist across deploys.

2. **Edge functions reading the override at runtime.** Each edge function listed in `_shared/prompts.ts` would need a small helper (e.g. `resolveModel(functionName, stage, defaultModel)`) that looks up the override (cached in-memory per cold start) and falls back to the registry default. This means editing ~13 edge functions to swap their hard-coded `model:` strings for `resolveModel(...)`. No prompt changes.

3. **Refresh-models endpoint.** New edge function `list-ai-models` that calls the Lovable AI Gateway's models endpoint (`GET https://ai.gateway.lovable.dev/v1/models` with `LOVABLE_API_KEY`) and returns the filtered list of chat models. Admin-gated like `list-prompts`. If the gateway doesn't expose a models endpoint we'd fall back to a curated static list shipped in `_shared/models.ts`; I'd confirm which path to take after a quick probe.

4. **Save endpoint.** New edge function `set-model-override` (admin-gated) that upserts into the table above.

I will build only the UI (with the fallback static model list and disabled Save/Refresh buttons showing a "Pending back-end approval" tooltip) until you approve items 1–4. Once approved I'll wire the endpoints and add the `resolveModel` helper to each edge function in a follow-up batch.

---

## Files touched

- Edit: `src/components/FileUploadZone.tsx`, `src/pages/teacher/CourseMaterials.tsx`, `src/pages/admin/AdminPrompts.tsx`.
- New (front-end only): `src/lib/aiModels.ts` (static fallback model list).
- No back-end edits in this pass.
