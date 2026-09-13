import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import MockInterviewLab from "./MockInterviewLab";

afterEach(cleanup);

describe("MockInterviewLab ready screens", () => {
  const mockTypes = [
    { title: "System Design", label: "System Design mock · 60 min" },
    { title: "ML Depth", label: "ML Depth mock · 45 min" },
    { title: "Behavioural", label: "Behavioural mock · 30 min" },
    { title: "Agent Design", label: "Agent Design mock · 60 min" },
  ];

  it.each(mockTypes)("opens the tailored $title ready screen", ({ title, label }) => {
    render(<MockInterviewLab />);

    fireEvent.click(screen.getByRole("button", { name: new RegExp(title, "i") }));

    expect(screen.getByText(label)).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Ready?" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Start timer" })).toBeDisabled();
  });

  it("returns to the mock lab from a ready screen", () => {
    render(<MockInterviewLab />);
    fireEvent.click(screen.getByRole("button", { name: /System Design/i }));
    fireEvent.click(screen.getByRole("button", { name: "Back" }));

    expect(screen.getByText("Mock interview lab")).toBeInTheDocument();
  });
});