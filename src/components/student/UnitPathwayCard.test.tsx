import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import UnitPathwayCard from "./UnitPathwayCard";

const baseProps = {
  unitNumber: 1,
  topic: "Unit 1 Topic",
  totalUnits: 4,
  expanded: true,
  onToggle: vi.fn(),
  studied: false,
  practised: false,
  quizTaken: true,
  quizAvailable: true,
  quizLocked: false,
  readiness: 60,
  weakConcepts: [],
  resources: [],
  activityDone: {},
  onToggleActivity: vi.fn(),
  onStudy: vi.fn(),
  onPractice: vi.fn(),
  onTakeQuiz: vi.fn(),
};

describe("UnitPathwayCard concept Focus badge", () => {
  it("does not show Focus for expert-level concepts", () => {
    render(
      <UnitPathwayCard
        {...baseProps}
        concepts={[
          { name: "Expert Concept", mastery: 100, matched: true },
        ]}
      />,
    );
    expect(screen.getByText("Expert Concept")).toBeInTheDocument();
    expect(screen.queryByText("Focus")).not.toBeInTheDocument();
  });

  it("shows Focus for proficient, developing, and beginner concepts", () => {
    render(
      <UnitPathwayCard
        {...baseProps}
        concepts={[
          { name: "Proficient Concept", mastery: 75, matched: true },
          { name: "Developing Concept", mastery: 40, matched: true },
          { name: "Beginner Concept", mastery: 20, matched: true },
        ]}
      />,
    );
    const badges = screen.getAllByText("Focus");
    expect(badges).toHaveLength(3);
  });

  it("shows Focus for not-explored concepts", () => {
    render(
      <UnitPathwayCard
        {...baseProps}
        concepts={[
          { name: "Unattempted Concept", mastery: 0, matched: false },
        ]}
      />,
    );
    expect(screen.getByText("Focus")).toBeInTheDocument();
  });

  it("shows Focus regardless of whether the unit quiz has been taken", () => {
    const { rerender } = render(
      <UnitPathwayCard
        {...baseProps}
        quizTaken={false}
        concepts={[{ name: "Developing Concept", mastery: 40, matched: true }]}
      />,
    );
    expect(screen.getByText("Focus")).toBeInTheDocument();

    rerender(
      <UnitPathwayCard
        {...baseProps}
        quizTaken={true}
        concepts={[{ name: "Developing Concept", mastery: 40, matched: true }]}
      />,
    );
    expect(screen.getByText("Focus")).toBeInTheDocument();
  });
});

describe("UnitPathwayCard readings visibility", () => {
  const sampleResources = [
    { id: "r1", type: "article" as const, title: "Intro Article", description: "Read me", url: "https://example.com" },
    { id: "r2", type: "coding-exercise" as const, title: "Try It", description: "Do it" },
  ];

  it("shows Readings & exercises for teaching units with resources", () => {
    render(<UnitPathwayCard {...baseProps} resources={sampleResources} />);
    expect(screen.getByText(/Readings & exercises/i)).toBeInTheDocument();
  });

  it("hides Readings & exercises for coding/lab units even when resources exist", () => {
    render(<UnitPathwayCard {...baseProps} isCodingWeek resources={sampleResources} />);
    expect(screen.queryByText(/Readings & exercises/i)).not.toBeInTheDocument();
  });
});
