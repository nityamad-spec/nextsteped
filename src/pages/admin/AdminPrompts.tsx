import { useEffect, useState } from "react";
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
import { Copy, FileText } from "lucide-react";
import { toast } from "sonner";

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
};

export default function AdminPrompts() {
  const [prompts, setPrompts] = useState<PromptEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<PromptEntry | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data, error: invokeErr } = await supabase.functions.invoke("list-prompts");
        if (cancelled) return;
        if (invokeErr) throw invokeErr;
        setPrompts((data as { prompts: PromptEntry[] })?.prompts ?? []);
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

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <FileText className="h-6 w-6 text-primary" />
        <div>
          <h1 className="text-2xl font-bold">AI Prompts</h1>
          <p className="text-sm text-muted-foreground">
            System prompts used by every AI edge function, with version + last-updated date.
          </p>
        </div>
      </div>

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
                  key={p.function}
                  className="cursor-pointer hover:bg-muted/50"
                  onClick={() => setSelected(p)}
                >
                  <TableCell className="font-mono text-xs">{p.function}</TableCell>
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
  );
}
