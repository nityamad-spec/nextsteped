/**
 * Question format mix helpers for edge functions.
 *
 * Mirror of `src/lib/questionMix.ts` — edge functions cannot import from
 * `src/`. Change both together.
 */

export type QuestionFormatKey = "mcq" | "short_answer" | "true_false";
export type QuestionMix = Record<QuestionFormatKey, number>;

export const MIX_STEP = 10;
export const FORMAT_ORDER: QuestionFormatKey[] = ["mcq", "short_answer", "true_false"];

export const DEFAULT_DIAGNOSTIC_MIX: QuestionMix = {
  mcq: 40,
  short_answer: 40,
  true_false: 20,
};

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

export function allocateFormats(
  total: number,
  mix: QuestionMix,
): Record<QuestionFormatKey, number> {
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
