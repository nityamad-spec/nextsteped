import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
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
    { id: "r1", type: "article" as const, title: "Intro Article", description: "Read me", url: "https://example.com", concept: "Intro Concept" },
    { id: "r2", type: "coding-exercise" as const, title: "Try It", description: "Do it", concept: "Intro Concept" },
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

describe("UnitPathwayCard coding exercise steps", () => {
  const makeExercise = (id: string, title: string) => ({
    id,
    week_number: 1,
    position: 1,
    title,
    problem_statement: `Statement for ${title}`,
    language: "python",
    input_spec: "in",
    output_spec: "out",
    constraints: null,
    examples: [],
    starter_code: null,
    primary_language: null,
    standard_test_cases: [],
  });

  it("renders one step card per published exercise on coding/lab units", () => {
    render(
      <UnitPathwayCard
        {...baseProps}
        isCodingWeek
        exercises={[makeExercise("ex-1", "Build a parser"), makeExercise("ex-2", "Write tests")]}
      />,
    );
    expect(screen.getByText("Build a parser")).toBeInTheDocument();
    expect(screen.getByText("Write tests")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Open in terminal" })).toHaveLength(2);
    // Coding weeks have no quiz step.
    expect(screen.queryByText("Weekly Quiz")).not.toBeInTheDocument();
  });

  it("marks completed exercises as done with a reopen CTA", () => {
    render(
      <UnitPathwayCard
        {...baseProps}
        isCodingWeek
        exercises={[makeExercise("ex-1", "Build a parser"), makeExercise("ex-2", "Write tests")]}
        completedExerciseIds={new Set(["ex-1"])}
      />,
    );
    expect(screen.getByRole("button", { name: "Reopen in terminal" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Open in terminal" })).toBeInTheDocument();
    expect(screen.getByText(/^Completed\. /)).toBeInTheDocument();
  });

  it("calls onOpenExercise with the clicked exercise", () => {
    const onOpenExercise = vi.fn();
    const ex1 = makeExercise("ex-1", "Build a parser");
    const ex2 = makeExercise("ex-2", "Write tests");
    render(
      <UnitPathwayCard
        {...baseProps}
        isCodingWeek
        exercises={[ex1, ex2]}
        onOpenExercise={onOpenExercise}
      />,
    );
    fireEvent.click(screen.getAllByRole("button", { name: "Open in terminal" })[1]);
    expect(onOpenExercise).toHaveBeenCalledWith(ex2);
  });

  it("no longer renders the read-only coding exercises section", () => {
    render(
      <UnitPathwayCard
        {...baseProps}
        isCodingWeek
        exercises={[makeExercise("ex-1", "Build a parser")]}
      />,
    );
    expect(screen.queryByText(/published/i)).not.toBeInTheDocument();
    expect(screen.queryByText("Statement for Build a parser")).not.toBeInTheDocument();
  });

  it("does not render exercise step cards for non-coding units", () => {
    render(
      <UnitPathwayCard
        {...baseProps}
        exercises={[makeExercise("ex-1", "Build a parser")]}
      />,
    );
    expect(screen.queryByText("Build a parser")).not.toBeInTheDocument();
    expect(screen.getByText("Weekly Quiz")).toBeInTheDocument();
  });
});
