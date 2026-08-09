/**
 * Question format mix (MCQ / Short Answer / True-False) for a testing format.
 *
 * Percentages are always multiples of 10 and always sum to 100. Stored per
 * course in `course_ta_settings.<format>_type_counts` as a JSONB object.
 *
 * NOTE: `supabase/functions/_shared/question-mix.ts` mirrors the allocation
 * logic for edge functions (they cannot import from `src/`). Change together.
 */

export type QuestionFormatKey = "mcq" | "short_answer" | "true_false";

export type QuestionMix = Record<QuestionFormatKey, number>;

export const MIX_STEP = 10;

export const FORMAT_ORDER: QuestionFormatKey[] = ["mcq", "short_answer", "true_false"];

export const FORMAT_LABEL: Record<QuestionFormatKey, string> = {
  mcq: "Multiple Choice",
  short_answer: "Short Answer",
  true_false: "True / False",
};

/** Default diagnostic mix: 40% MCQ, 40% short answer, 20% true/false. */
export const DEFAULT_DIAGNOSTIC_MIX: QuestionMix = {
  mcq: 40,
  short_answer: 40,
  true_false: 20,
};

/** Coerce arbitrary JSON into a valid mix, falling back to `fallback`. */
export function normalizeMix(
  raw: unknown,
  fallback: QuestionMix = DEFAULT_DIAGNOSTIC_MIX,
): QuestionMix {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { ...fallback };
  const obj = raw as Record<string, unknown>;
  const out = {} as QuestionMix;
  let sum = 0;
  for (const key of FORMAT_ORDER) {
    const n = Number(obj[key]);
    if (!Number.isFinite(n) || n < 0 || n > 100 || n % MIX_STEP !== 0) return { ...fallback };
    out[key] = n;
    sum += n;
  }
  return sum === 100 ? out : { ...fallback };
}

/**
 * Move `delta` (±10) onto `key`, taking it from (or giving it to) the largest
 * other bucket so the mix always stays valid.
 */
export function adjustMix(mix: QuestionMix, key: QuestionFormatKey, delta: number): QuestionMix {
  const next = { ...mix };
  const target = next[key] + delta;
  if (target < 0 || target > 100) return mix;

  const others = FORMAT_ORDER.filter((k) => k !== key);
  if (delta > 0) {
    // Take from the largest other bucket that can afford it.
    const donor = others
      .filter((k) => next[k] >= delta)
      .sort((a, b) => next[b] - next[a])[0];
    if (!donor) return mix;
    next[donor] -= delta;
  } else {
    // Give back to the largest other bucket.
    const receiver = others.sort((a, b) => next[b] - next[a])[0];
    next[receiver] -= delta; // delta is negative
  }
  next[key] = target;
  return next;
}

/**
 * Split `total` questions across formats using the mix, with largest-remainder
 * rounding so the counts always add back up to `total`.
 */
export function allocateFormats(total: number, mix: QuestionMix): Record<QuestionFormatKey, number> {
  const safeTotal = Math.max(0, Math.round(total));
  const exact = FORMAT_ORDER.map((k) => ({ k, value: (safeTotal * mix[k]) / 100 }));
  const counts = {} as Record<QuestionFormatKey, number>;
  let assigned = 0;
  for (const { k, value } of exact) {
    counts[k] = Math.floor(value);
    assigned += counts[k];
  }
  const remainders = exact
    .map(({ k, value }) => ({ k, rem: value - Math.floor(value) }))
    .sort((a, b) => b.rem - a.rem);
  let i = 0;
  while (assigned < safeTotal && remainders.length > 0) {
    counts[remainders[i % remainders.length].k] += 1;
    assigned += 1;
    i += 1;
  }
  return counts;
}
