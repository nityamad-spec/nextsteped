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
    const source = code.trim();
    if (!source || !ALLOWED.test(source)) {
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
      className="my-3 w-full overflow-x-auto rounded-md border border-border bg-background p-3 [&_svg]:mx-auto [&_svg]:h-auto [&_svg]:max-w-full"
    />
  );
}
