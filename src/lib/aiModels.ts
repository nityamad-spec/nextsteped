/**
 * Fallback catalog of AI models available through the Lovable AI Gateway.
 *
 * This list is used by the admin "Models" tab when there is no live
 * `/models` response from the gateway yet. Once the back-end refresh
 * endpoint is wired up, the dropdowns will repopulate from there.
 */

export type AiModelOption = {
  id: string;
  label: string;
  family: "gemini" | "openai" | "other";
  notes?: string;
};

export const FALLBACK_AI_MODELS: AiModelOption[] = [
  // Gemini — text/reasoning
  { id: "google/gemini-2.5-pro",                    label: "Gemini 2.5 Pro",                    family: "gemini", notes: "Top-tier reasoning, multimodal, large context" },
  { id: "google/gemini-2.5-flash",                  label: "Gemini 2.5 Flash",                  family: "gemini", notes: "Balanced speed/quality" },
  { id: "google/gemini-2.5-flash-lite",             label: "Gemini 2.5 Flash-Lite",             family: "gemini", notes: "Fastest + cheapest 2.5; simple tasks" },
  { id: "google/gemini-3-flash-preview",            label: "Gemini 3 Flash (preview)",          family: "gemini", notes: "Default chat model" },
  { id: "google/gemini-3.1-flash-lite-preview",     label: "Gemini 3.1 Flash-Lite (preview)",   family: "gemini" },
  { id: "google/gemini-3.1-pro-preview",            label: "Gemini 3.1 Pro (preview)",          family: "gemini" },
  { id: "google/gemini-3.5-flash",                  label: "Gemini 3.5 Flash",                  family: "gemini" },
  // OpenAI
  { id: "openai/gpt-5",                             label: "GPT-5",                             family: "openai" },
  { id: "openai/gpt-5-mini",                        label: "GPT-5 Mini",                        family: "openai" },
  { id: "openai/gpt-5-nano",                        label: "GPT-5 Nano",                        family: "openai" },
];

/** Quickly check whether a model id exists in the fallback catalog. */
export const isKnownModel = (id: string) => FALLBACK_AI_MODELS.some((m) => m.id === id);
