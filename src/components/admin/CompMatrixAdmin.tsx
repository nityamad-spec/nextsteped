import { useState } from "react";
import { Loader2, Pencil, RefreshCw, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { useCompMatrix } from "@/hooks/useCompMatrix";
import { cellFor, formatRange, tierAccent, type CompCell } from "@/lib/compMatrix";

interface EditState {
  roleId: string;
  tierId: string;
  roleTitle: string;
  tierLabel: string;
  cell: CompCell | undefined;
  low: string;
  high: string;
  base: string;
  bonus: string;
  equity: string;
  note: string;
  notTypical: boolean;
}

export function CompMatrixAdmin() {
  const { roles, tiers, cells, lastRun, loading, refetch } = useCompMatrix();
  const [refreshing, setRefreshing] = useState(false);
  const [edit, setEdit] = useState<EditState | null>(null);
  const [saving, setSaving] = useState(false);

  const openEdit = (roleId: string, roleTitle: string, tierId: string, tierLabel: string) => {
    const cell = cellFor(cells, roleId, tierId);
    setEdit({
      roleId,
      tierId,
      roleTitle,
      tierLabel,
      cell,
      low: cell?.low_lpa != null ? String(cell.low_lpa) : "",
      high: cell?.high_lpa != null ? String(cell.high_lpa) : "",
      base: cell?.base_note ?? "",
      bonus: cell?.bonus_note ?? "",
      equity: cell?.equity_note ?? "",
      note: cell?.note ?? "",
      notTypical: cell?.not_typical ?? false,
    });
  };

  const save = async () => {
    if (!edit) return;
    const low = edit.notTypical ? null : Number(edit.low);
    const high = edit.notTypical ? null : Number(edit.high);
    if (!edit.notTypical) {
      if (!Number.isFinite(low!) || !Number.isFinite(high!) || low! <= 0 || high! <= low!) {
        toast({
          title: "Check the numbers",
          description: "Enter a low and high figure, with the high above the low.",
          variant: "destructive",
        });
        return;
      }
    }
    setSaving(true);
    const { error } = await supabase.from("comp_cells").upsert(
      {
        role_id: edit.roleId,
        tier_id: edit.tierId,
        low_lpa: low,
        high_lpa: high,
        mid_lpa: low != null && high != null ? Math.round(((low + high) / 2) * 10) / 10 : null,
        base_note: edit.base || null,
        bonus_note: edit.bonus || null,
        equity_note: edit.equity || null,
        note: edit.note || null,
        not_typical: edit.notTypical,
        is_manual: true,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "role_id,tier_id" },
    );
    setSaving(false);
    if (error) {
      toast({ title: "Could not save", description: error.message, variant: "destructive" });
      return;
    }
    setEdit(null);
    await refetch();
    toast({ title: "Saved", description: "This figure is now set by hand and won't be overwritten." });
  };

  const clearManual = async (cell: CompCell) => {
    const { error } = await supabase.from("comp_cells").update({ is_manual: false }).eq("id", cell.id);
    if (error) {
      toast({ title: "Could not update", description: error.message, variant: "destructive" });
      return;
    }
    await refetch();
  };

  const refresh = async () => {
    setRefreshing(true);
    const { data, error } = await supabase.functions.invoke("refresh-compensation-matrix", {
      body: {},
    });
    setRefreshing(false);
    if (error) {
      let detail = error.message;
      try {
        const ctx = (error as { context?: { text?: () => Promise<string> } }).context;
        if (ctx?.text) {
          const body = await ctx.text();
          const parsed = JSON.parse(body);
          if (parsed?.error) detail = parsed.error;
        }
      } catch {
        /* keep the original message */
      }
      toast({ title: "Refresh failed", description: detail, variant: "destructive" });
      return;
    }
    await refetch();
    toast({
      title: "Salary data refreshed",
      description: `${data?.updated ?? 0} figures updated${data?.skipped ? `, ${data.skipped} left alone` : ""}.`,
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const updated = lastRun?.finished_at ?? lastRun?.started_at ?? null;

  return (
    <div className="space-y-4 pt-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium">Fresh-grad salary matrix (India, LPA)</p>
          <p className="text-xs text-muted-foreground">
            {updated
              ? `Last refreshed ${new Date(updated).toLocaleString()}`
              : "Never refreshed from public sources yet."}
          </p>
        </div>
        <Button onClick={() => void refresh()} disabled={refreshing} className="gap-2">
          {refreshing ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="h-4 w-4" />
          )}
          {refreshing ? "Researching…" : "Refresh from sources"}
        </Button>
      </div>

      {roles.length === 0 || tiers.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            No roles or tiers configured yet.
          </CardContent>
        </Card>
      ) : (
        roles.map((role) => (
          <Card key={role.id}>
            <CardContent className="p-4">
              <p className="font-semibold">{role.title}</p>
              <div className="mt-3 grid gap-3 md:grid-cols-3">
                {tiers.map((tier) => {
                  const cell = cellFor(cells, role.id, tier.id);
                  const a = tierAccent(tier.accent);
                  return (
                    <div key={tier.id} className="rounded-lg border border-border p-3">
                      <div className="flex items-center justify-between gap-2">
                        <Badge variant="outline" className={`text-[10px] ${a.chip}`}>
                          {tier.label}
                        </Badge>
                        <div className="flex items-center gap-1">
                          {cell?.is_manual && (
                            <Button
                              variant="ghost"
                              size="icon"
                              title="Set by hand — allow refresh to replace it"
                              onClick={() => void clearManual(cell)}
                            >
                              <RotateCcw className="h-3.5 w-3.5" />
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => openEdit(role.id, role.title, tier.id, tier.label)}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </div>
                      <p className="mt-2 text-sm font-medium">
                        {cell?.not_typical ? "Not typical at this tier" : formatRange(cell)}
                      </p>
                      {cell?.is_manual && (
                        <p className="mt-1 text-[11px] text-muted-foreground">Set by hand</p>
                      )}
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        ))
      )}

      <Dialog open={!!edit} onOpenChange={(o) => !o && setEdit(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {edit?.roleTitle} · {edit?.tierLabel}
            </DialogTitle>
          </DialogHeader>
          {edit && (
            <div className="space-y-3">
              <div className="flex items-center justify-between rounded-lg border border-border p-3">
                <Label htmlFor="not-typical" className="text-sm">
                  Not typical at this tier
                </Label>
                <Switch
                  id="not-typical"
                  checked={edit.notTypical}
                  onCheckedChange={(v) => setEdit({ ...edit, notTypical: v })}
                />
              </div>
              {!edit.notTypical && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Low (LPA)</Label>
                    <Input
                      value={edit.low}
                      inputMode="decimal"
                      onChange={(e) => setEdit({ ...edit, low: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label>High (LPA)</Label>
                    <Input
                      value={edit.high}
                      inputMode="decimal"
                      onChange={(e) => setEdit({ ...edit, high: e.target.value })}
                    />
                  </div>
                </div>
              )}
              <div>
                <Label>Base</Label>
                <Input value={edit.base} onChange={(e) => setEdit({ ...edit, base: e.target.value })} />
              </div>
              <div>
                <Label>Bonus</Label>
                <Input
                  value={edit.bonus}
                  onChange={(e) => setEdit({ ...edit, bonus: e.target.value })}
                />
              </div>
              <div>
                <Label>Equity</Label>
                <Input
                  value={edit.equity}
                  onChange={(e) => setEdit({ ...edit, equity: e.target.value })}
                />
              </div>
              <div>
                <Label>What pushes a candidate to the top of the range</Label>
                <Textarea
                  rows={2}
                  value={edit.note}
                  onChange={(e) => setEdit({ ...edit, note: e.target.value })}
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEdit(null)}>
              Cancel
            </Button>
            <Button onClick={() => void save()} disabled={saving}>
              {saving ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default CompMatrixAdmin;
