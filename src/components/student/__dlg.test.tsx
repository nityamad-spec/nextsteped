import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { TooltipProvider } from "@/components/ui/tooltip";
import ConceptMasteryDialog from "@/components/student/ConceptMasteryDialog";

describe("dlg", () => {
  it("renders", async () => {
    render(
      <TooltipProvider>
        <ConceptMasteryDialog open onOpenChange={() => {}} concepts={[{ id: "1", name: "Basic Data Types" }]} conceptMastery={{}} courseMastery={null} />
      </TooltipProvider>,
    );
    expect(await screen.findByText("Basic Data Types")).toBeInTheDocument();
  });
});
