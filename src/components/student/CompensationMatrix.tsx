import { useState } from "react";
import { ChevronDown, Info, Loader2, TrendingUp } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  buildHighlights,
  cellFor,
  formatLpa,
  formatRange,
  scalePercent,
  tierAccent,
  SCALE_MAX_LPA,
  type CompCell,
  type CompRefreshRun,
  type CompRole,
  type CompTier,
} from "@/lib/compMatrix";

interface Props {
  roles: CompRole[];
  tiers: CompTier[];
  cells: CompCell[];
  lastRun: CompRefreshRun | null;
  loading: boolean;
}

function RangeBar({ cell, accent }: { cell: CompCell; accent: string }) {
  const a = tierAccent(accent);
  const left = scalePercent(cell.low_lpa);
  const width = Math.max(2, scalePercent(cell.high_lpa) - left);
  return (
    <div className="relative mt-2 h-1.5 w-full rounded-full bg-muted">
      <div
        className={`absolute top-0 h-1.5 rounded-full ${a.bar}`}
        style={{ left: `${left}%`, width: `${width}%` }}
      />
    </div>
  );
}

function CellBlock({
  cell,
  accent,
  expanded,
  onToggle,
}: {
  cell: CompCell | undefined;
  accent: string;
  expanded: boolean;
  onToggle: () => void;
}) {
  const a = tierAccent(accent);

  if (!cell || cell.not_typical) {
    return (
      <div className="rounded-lg border border-dashed border-border bg-muted/30 p-3">
        <p className="text-xs text-muted-foreground">Not typical at this tier</p>
        {cell?.note && <p className="mt-1 text-[11px] text-muted-foreground">{cell.note}</p>}
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={onToggle}
      className="w-full rounded-lg border border-border bg-card p-3 text-left transition-colors hover:border-foreground/25"
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-sm font-semibold">{formatRange(cell)}</p>
          <p className="text-xs text-muted-foreground">
            Most offers land near ₹{formatLpa(cell.mid_lpa)} LPA
          </p>
        </div>
        <ChevronDown
          className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${expanded ? "rotate-180" : ""}`}
        />
      </div>
      <RangeBar cell={cell} accent={accent} />

      {expanded && (
        <div className="mt-3 space-y-1.5 border-t border-border pt-3 text-xs">
          {cell.base_note && (
            <div className="flex justify-between gap-3">
              <span className="text-muted-foreground">Base</span>
              <span className="text-right font-medium">{cell.base_note}</span>
            </div>
          )}
          {cell.bonus_note && (
            <div className="flex justify-between gap-3">
              <span className="text-muted-foreground">Bonus</span>
              <span className="text-right font-medium">{cell.bonus_note}</span>
            </div>
          )}
          {cell.equity_note && (
            <div className="flex justify-between gap-3">
              <span className="text-muted-foreground">Equity</span>
              <span className="text-right font-medium">{cell.equity_note}</span>
            </div>
          )}
          {cell.note && (
            <p className={`pt-1 ${a.text}`}>
              <span className="font-medium">To reach the top of this range: </span>
              {cell.note}
            </p>
          )}
        </div>
      )}
    </button>
  );
}

export function CompensationMatrix({ roles, tiers, cells, lastRun, loading }: Props) {
  const [open, setOpen] = useState<string | null>(null);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (roles.length === 0 || tiers.length === 0) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-sm text-muted-foreground">
          Compensation data hasn't been added yet.
        </CardContent>
      </Card>
    );
  }

  const highlights = buildHighlights(roles, tiers, cells);
  const updated = lastRun?.finished_at ?? lastRun?.started_at ?? null;
  const toggle = (key: string) => setOpen((cur) => (cur === key ? null : key));

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="rounded-xl border border-border bg-card p-5">
        <h2 className="font-heading text-lg font-bold">Fresh-grad compensation, India (LPA)</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Total yearly pay for someone joining with 0–1 years of experience. Figures are typical
          market ranges, not guarantees — the exact offer depends on the team, city and your
          interview performance.
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
          {updated && <span>Last updated {new Date(updated).toLocaleDateString()}</span>}
          <span>Sources: {lastRun?.sources || "Levels.fyi, Glassdoor, AmbitionBox, employee networks"}</span>
        </div>
      </div>

      {/* Tier legend */}
      <div className="grid gap-3 sm:grid-cols-3">
        {tiers.map((t) => {
          const a = tierAccent(t.accent);
          return (
            <div key={t.id} className="rounded-lg border border-border bg-card p-3">
              <div className="flex items-center gap-2">
                <span className={`h-2 w-2 rounded-full ${a.bar}`} />
                <p className="text-sm font-semibold">{t.label}</p>
              </div>
              {t.examples && (
                <p className="mt-1 text-xs text-muted-foreground">e.g. {t.examples}</p>
              )}
            </div>
          );
        })}
      </div>

      {/* Matrix: one block per role, three tier columns on desktop */}
      <div className="space-y-4">
        {roles.map((role) => (
          <Card key={role.id}>
            <CardContent className="p-4 md:p-5">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h3 className="font-heading text-base font-bold">{role.title}</h3>
                {role.blurb && (
                  <p className="text-xs text-muted-foreground">{role.blurb}</p>
                )}
              </div>
              <div className="mt-3 grid gap-3 md:grid-cols-3">
                {tiers.map((tier) => {
                  const cell = cellFor(cells, role.id, tier.id);
                  const a = tierAccent(tier.accent);
                  const key = `${role.id}:${tier.id}`;
                  return (
                    <div key={tier.id} className="space-y-1.5">
                      <Badge variant="outline" className={`text-[10px] ${a.chip}`}>
                        {tier.label}
                      </Badge>
                      <CellBlock
                        cell={cell}
                        accent={tier.accent}
                        expanded={open === key}
                        onToggle={() => toggle(key)}
                      />
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* How to read this */}
      <div className="flex gap-2 rounded-lg border border-border bg-muted/40 p-3 text-xs text-muted-foreground">
        <Info className="mt-0.5 h-4 w-4 shrink-0" />
        <p>
          Each bar sits on the same 0–{SCALE_MAX_LPA} LPA scale, so a longer or further-right bar
          really does mean more money. Tap any range to see how base, bonus and equity make it up.
        </p>
      </div>

      {/* Highlights */}
      {highlights.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-3">
          {highlights.map((h) => {
            const a = tierAccent(h.accent);
            return (
              <div key={h.eyebrow} className="rounded-xl border border-border bg-card p-4">
                <div className={`flex items-center gap-1.5 text-xs font-medium ${a.text}`}>
                  <TrendingUp className="h-3.5 w-3.5" /> {h.eyebrow}
                </div>
                <p className="mt-2 text-sm font-semibold">{h.title}</p>
                <p className="text-sm font-bold">{h.value}</p>
                <p className="mt-1 text-xs text-muted-foreground">{h.body}</p>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default CompensationMatrix;
