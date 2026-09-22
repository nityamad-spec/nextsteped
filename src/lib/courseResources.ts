/**
 * Shared types + helpers for the skilling-pathway Resources feature.
 * Global libraries (companies, compensation) are admin-managed; professors
 * pick entries per course via course_resource_picks.
 */

export type ResourceTier = "tier_1" | "mid_tier" | "startup";
export type ResourceKind = "company" | "compensation";

export interface ResourceCompany {
  id: string;
  name: string;
  description: string | null;
  tier: ResourceTier;
  roles: string[];
  pay_range: string | null;
  interview_format: string | null;
  focus_areas: string | null;
  dsa_difficulty: number | null;
  locations: string | null;
  apply_url: string | null;
  logo_color: string | null;
  about: string | null;
  rounds: string[];
  look_for: string | null;
  pro_tip: string | null;
  sources: string | null;
  position: number;
}

export interface ResourceCompensation {
  id: string;
  role_title: string;
  base_range: string | null;
  bonus_range: string | null;
  equity_range: string | null;
  total_range: string | null;
  notes: string | null;
  position: number;
}

export interface ResourceLinkRow {
  id: string;
  resource_type: ResourceKind;
  resource_id: string;
  label: string;
  url: string;
}

export interface ResourceFileRow {
  id: string;
  resource_type: ResourceKind;
  resource_id: string;
  file_name: string;
  storage_path: string;
}

export const TIER_LABELS: Record<ResourceTier, string> = {
  tier_1: "Tier-1",
  mid_tier: "Mid-tier",
  startup: "Startup",
};

export const TIER_FILTERS: { key: ResourceTier | "all"; label: string }[] = [
  { key: "all", label: "All" },
  { key: "tier_1", label: "Tier-1" },
  { key: "mid_tier", label: "Mid-tier" },
  { key: "startup", label: "Startup" },
];

/** Badge styling per tier. */
export function tierBadgeClass(tier: ResourceTier): string {
  switch (tier) {
    case "tier_1":
      return "border-success/30 bg-success/10 text-success";
    case "mid_tier":
      return "border-tier-mid-border bg-tier-mid text-tier-mid-foreground";
    case "startup":
      return "border-primary/30 bg-primary/10 text-primary";
  }
}

/** Colour choices for the letter tile on company cards (admin-picked). */
export const LOGO_COLORS = [
  "bg-blue-500",
  "bg-indigo-500",
  "bg-violet-500",
  "bg-purple-500",
  "bg-rose-500",
  "bg-red-500",
  "bg-orange-500",
  "bg-amber-500",
  "bg-yellow-500",
  "bg-emerald-500",
  "bg-teal-500",
  "bg-cyan-600",
  "bg-sky-500",
  "bg-neutral-700",
];

/** Human label for a 1–4 DSA difficulty rating (matches the matrix guide). */
export function difficultyLabel(value: number | null): string {
  if (value === null || value === undefined) return "—";
  if (value >= 4) return "Very Hard";
  if (value >= 3.5) return "Hard";
  if (value >= 3) return "Medium-Hard";
  if (value >= 2.5) return "Medium";
  if (value >= 2) return "Easy-Med";
  return "Easy";
}
