/**
 * Fresh-grad compensation matrix (India, LPA).
 * Roles are rows, company tiers are columns, each cell holds a pay range.
 */

export interface CompTier {
  id: string;
  key: string;
  label: string;
  examples: string | null;
  accent: string;
  position: number;
}

export interface CompRole {
  id: string;
  title: string;
  blurb: string | null;
  active: boolean;
  position: number;
}

export interface CompCell {
  id: string;
  role_id: string;
  tier_id: string;
  low_lpa: number | null;
  high_lpa: number | null;
  mid_lpa: number | null;
  base_note: string | null;
  bonus_note: string | null;
  equity_note: string | null;
  note: string | null;
  not_typical: boolean;
  is_manual: boolean;
  sources: string | null;
  updated_at: string;
}

export interface CompRefreshRun {
  id: string;
  started_at: string;
  finished_at: string | null;
  status: string;
  model: string | null;
  sources: string | null;
  message: string | null;
  cells_updated: number;
}

/** Shared scale so bars are comparable across every cell. */
export const SCALE_MAX_LPA = 100;

export function scalePercent(value: number | null): number {
  if (value === null || value === undefined) return 0;
  return Math.max(0, Math.min(100, (value / SCALE_MAX_LPA) * 100));
}

export function formatLpa(value: number | null): string {
  if (value === null || value === undefined) return "—";
  const rounded = Math.round(value * 10) / 10;
  return Number.isInteger(rounded) ? `${rounded}` : rounded.toFixed(1);
}

export function formatRange(cell: CompCell | undefined): string {
  if (!cell || cell.not_typical || cell.low_lpa === null || cell.high_lpa === null) return "—";
  return `₹${formatLpa(cell.low_lpa)}–${formatLpa(cell.high_lpa)} LPA`;
}

/** Tailwind classes per tier accent, kept light for the NextStep aesthetic. */
export function tierAccent(accent: string): { bar: string; chip: string; text: string } {
  switch (accent) {
    case "amber":
      return {
        bar: "bg-amber-500",
        chip: "bg-amber-50 text-amber-700 border-amber-200",
        text: "text-amber-700",
      };
    case "violet":
      return {
        bar: "bg-violet-500",
        chip: "bg-violet-50 text-violet-700 border-violet-200",
        text: "text-violet-700",
      };
    default:
      return {
        bar: "bg-emerald-500",
        chip: "bg-emerald-50 text-emerald-700 border-emerald-200",
        text: "text-emerald-700",
      };
  }
}

export function cellFor(
  cells: CompCell[],
  roleId: string,
  tierId: string,
): CompCell | undefined {
  return cells.find((c) => c.role_id === roleId && c.tier_id === tierId);
}

export interface Highlight {
  eyebrow: string;
  title: string;
  value: string;
  body: string;
  accent: string;
}

/** Derive the three summary cards from the live matrix instead of hardcoding them. */
export function buildHighlights(
  roles: CompRole[],
  tiers: CompTier[],
  cells: CompCell[],
): Highlight[] {
  const usable = cells.filter((c) => !c.not_typical && c.high_lpa !== null);
  if (usable.length === 0) return [];

  const roleName = (id: string) => roles.find((r) => r.id === id)?.title ?? "";
  const tierName = (id: string) => tiers.find((t) => t.id === id)?.label ?? "";
  const tierAccentOf = (id: string) => tiers.find((t) => t.id === id)?.accent ?? "emerald";

  const ceiling = [...usable].sort((a, b) => (b.high_lpa ?? 0) - (a.high_lpa ?? 0))[0];

  const tier1 = tiers.find((t) => t.key === "tier_1");
  const balancePool = tier1 ? usable.filter((c) => c.tier_id === tier1.id) : usable;
  const balance =
    [...balancePool].sort((a, b) => (b.mid_lpa ?? 0) - (a.mid_lpa ?? 0))[
      Math.min(1, balancePool.length - 1)
    ] ?? ceiling;

  const startupTier = tiers.find((t) => t.key === "startup");
  const startupPool = startupTier ? usable.filter((c) => c.tier_id === startupTier.id) : [];
  const fastStart = [...startupPool].sort((a, b) => (b.high_lpa ?? 0) - (a.high_lpa ?? 0))[0];

  const out: Highlight[] = [
    {
      eyebrow: "Highest ceiling",
      title: roleName(ceiling.role_id),
      value: formatRange(ceiling),
      body: `${tierName(ceiling.tier_id)} · ${ceiling.note ?? "Top of the table for fresh grads."}`,
      accent: tierAccentOf(ceiling.tier_id),
    },
    {
      eyebrow: "Best balance",
      title: `${roleName(balance.role_id)} @ ${tierName(balance.tier_id)}`,
      value: formatRange(balance),
      body: balance.note ?? "Strong pay with a steady growth path.",
      accent: tierAccentOf(balance.tier_id),
    },
  ];

  if (fastStart) {
    out.push({
      eyebrow: "Fast start",
      title: `${roleName(fastStart.role_id)} + equity`,
      value: formatRange(fastStart),
      body: fastStart.equity_note ?? "More responsibility earlier, bigger equity upside.",
      accent: tierAccentOf(fastStart.tier_id),
    });
  }
  return out;
}
