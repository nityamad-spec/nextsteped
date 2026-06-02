import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
import { Copy, FileText, RefreshCw, Save, Sparkles } from "lucide-react";
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

export default function AdminPrompts() {
  const [prompts, setPrompts] = useState<PromptEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<PromptEntry | null>(null);

  // --- Models tab state ---
  const [modelOptions, setModelOptions] = useState<AiModelOption[]>(FALLBACK_AI_MODELS);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  // Saved server-side overrides keyed by `${function}::${stage ?? ""}`.
  const [savedOverrides, setSavedOverrides] = useState<Record<string, string>>({});
  // Pending local edits keyed the same way (only edits that differ from saved).
  const [modelOverrides, setModelOverrides] = useState<Record<string, string>>({});

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [promptsRes, overridesRes] = await Promise.all([
          supabase.functions.invoke("list-prompts"),
          supabase.functions.invoke("list-model-overrides"),
        ]);
        if (cancelled) return;
        if (promptsRes.error) throw promptsRes.error;
        setPrompts((promptsRes.data as { prompts: PromptEntry[] })?.prompts ?? []);
        if (!overridesRes.error) {
          const list =
            (overridesRes.data as { overrides?: Array<{ function_name: string; stage: string | null; model: string }> })
              ?.overrides ?? [];
          const map: Record<string, string> = {};
          for (const o of list) map[`${o.function_name}::${o.stage ?? ""}`] = o.model;
          setSavedOverrides(map);
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
      toast.success("Prompt copied to clipboard");
    } catch {
      toast.error("Copy failed");
    }
  };

  // Build the per-step rows for the Models tab from the prompt registry.
  // Effective model precedence: pending edit > saved override > registry default.
  const modelRows = useMemo(() => {
    return prompts.map((p) => {
      const key = `${p.function}::${p.stage ?? ""}`;
      const current =
        modelOverrides[key] ?? savedOverrides[key] ?? p.model;
      return { key, entry: p, current };
    });
  }, [prompts, modelOverrides, savedOverrides]);

  const dirtyCount = Object.keys(modelOverrides).length;

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
            ? "Loaded live model catalog from the AI gateway"
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
    if (dirtyCount === 0) return;
    setSaving(true);
    try {
      // Build the payload from pending edits. If the edit equals the registry
      // default AND there is no saved override, skip (nothing to persist).
      const payload: Array<{ function_name: string; stage: string | null; model: string | null }> = [];
      for (const [key, model] of Object.entries(modelOverrides)) {
        const [function_name, stageRaw] = key.split("::");
        const stage = stageRaw ? stageRaw : null;
        const entry = prompts.find(
          (p) => p.function === function_name && (p.stage ?? "") === (stage ?? ""),
        );
        if (!entry) continue;
        // If user reverted to the registry default, send null to delete the row.
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
      // Merge into savedOverrides snapshot, then clear pending edits.
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
      toast.success(`Saved ${(data as { applied?: number })?.applied ?? payload.length} override(s)`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save overrides");
    } finally {
      setSaving(false);
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
              System prompts and per-step model selection for every AI edge function.
            </p>
          </div>
        </div>

        <Tabs defaultValue="prompts">
          <TabsList>
            <TabsTrigger value="prompts">Prompts</TabsTrigger>
            <TabsTrigger value="models">Models</TabsTrigger>
          </TabsList>

          {/* ===================== Prompts tab ===================== */}
          <TabsContent value="prompts" className="space-y-4 mt-4">
            <Card className="p-4">
              <Input
                placeholder="Search by function, model, or prompt text…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="max-w-md"
              />
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
                      <TableHead>Function</TableHead>
                      <TableHead>Model</TableHead>
                      <TableHead>Version</TableHead>
                      <TableHead>Updated</TableHead>
                      <TableHead>Wired</TableHead>
                      <TableHead>Description</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.map((p) => (
                      <TableRow
                        key={`${p.function}::${p.stage ?? ""}`}
                        className="cursor-pointer hover:bg-muted/50"
                        onClick={() => setSelected(p)}
                      >
                        <TableCell className="font-mono text-xs">
                          {p.function}
                          {p.stage && (
                            <span className="text-muted-foreground"> · {p.stage}</span>
                          )}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">{p.model}</TableCell>
                        <TableCell>
                          <Badge variant="secondary">v{p.version}</Badge>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">{p.updated_at}</TableCell>
                        <TableCell>
                          {p.wired ? (
                            <Badge variant="default">imported</Badge>
                          ) : (
                            <Badge variant="outline">inline</Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-sm max-w-md truncate">{p.description}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </Card>
          </TabsContent>

          {/* ===================== Models tab ===================== */}
          <TabsContent value="models" className="space-y-4 mt-4">
            <Card className="p-4 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-start gap-3">
                <Sparkles className="h-5 w-5 text-primary mt-0.5" />
                <div>
                  <p className="text-sm font-medium">Choose the Gemini / Lovable AI model for each setup step.</p>
                  <p className="text-xs text-muted-foreground">
                    Each row is one edge function (or one stage of a multi-stage pipeline). Use "Refresh models" to pull the latest catalog from the AI gateway.
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleRefreshModels}
                        disabled={refreshing}
                      >
                        <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${refreshing ? "animate-spin" : ""}`} />
                        Refresh models
                      </Button>
                    </span>
                  </TooltipTrigger>
                  <TooltipContent>
                    Live fetch from the AI gateway is pending back-end approval. The button currently re-applies the bundled catalog.
                  </TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span>
                      <Button size="sm" onClick={handleSaveModels} disabled={dirtyCount === 0}>
                        <Save className="h-3.5 w-3.5 mr-1.5" />
                        Save {dirtyCount > 0 ? `(${dirtyCount})` : ""}
                      </Button>
                    </span>
                  </TooltipTrigger>
                  <TooltipContent>
                    Persisting per-step model overrides is pending back-end approval.
                  </TooltipContent>
                </Tooltip>
              </div>
            </Card>

            <Card>
              {loading ? (
                <div className="p-8 text-center text-muted-foreground">Loading steps…</div>
              ) : error ? (
                <div className="p-8 text-center text-destructive">{error}</div>
              ) : modelRows.length === 0 ? (
                <div className="p-8 text-center text-muted-foreground">No setup steps found.</div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[36%]">Setup step</TableHead>
                      <TableHead>Default model</TableHead>
                      <TableHead>Model used at runtime</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {modelRows.map(({ key, entry, current }) => {
                      const isDirty = key in modelOverrides;
                      return (
                        <TableRow key={key}>
                          <TableCell>
                            <div className="font-medium text-sm">
                              {entry.function}
                              {entry.stage && (
                                <span className="text-muted-foreground"> · {entry.stage}</span>
                              )}
                            </div>
                            <div className="text-xs text-muted-foreground line-clamp-1">
                              {entry.description}
                            </div>
                          </TableCell>
                          <TableCell className="text-xs font-mono text-muted-foreground">
                            {entry.model}
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <Select
                                value={current}
                                onValueChange={(value) => {
                                  setModelOverrides((prev) => {
                                    const next = { ...prev };
                                    if (value === entry.model) {
                                      delete next[key];
                                    } else {
                                      next[key] = value;
                                    }
                                    return next;
                                  });
                                }}
                              >
                                <SelectTrigger className="w-[280px]">
                                  <SelectValue placeholder="Pick a model" />
                                </SelectTrigger>
                                <SelectContent>
                                  {/* Include the current value even if not in the catalog. */}
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
                              {isDirty && <Badge variant="secondary">unsaved</Badge>}
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </Card>
          </TabsContent>
        </Tabs>

        <Sheet open={!!selected} onOpenChange={(open) => !open && setSelected(null)}>
          <SheetContent className="w-full sm:max-w-2xl overflow-y-auto">
            {selected && (
              <>
                <SheetHeader>
                  <SheetTitle className="font-mono text-base">{selected.function}</SheetTitle>
                  <SheetDescription>{selected.description}</SheetDescription>
                </SheetHeader>

                <div className="mt-6 space-y-4">
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <div className="text-xs text-muted-foreground">Model</div>
                      <div className="font-mono text-xs">{selected.model}</div>
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
                        onClick={() => copyPrompt(selected.system_prompt)}
                      >
                        <Copy className="h-3 w-3 mr-1" />
                        Copy
                      </Button>
                    </div>
                    <pre className="p-3 rounded-md bg-muted text-xs whitespace-pre-wrap font-mono max-h-[60vh] overflow-y-auto">
                      {selected.system_prompt}
                    </pre>
                  </div>
                </div>
              </>
            )}
          </SheetContent>
        </Sheet>
      </div>
    </TooltipProvider>
  );
}
