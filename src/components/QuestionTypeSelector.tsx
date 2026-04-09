import { Badge } from "@/components/ui/badge";

const ALL_TYPES = [
  { key: "mcq", label: "MCQ" },
  { key: "true_false", label: "True / False" },
  { key: "short_answer", label: "Short Answer" },
  { key: "problem_solving", label: "Problem Solving" },
] as const;

interface QuestionTypeSelectorProps {
  /** Comma-separated string of selected type keys, or legacy preset like "mixed", "mcq_only" */
  value: string;
  onChange: (value: string) => void;
}

/** Normalise legacy presets into explicit key arrays */
const parseValue = (v: string): string[] => {
  if (!v || v === "mixed") return ALL_TYPES.map(t => t.key);
  // Legacy single-type presets
  const legacy: Record<string, string[]> = {
    mcq_only: ["mcq"],
    true_false_only: ["true_false"],
    short_answer: ["short_answer"],
    problem_solving: ["problem_solving"],
    mcq_short: ["mcq", "short_answer"],
    mcq_problem: ["mcq", "problem_solving"],
  };
  if (legacy[v]) return legacy[v];
  // Already comma-separated
  return v.split(",").filter(Boolean);
};

const QuestionTypeSelector = ({ value, onChange }: QuestionTypeSelectorProps) => {
  const selected = parseValue(value);

  const toggle = (key: string) => {
    let next: string[];
    if (selected.includes(key)) {
      next = selected.filter(k => k !== key);
      if (next.length === 0) return; // Must keep at least one
    } else {
      next = [...selected, key];
    }
    onChange(next.join(","));
  };

  return (
    <div className="flex flex-wrap gap-2">
      {ALL_TYPES.map(t => {
        const isActive = selected.includes(t.key);
        return (
          <button
            key={t.key}
            type="button"
            onClick={() => toggle(t.key)}
            className={`rounded-full px-3 py-1.5 text-xs font-medium border transition-colors ${
              isActive
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-background border-border text-muted-foreground hover:bg-muted"
            }`}
          >
            {t.label}
          </button>
        );
      })}
    </div>
  );
};

/** Convert stored value to array of internal type keys for filtering */
export const parseQuestionMix = (v: string): string[] => parseValue(v);

export default QuestionTypeSelector;
