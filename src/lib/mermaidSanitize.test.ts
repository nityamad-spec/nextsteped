import { describe, it, expect } from "vitest";
import { sanitizeMermaid, quoteMermaidLabels } from "./mermaidSanitize";

describe("quoteMermaidLabels", () => {
  it("quotes labels containing parentheses and commas", () => {
    expect(quoteMermaidLabels("C[Generated Content (Text, Image, etc.)]")).toBe(
      'C["Generated Content (Text, Image, etc.)"]'
    );
  });

  it("leaves plain labels untouched", () => {
    expect(quoteMermaidLabels("A[Input] --> B[Encoder]")).toBe("A[Input] --> B[Encoder]");
  });

  it("leaves already-quoted labels untouched", () => {
    expect(quoteMermaidLabels('A["Input (raw)"]')).toBe('A["Input (raw)"]');
  });

  it("quotes both labels on an edge line", () => {
    expect(quoteMermaidLabels("A[User Goal, broad] --> B[Planner: reasoner]")).toBe(
      'A["User Goal, broad"] --> B["Planner: reasoner"]'
    );
  });

  it("quotes edge labels", () => {
    expect(quoteMermaidLabels("A -->|yes, always| B")).toBe('A -->|"yes, always"| B');
  });

  it("handles round and rhombus shapes", () => {
    expect(quoteMermaidLabels("A(Model (LLM)) --> B{Done, yet?}")).toBe(
      'A("Model (LLM)") --> B{"Done, yet?"}'
    );
  });
});

describe("sanitizeMermaid", () => {
  it("strips classDef/style lines and repairs labels", () => {
    const src = [
      "flowchart LR",
      "  classDef blue fill:#00f",
      "  A[Prompt] --> B[Output (Text, Image)]:::blue",
    ].join("\n");
    expect(sanitizeMermaid(src)).toBe(
      'flowchart LR\n  A[Prompt] --> B["Output (Text, Image)"]'
    );
  });
});
