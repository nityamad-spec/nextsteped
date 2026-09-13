import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import MockInterviewLab from "./MockInterviewLab";

afterEach(cleanup);

describe("MockInterviewLab overview", () => {
  it("shows the total completed count out of 40 and per-type progress", () => {
    render(<MockInterviewLab />);

    expect(screen.getByText("Total completed")).toBeInTheDocument();
    expect(screen.getByText("/40")).toBeInTheDocument();
    expect(screen.getAllByText("1/8").length).toBeGreaterThan(0);
    expect(screen.getAllByText("0/8").length).toBeGreaterThan(0);
    expect(
      screen.getByText(/Aim for 8–10 mocks on each interview type before onsites/i)
    ).toBeInTheDocument();
  });

  it("returns to the mock lab from a ready screen", () => {
    render(<MockInterviewLab />);
    fireEvent.click(screen.getByRole("button", { name: /^\1/ }));
    fireEvent.click(screen.getByRole("button", { name: "Back" }));

    expect(screen.getByText("Mock interview lab")).toBeInTheDocument();
  });
});

describe("MockInterviewLab behavioural session", () => {
  it("starts the live behavioural screen with tailored prompt and checklist", () => {
    render(<MockInterviewLab />);
    fireEvent.click(screen.getByRole("button", { name: /^\1/ }));
    fireEvent.click(screen.getByRole("button", { name: "Start timer" }));

    expect(screen.getByText("Behavioural · Live")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", {
        name: /Tell me about a time you disagreed with a teammate/i,
      })
    ).toBeInTheDocument();
    expect(screen.getByText(/Follow STAR strictly/i)).toBeInTheDocument();
    expect(screen.getByText("Set the situation in two sentences or less")).toBeInTheDocument();
    expect(screen.getByText(/of 30:00/i)).toBeInTheDocument();
  });
});

describe("MockInterviewLab agent design session", () => {
  it("starts the live agent design screen with tailored prompt and checklist", () => {
    render(<MockInterviewLab />);
    fireEvent.click(screen.getByRole("button", { name: /^\1/ }));
    fireEvent.click(screen.getByRole("button", { name: "Start timer" }));

    expect(screen.getByText("Agent Design · Live")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", {
        name: /Design an agent that books flights end-to-end/i,
      })
    ).toBeInTheDocument();
    expect(screen.getByText(/error recovery mid-booking/i)).toBeInTheDocument();
    expect(screen.getByText("Outline the planning loop and when it stops")).toBeInTheDocument();
    expect(screen.getByText(/of 60:00/i)).toBeInTheDocument();
  });
});

describe("MockInterviewLab ML depth session", () => {
  it("starts the live ML depth screen with tailored prompt and checklist", () => {
    render(<MockInterviewLab />);
    fireEvent.click(screen.getByRole("button", { name: /^\1/ }));
    expect(screen.getByText("ML Depth mock · 45 min")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Start timer" }));

    expect(screen.getByText("ML Depth · Live")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", {
        name: /Design a fraud detection system for a payments company/i,
      })
    ).toBeInTheDocument();
    expect(screen.getByText(/class imbalance, serving latency, drift monitoring/i)).toBeInTheDocument();
    expect(screen.getByText("Define the prediction target and label strategy")).toBeInTheDocument();
    expect(screen.getByText(/of 45:00/i)).toBeInTheDocument();
  });
});

describe("MockInterviewLab system design session", () => {
  it("opens the system design ready screen with an enabled Start timer", () => {
    render(<MockInterviewLab />);

    fireEvent.click(screen.getByRole("button", { name: /^\1/ }));

    expect(screen.getByText("System design mock · 60 min")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Ready?" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Start timer" })).toBeEnabled();
  });

  it("starts the live system design screen with tailored prompt and checklist", () => {
    render(<MockInterviewLab />);
    fireEvent.click(screen.getByRole("button", { name: /^\1/ }));
    fireEvent.click(screen.getByRole("button", { name: "Start timer" }));

    expect(screen.getByText("System design · Live")).toBeInTheDocument();
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
    fireEvent.click(screen.getByRole("button", { name: /^\1/ }));
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
