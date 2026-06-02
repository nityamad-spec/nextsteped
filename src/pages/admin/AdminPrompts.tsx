import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Copy, FileText, Pencil, RefreshCw, Save } from "lucide-react";
import { toast } from "sonner";
import { FALLBACK_AI_MODELS, type AiModelOption } from "@/lib/aiModels";

type PromptEntry = {
  function: string;
  model: string;
  version: string;
  updated_at: string;
  description: string;
  system_prompt: string;
  wired: boolean;
  synced_with: string;
  notes?: string;
  stage?: string;
};

const rowKey = (p: PromptEntry) => `${p.function}::${p.stage ?? ""}`;

export default function AdminPrompts() {
  const [prompts, setPrompts] = useState<PromptEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<PromptEntry | null>(null);

  const [modelOptions, setModelOptions] = useState<AiModelOption[]>(FALLBACK_AI_MODELS);
  const [refreshing, setRefreshing] = useState(false);
  const [savingModels, setSavingModels] = useState(false);
  const [savedOverrides, setSavedOverrides] = useState<Record<string, string>>({});
  const [modelOverrides, setModelOverrides] = useState<Record<string, string>>({});

  // Prompt override state.
  const [promptOverrides, setPromptOverrides] = useState<Record<string, string>>({});
  const [draftPrompt, setDraftPrompt] = useState<string>("");
  const [savingPrompt, setSavingPrompt] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [promptsRes, overridesRes, promptOverridesRes] = await Promise.all([
          supabase.functions.invoke("list-prompts"),
          supabase.functions.invoke("list-model-overrides"),
          supabase.functions.invoke("list-prompt-overrides"),
        ]);
        if (cancelled) return;
        if (promptsRes.error) throw promptsRes.error;
        setPrompts((promptsRes.data as { prompts: PromptEntry[] })?.prompts ?? []);
        if (!overridesRes.error) {
          const list =
            (overridesRes.data as {
              overrides?: Array<{ function_name: string; stage: string | null; model: string }>;
            })?.overrides ?? [];
          const map: Record<string, string> = {};
          for (const o of list) map[`${o.function_name}::${o.stage ?? ""}`] = o.model;
          setSavedOverrides(map);
        }
        if (!promptOverridesRes.error) {
          const list =
            (promptOverridesRes.data as {
              overrides?: Array<{ function_name: string; stage: string | null; prompt: string }>;
            })?.overrides ?? [];
          const map: Record<string, string> = {};
          for (const o of list) map[`${o.function_name}::${o.stage ?? ""}`] = o.prompt;
          setPromptOverrides(map);
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load prompts");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Initial model fetch — best effort; falls back silently to bundled.
  useEffect(() => {
    (async () => {
      try {
        const { data, error: e } = await supabase.functions.invoke("list-ai-models");
        if (e) return;
        const list = (data as { models?: AiModelOption[] })?.models ?? [];
        if (list.length > 0) setModelOptions(list);
      } catch { /* keep fallback */ }
    })();
  }, []);

  const filtered = prompts.filter((p) => {
    if (!query.trim()) return true;
    const q = query.toLowerCase();
    return (
      p.function.toLowerCase().includes(q) ||
      p.model.toLowerCase().includes(q) ||
      p.description.toLowerCase().includes(q) ||
      p.system_prompt.toLowerCase().includes(q)
    );
  });

  const copyPrompt = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Prompt copied");
    } catch {
      toast.error("Copy failed");
    }
  };

  const dirtyModelCount = Object.keys(modelOverrides).length;

  const effectiveModel = (p: PromptEntry) => {
    const k = rowKey(p);
    return modelOverrides[k] ?? savedOverrides[k] ?? p.model;
  };

  const handleRefreshModels = async () => {
    setRefreshing(true);
    try {
      const { data, error: invokeErr } = await supabase.functions.invoke("list-ai-models");
      if (invokeErr) throw invokeErr;
      const list = (data as { models?: AiModelOption[]; source?: string })?.models ?? [];
      if (list.length > 0) {
        setModelOptions(list);
        toast.success(
          (data as { source?: string })?.source === "gateway"
            ? "Loaded live model catalog"
            : "Loaded bundled fallback catalog",
        );
      } else {
        setModelOptions(FALLBACK_AI_MODELS);
        toast.message("Using bundled model catalog");
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to refresh models");
    } finally {
      setRefreshing(false);
    }
  };

  const handleSaveModels = async () => {
    if (dirtyModelCount === 0) return;
    setSavingModels(true);
    try {
      const payload: Array<{ function_name: string; stage: string | null; model: string | null }> = [];
      for (const [key, model] of Object.entries(modelOverrides)) {
        const [function_name, stageRaw] = key.split("::");
        const stage = stageRaw ? stageRaw : null;
        const entry = prompts.find(
          (p) => p.function === function_name && (p.stage ?? "") === (stage ?? ""),
        );
        if (!entry) continue;
        payload.push({
          function_name,
          stage,
          model: model === entry.model ? null : model,
        });
      }
      const { data, error: invokeErr } = await supabase.functions.invoke("set-model-override", {
        body: { overrides: payload },
      });
      if (invokeErr) throw invokeErr;
      setSavedOverrides((prev) => {
        const next = { ...prev };
        for (const p of payload) {
          const k = `${p.function_name}::${p.stage ?? ""}`;
          if (p.model === null) delete next[k];
          else next[k] = p.model;
        }
        return next;
      });
      setModelOverrides({});
      toast.success(`Saved ${(data as { applied?: number })?.applied ?? payload.length} model override(s)`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save model overrides");
    } finally {
      setSavingModels(false);
    }
  };

  const openEditor = (p: PromptEntry) => {
    setSelected(p);
    const k = rowKey(p);
    setDraftPrompt(promptOverrides[k] ?? p.system_prompt);
  };

  const closeEditor = () => {
    setSelected(null);
    setDraftPrompt("");
  };

  const promptDirty = selected
    ? draftPrompt !== (promptOverrides[rowKey(selected)] ?? selected.system_prompt)
    : false;

  const handleSavePrompt = async (reset = false) => {
    if (!selected) return;
    setSavingPrompt(true);
    try {
      const { error: invokeErr } = await supabase.functions.invoke("set-prompt-override", {
        body: {
          overrides: [
            {
              function_name: selected.function,
              stage: selected.stage ?? null,
              prompt: reset ? null : draftPrompt,
            },
          ],
        },
      });
      if (invokeErr) throw invokeErr;
      const k = rowKey(selected);
      setPromptOverrides((prev) => {
        const next = { ...prev };
        if (reset) delete next[k];
        else next[k] = draftPrompt;
        return next;
      });
      if (reset) setDraftPrompt(selected.system_prompt);
      toast.success(reset ? "Reverted to default" : "Prompt override saved");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save prompt");
    } finally {
      setSavingPrompt(false);
    }
  };

  return (
    <TooltipProvider delayDuration={150}>
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <FileText className="h-6 w-6 text-primary" />
          <div>
            <h1 className="text-2xl font-bold">AI Setup Configuration</h1>
            <p className="text-sm text-muted-foreground">
              Manage the model and system prompt for every AI edge function.
            </p>
          </div>
        </div>

        <Card className="p-4 flex flex-wrap items-center justify-between gap-3">
          <Input
            placeholder="Search by function, model, or prompt text…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="max-w-md"
          />
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleRefreshModels}
              disabled={refreshing}
            >
              <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${refreshing ? "animate-spin" : ""}`} />
              Refresh models
            </Button>
            <Button
              size="sm"
              onClick={handleSaveModels}
              disabled={dirtyModelCount === 0 || savingModels}
            >
              <Save className="h-3.5 w-3.5 mr-1.5" />
              {savingModels
                ? "Saving…"
                : `Save models${dirtyModelCount > 0 ? ` (${dirtyModelCount})` : ""}`}
            </Button>
          </div>
        </Card>

        <Card>
          {loading ? (
            <div className="p-8 text-center text-muted-foreground">Loading prompts…</div>
          ) : error ? (
            <div className="p-8 text-center text-destructive">{error}</div>
          ) : filtered.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">No prompts match.</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[26%]">Function</TableHead>
                  <TableHead className="w-[26%]">Model</TableHead>
                  <TableHead>Version</TableHead>
                  <TableHead>Updated</TableHead>
                  <TableHead>Wired</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead className="text-right">Prompt</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((p) => {
                  const k = rowKey(p);
                  const current = effectiveModel(p);
                  const isDirty = k in modelOverrides;
                  return (
                    <TableRow key={k}>
                      <TableCell className="font-mono text-xs align-top">
                        {p.function}
                        {p.stage && (
                          <span className="text-muted-foreground"> · {p.stage}</span>
                        )}
                      </TableCell>
                      <TableCell className="align-top">
                        <div className="flex items-center gap-2">
                          <Select
                            value={current}
                            onValueChange={(value) => {
                              setModelOverrides((prev) => {
                                const next = { ...prev };
                                if (value === p.model) delete next[k];
                                else next[k] = value;
                                return next;
                              });
                            }}
                          >
                            <SelectTrigger className="w-[240px] h-8 text-xs">
                              <SelectValue placeholder="Pick a model" />
                            </SelectTrigger>
                            <SelectContent>
                              {!modelOptions.some((m) => m.id === current) && (
                                <SelectItem value={current}>{current} (current)</SelectItem>
                              )}
                              {modelOptions.map((m) => (
                                <SelectItem key={m.id} value={m.id}>
                                  <div className="flex flex-col">
                                    <span className="text-sm">{m.label}</span>
                                    <span className="text-[10px] text-muted-foreground font-mono">
                                      {m.id}
                                    </span>
                                  </div>
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          {isDirty && <Badge variant="secondary" className="text-[10px]">unsaved</Badge>}
                        </div>
                      </TableCell>
                      <TableCell className="align-top">
                        <Badge variant="secondary">v{p.version}</Badge>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground align-top">{p.updated_at}</TableCell>
                      <TableCell className="align-top">
                        {p.wired ? (
                          <Badge variant="default">imported</Badge>
                        ) : (
                          <Badge variant="outline">inline</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-sm max-w-sm truncate align-top">{p.description}</TableCell>
                      <TableCell className="text-right align-top">
                        <Button variant="ghost" size="sm" onClick={() => openEditor(p)}>
                          <Pencil className="h-3.5 w-3.5 mr-1" />
                          Edit
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </Card>

        <Sheet open={!!selected} onOpenChange={(open) => !open && closeEditor()}>
          <SheetContent className="w-full sm:max-w-2xl overflow-y-auto flex flex-col">
            {selected && (
              <>
                <SheetHeader>
                  <SheetTitle className="font-mono text-base">
                    {selected.function}
                    {selected.stage && (
                      <span className="text-muted-foreground"> · {selected.stage}</span>
                    )}
                  </SheetTitle>
                  <SheetDescription>{selected.description}</SheetDescription>
                </SheetHeader>

                <div className="mt-6 space-y-4 flex-1">
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <div className="text-xs text-muted-foreground">Model (effective)</div>
                      <div className="font-mono text-xs">{effectiveModel(selected)}</div>
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground">Version</div>
                      <div>v{selected.version}</div>
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground">Updated</div>
                      <div>{selected.updated_at}</div>
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground">Status</div>
                      <div>
                        {selected.wired ? (
                          <Badge variant="default">imported from registry</Badge>
                        ) : (
                          <Badge variant="outline">inline snapshot</Badge>
                        )}
                      </div>
                    </div>
                    <div className="col-span-2">
                      <div className="text-xs text-muted-foreground">Source file</div>
                      <div className="font-mono text-xs break-all">{selected.synced_with}</div>
                    </div>
                    {selected.notes && (
                      <div className="col-span-2">
                        <div className="text-xs text-muted-foreground">Notes</div>
                        <div className="text-sm">{selected.notes}</div>
                      </div>
                    )}
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <div className="text-sm font-medium">System prompt</div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => copyPrompt(draftPrompt)}
                      >
                        <Copy className="h-3 w-3 mr-1" />
                        Copy
                      </Button>
                    </div>
                    <Textarea
                      value={draftPrompt}
                      onChange={(e) => setDraftPrompt(e.target.value)}
                      className="font-mono text-xs min-h-[400px]"
                    />
                    {!selected.wired && (
                      <p className="text-xs text-muted-foreground mt-2">
                        This prompt is built inline at request time with runtime values
                        (e.g. <code>{"${courseName}"}</code>). Editing here will not yet
                        affect runtime behavior — pending the persistence approach.
                      </p>
                    )}
                  </div>
                </div>

                <SheetFooter className="mt-4 gap-2">
                  <Button variant="outline" onClick={closeEditor}>
                    Cancel
                  </Button>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span>
                        <Button
                          disabled={!promptDirty}
                          onClick={() =>
                            toast.message(
                              "Prompt persistence is pending approval — the back-end plan was just proposed.",
                            )
                          }
                        >
                          <Save className="h-3.5 w-3.5 mr-1.5" />
                          Save prompt
                        </Button>
                      </span>
                    </TooltipTrigger>
                    <TooltipContent>
                      Persistence not wired yet — awaiting your approval on the
                      proposed prompt-override table & resolver.
                    </TooltipContent>
                  </Tooltip>
                </SheetFooter>
              </>
            )}
          </SheetContent>
        </Sheet>
      </div>
    </TooltipProvider>
  );
}
