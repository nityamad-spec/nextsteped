import { useEffect, useId, useRef, useState } from "react";
import mermaid from "mermaid";
import { sanitizeMermaid } from "@/lib/mermaidSanitize";

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
const EDGE_RE = /-->|---|==>|-\.->|<--|->>|-->>/;
// Rough node-id matcher: identifiers optionally followed by [..] (..) {..} etc.
const NODE_ID_RE = /\b([A-Za-z_][\w-]*)\s*(?:\[|\(|\{|>|\/)/g;


function hasEnoughStructure(source: string): boolean {
  const body = source.split("\n").slice(1).join("\n");
  if (!EDGE_RE.test(body)) return false;
  const ids = new Set<string>();
  let m: RegExpExecArray | null;
  const re = new RegExp(NODE_ID_RE.source, "g");
  while ((m = re.exec(body)) !== null) ids.add(m[1]);
  // Also count bare tokens on either side of edges (e.g. `A --> B`)
  const edgeTokens = body.match(/\b[A-Za-z_][\w-]*\b/g) || [];
  edgeTokens.forEach((t) => ids.add(t));
  return ids.size >= 2;
}

interface Props {
  code: string;
}

export default function MermaidDiagram({ code }: Props) {
  const rawId = useId();
  const domId = `mermaid-${rawId.replace(/[^a-zA-Z0-9]/g, "")}`;
  const containerRef = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setReady(false);
    setFailed(false);
    const source = sanitizeMermaid(code);
    if (!source || !ALLOWED.test(source) || !hasEnoughStructure(source)) {
      setFailed(true);
      return;
    }
    ensureInit();

    (async () => {
      try {
        await mermaid.parse(source);
        const { svg } = await mermaid.render(domId, source);
        if (cancelled || !containerRef.current) return;
        containerRef.current.innerHTML = svg;

        // Post-render size guard: if the SVG has no meaningful dimensions,
        // hide the container so we don't paint an empty dark bar.
        try {
          const svgEl = containerRef.current.querySelector("svg") as SVGSVGElement | null;
          if (svgEl) {
            let w = 0, h = 0;
            try {
              const bb = svgEl.getBBox();
              w = bb.width; h = bb.height;
            } catch {
              const vb = svgEl.viewBox?.baseVal;
              if (vb) { w = vb.width; h = vb.height; }
            }
            if (w < 40 || h < 20) {
              setFailed(true);
              return;
            }
          }
          setReady(true);
        } catch {
          // Measurement failed — assume render is fine.
          setReady(true);
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

  // Render failed: show the source instead of an empty container so the answer
  // never contains a blank dark strip.
  if (failed) {
    return (
      <pre className="my-3 w-full overflow-x-auto rounded-md border border-border bg-muted p-3 text-xs text-muted-foreground">
        <code>{code.trim()}</code>
      </pre>
    );
  }

  return (
    <div
      ref={containerRef}
      className={
        ready
          ? "my-3 w-full overflow-x-auto rounded-md border border-border bg-background p-3 [&_svg]:h-auto [&_svg]:mx-auto"
          : "my-3 w-full overflow-x-auto [&_svg]:h-auto [&_svg]:mx-auto"
      }
    />
  );
}
