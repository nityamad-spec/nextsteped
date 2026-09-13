import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import MockInterviewLab from "./MockInterviewLab";

afterEach(cleanup);

describe("MockInterviewLab ready screens", () => {
  const readyOnlyMockTypes = [
    { title: "ML Depth", label: "ML Depth mock · 45 min" },
    { title: "Behavioural", label: "Behavioural mock · 30 min" },
    { title: "Agent Design", label: "Agent Design mock · 60 min" },
  ];

  it.each(readyOnlyMockTypes)("opens the tailored $title ready screen", ({ title, label }) => {
    render(<MockInterviewLab />);

    fireEvent.click(screen.getByRole("button", { name: new RegExp(title, "i") }));

    expect(screen.getByText(label)).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Ready?" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Start timer" })).toBeDisabled();
  });

  it("returns to the mock lab from a ready screen", () => {
    render(<MockInterviewLab />);
    fireEvent.click(screen.getByRole("button", { name: /ML Depth/i }));
    fireEvent.click(screen.getByRole("button", { name: "Back" }));

    expect(screen.getByText("Mock interview lab")).toBeInTheDocument();
  });
});

describe("MockInterviewLab system design session", () => {
  it("opens the system design ready screen with an enabled Start timer", () => {
    render(<MockInterviewLab />);

    fireEvent.click(screen.getByRole("button", { name: /System Design/i }));

    expect(screen.getByText("System Design mock · 60 min")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Ready?" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Start timer" })).toBeEnabled();
  });

  it("starts the live system design screen with tailored prompt and checklist", () => {
    render(<MockInterviewLab />);
    fireEvent.click(screen.getByRole("button", { name: /System Design/i }));
    fireEvent.click(screen.getByRole("button", { name: "Start timer" }));

    expect(screen.getByText("System Design · Live")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", {
        name: /Design Swiggy's real-time delivery ETA system/i,
      })
    ).toBeInTheDocument();
    expect(screen.getByText(/data model, real-time ingestion/i)).toBeInTheDocument();
    expect(screen.getByText("Live coach")).toBeInTheDocument();
    expect(screen.getByText("Clarify requirements and scope")).toBeInTheDocument();
    expect(screen.getByText(/of 60:00/i)).toBeInTheDocument();
  });

  it("ends the session on the review screen and returns to the lab", () => {
    render(<MockInterviewLab />);
    fireEvent.click(screen.getByRole("button", { name: /System Design/i }));
    fireEvent.click(screen.getByRole("button", { name: "Start timer" }));
    fireEvent.click(screen.getByRole("button", { name: "End & review" }));

    expect(screen.getByText("System design mock · Review")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Session complete" })
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Back to mock lab" }));
    expect(screen.getByText("Mock interview lab")).toBeInTheDocument();
  });
});
