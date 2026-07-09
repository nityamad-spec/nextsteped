import { useEffect, useId, useRef, useState } from "react";
import mermaid from "mermaid";

let initialized = false;
function ensureInit() {
  if (initialized) return;
  mermaid.initialize({
    startOnLoad: false,
    securityLevel: "strict",
    theme: "default",
    fontFamily:
      'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
    themeVariables: { nodeSpacing: 40, rankSpacing: 50 },
    flowchart: { useMaxWidth: false, htmlLabels: true, padding: 8 },
    sequence: { useMaxWidth: false },
    class: { useMaxWidth: false },
    state: { useMaxWidth: false },
  });
  initialized = true;
}

const ALLOWED = /^(flowchart|graph|sequenceDiagram|classDiagram|stateDiagram(-v2)?)\b/;

// Strip styling directives an LLM may emit that render the diagram as an
// unreadable dark bar (dark fills with no contrasting text color, empty
// subgraphs, etc.). Keep only structural mermaid content on the default theme.
function sanitizeMermaid(input: string): string {
  let src = input.trim();
  src = src.replace(/%%\{[\s\S]*?\}%%/g, "");
  src = src.replace(/^\s*%%.*$/gm, "");
  const lines = src.split("\n").filter((raw) => {
    const l = raw.trim();
    if (!l) return true;
    if (/^(classDef|style|linkStyle)\b/i.test(l)) return false;
    return true;
  });
  return lines.map((l) => l.replace(/:::[A-Za-z_][\w-]*/g, "")).join("\n").trim();
}

interface Props {
  code: string;
}

export default function MermaidDiagram({ code }: Props) {
  const rawId = useId();
  const domId = `mermaid-${rawId.replace(/[^a-zA-Z0-9]/g, "")}`;
  const containerRef = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const source = sanitizeMermaid(code);
    if (!source || !ALLOWED.test(source)) {
      setFailed(true);
      return;
    }
    const body = source.split("\n").slice(1).join("\n");
    const hasEdge = /-->|---|==>|-\.->|<--|->>|-->>/.test(body);
    const nonEmptyLines = body.split("\n").map((l) => l.trim()).filter(Boolean);
    if (!hasEdge && nonEmptyLines.length < 2) {
      setFailed(true);
      return;
    }
    ensureInit();

    (async () => {
      try {
        await mermaid.parse(source);
        const { svg } = await mermaid.render(domId, source);
        if (!cancelled && containerRef.current) {
          containerRef.current.innerHTML = svg;
        }
      } catch (err) {
        if (!cancelled) {
          console.warn("[mermaid] render failed, hiding diagram:", err);
          setFailed(true);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [code, domId]);

  if (failed) return null;

  return (
    <div
      ref={containerRef}
      className="my-3 w-full overflow-x-auto rounded-md border border-border bg-background p-3 [&_svg]:h-auto [&_svg]:mx-auto"
    />
  );
}
