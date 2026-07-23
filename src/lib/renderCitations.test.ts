import { describe, it, expect } from "vitest";
import { renderCitations } from "./renderCitations";
import type { RagSource } from "@/types";

const sources: RagSource[] = [
  { n: 1, file_name: "biology.pdf", label: "biology, p.12-13" },
  { n: 2, file_name: "published-plan.json", label: "Lesson Plan — Week 3" },
];

describe("renderCitations", () => {
  it("returns empty for empty input", () => {
    expect(renderCitations("", sources)).toEqual({ content: "", footnotes: [] });
  });

  it("passes text without tokens through unchanged", () => {
    const r = renderCitations("Hello world.", sources);
    expect(r.content).toBe("Hello world.");
    expect(r.footnotes).toEqual([]);
  });

  it("maps numeric [[n]] tokens to superscripts using sources labels", () => {
    const r = renderCitations("Chloroplasts capture light [[1]]. See week [[2]].", sources);
    expect(r.content).toBe(
      "Chloroplasts capture light <sup>[1]</sup>. See week <sup>[2]</sup>.",
    );
    expect(r.footnotes).toEqual([
      { n: 1, label: "biology, p.12-13" },
      { n: 2, label: "Lesson Plan — Week 3" },
    ]);
  });

  it("deduplicates repeated citations to the same source", () => {
    const r = renderCitations("A [[1]] and again [[1]].", sources);
    expect(r.content).toBe("A <sup>[1]</sup> and again <sup>[1]</sup>.");
    expect(r.footnotes).toHaveLength(1);
  });

  it("handles legacy [[published-plan.json #1]] tokens without sources", () => {
    const r = renderCitations(
      "Concepts covered [[published-plan.json #1]] and [[published-plan.json #11]].",
      undefined,
    );
    expect(r.content).toBe(
      "Concepts covered <sup>[1]</sup> and <sup>[2]</sup>.",
    );
    expect(r.footnotes).toEqual([
      { n: 1, label: "Lesson Plan — Week 1" },
      { n: 2, label: "Lesson Plan — Week 11" },
    ]);
  });

  it("handles legacy single-bracket [file #N] tokens", () => {
    const r = renderCitations("See [biology.pdf #4] here.", undefined);
    expect(r.content).toBe("See <sup>[1]</sup> here.");
    expect(r.footnotes).toEqual([{ n: 1, label: "biology #4" }]);
  });

  it("does not touch NEEDS_FALLBACK / GENERAL_KNOWLEDGE sentinels", () => {
    const r = renderCitations("[[NEEDS_FALLBACK]] [[GENERAL_KNOWLEDGE]]", undefined);
    expect(r.content).toBe("[[NEEDS_FALLBACK]] [[GENERAL_KNOWLEDGE]]");
    expect(r.footnotes).toEqual([]);
  });
});
