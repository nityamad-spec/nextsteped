import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import CareerReadinessStepper from "./CareerReadinessStepper";

describe("CareerReadinessStepper", () => {
  it("keeps Practice available without a STAR story requirement", () => {
    const onSelect = vi.fn();
    render(
      <CareerReadinessStepper
        active="prepare"
        onSelect={onSelect}
      />,
    );

    const practice = screen.getByRole("button", { name: /Practice/i });
    expect(practice).toBeEnabled();
    fireEvent.click(practice);
    expect(onSelect).toHaveBeenCalledWith("practice");
  });
});