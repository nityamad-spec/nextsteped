import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import CareerReadinessStepper from "./CareerReadinessStepper";

describe("CareerReadinessStepper", () => {
  it("blocks Practice while the STAR story requirement is incomplete", () => {
    const onSelect = vi.fn();
    render(
      <CareerReadinessStepper
        active="prepare"
        onSelect={onSelect}
        practiceLocked
      />,
    );

    const practice = screen.getByRole("button", {
      name: "Practice locked until five STAR stories are saved",
    });
    expect(practice).toBeDisabled();
    fireEvent.click(practice);
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("allows Practice after the requirement is met", () => {
    const onSelect = vi.fn();
    render(
      <CareerReadinessStepper active="prepare" onSelect={onSelect} />,
    );

    fireEvent.click(screen.getByRole("button", { name: /Practice/i }));
    expect(onSelect).toHaveBeenCalledWith("practice");
  });
});