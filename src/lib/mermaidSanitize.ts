// Sanitizing / repairing AI-authored Mermaid source before it hits mermaid.parse.
// The most common breakage is unquoted node labels that contain parentheses or
// commas, e.g. `C[Generated Content (Text, Image, etc.)]` — Mermaid's grammar
// rejects that, but `C["Generated Content (Text, Image, etc.)"]` parses fine.

const NEEDS_QUOTES = /[(),:&#<>]/;

/** Opener -> closer pairs, longest first so `([` wins over `(`. */
const SHAPES: [string, string][] = [
  ["([", "])"],
  ["[[", "]]"],
  ["[(", ")]"],
  ["{{", "}}"],
  ["((", "))"],
  ["[", "]"],
  ["(", ")"],
  ["{", "}"],
];

function quoteLabel(label: string): string {
  const trimmed = label.trim();
  if (!trimmed) return label;
  if (trimmed.startsWith('"') && trimmed.endsWith('"')) return label;
  if (!NEEDS_QUOTES.test(trimmed)) return label;
  return `"${trimmed.replace(/"/g, "#quot;")}"`;
}

/** True when a closer at `idx` plausibly terminates the label. */
function isTerminator(line: string, idx: number): boolean {
  const rest = line.slice(idx);
  return (
    rest.trim() === "" ||
    /^[\s;]/.test(rest) ||
    /^(-{2,}|-\.|={2,}|<-|~~)/.test(rest)
  );
}

/** Wrap node/edge labels in double quotes when they contain parser-hostile chars. */
export function quoteMermaidLabels(line: string): string {
  // Skip directives and comments.
  if (/^\s*(%%|classDef|style|linkStyle|click)/.test(line)) return line;

  let out = "";
  let i = 0;
  while (i < line.length) {
    // Edge labels: |text|
    if (line[i] === "|") {
      const end = line.indexOf("|", i + 1);
      if (end > i) {
        out += `|${quoteLabel(line.slice(i + 1, end))}|`;
        i = end + 1;
        continue;
      }
    }

    const shape = SHAPES.find((s) => line.startsWith(s[0], i));
    if (shape) {
      const [open, close] = shape;
      let search = i + open.length;
      let closeIdx = -1;
      while (search < line.length) {
        const found = line.indexOf(close, search);
        if (found === -1) break;
        if (isTerminator(line, found + close.length)) {
          closeIdx = found;
          break;
        }
        search = found + 1;
      }
      if (closeIdx === -1) {
        // No plausible terminator — fall back to the last closer on the line.
        closeIdx = line.lastIndexOf(close);
      }
      if (closeIdx > i) {
        out += open + quoteLabel(line.slice(i + open.length, closeIdx)) + close;
        i = closeIdx + close.length;
        continue;
      }
    }

    out += line[i];
    i += 1;
  }
  return out;
}

export function sanitizeMermaid(input: string): string {
  let src = input.trim();
  src = src.replace(/%%\{[\s\S]*?\}%%/g, "");
  src = src.replace(/^\s*%%.*$/gm, "");
  const lines = src.split("\n").filter((raw) => {
    const l = raw.trim();
    if (!l) return true;
    if (/^(classDef|style|linkStyle)\b/i.test(l)) return false;
    return true;
  });
  return lines
    .map((l) => quoteMermaidLabels(l.replace(/:::[A-Za-z_][\w-]*/g, "")))
    .join("\n")
    .trim();
}
