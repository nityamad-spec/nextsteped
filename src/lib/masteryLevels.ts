export type MasteryLevel = "not_explored" | "beginner" | "developing" | "proficient" | "expert";

/** score is 0..1 */
export const getMasteryLevel = (attempted: number, score: number): MasteryLevel => {
  if (attempted === 0) return "not_explored";
  if (score <= 0.25) return "beginner";
  if (score <= 0.5) return "developing";
  if (score <= 0.75) return "proficient";
  return "expert";
};

export const MASTERY_LABEL: Record<MasteryLevel, string> = {
  not_explored: "Not explored",
  beginner: "Beginner",
  developing: "Developing",
  proficient: "Proficient",
  expert: "Expert",
};

export const MASTERY_TILE_CLASS: Record<MasteryLevel, string> = {
  not_explored: "bg-background border text-muted-foreground",
  beginner: "bg-destructive/15 text-foreground border border-destructive/30",
  developing: "bg-amber-500/15 text-foreground border border-amber-500/30",
  proficient: "bg-primary/25 text-foreground",
  expert: "bg-primary text-primary-foreground",
};

export const MASTERY_SWATCH_CLASS: Record<MasteryLevel, string> = {
  not_explored: "bg-background border",
  beginner: "bg-destructive/30",
  developing: "bg-amber-500/40",
  proficient: "bg-primary/25",
  expert: "bg-primary",
};
