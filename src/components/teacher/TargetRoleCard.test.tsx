import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state: { role: string | null; updates: any[] } = { role: null, updates: [] };

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: { target_role: state.role }, error: null }),
        }),
      }),
      update: (patch: any) => ({
        eq: async () => {
          state.updates.push(patch);
          return { error: null };
        },
      }),
    }),
  },
}));

vi.mock("@/hooks/use-toast", () => ({ toast: vi.fn() }));

import TargetRoleCard from "./TargetRoleCard";

beforeEach(() => {
  state.role = null;
  state.updates = [];
});
afterEach(cleanup);

const openMenu = async () => {
  const trigger = await screen.findByLabelText("Target role");
  // Radix Select opens on pointer-down with a primary button.
  fireEvent.pointerDown(trigger, { button: 0, ctrlKey: false, pointerType: "mouse" });
  fireEvent.keyDown(trigger, { key: "Enter" });
};

describe("TargetRoleCard", () => {
  it("saves a preset role without confirmation when none is set", async () => {
    render(<TargetRoleCard courseId="c1" />);
    await screen.findByText(/No role picked yet/i);

    await openMenu();
    fireEvent.click(await screen.findByText("Data Scientist"));
    fireEvent.click(screen.getByRole("button", { name: "Save role" }));

    await waitFor(() => expect(state.updates).toEqual([{ target_role: "Data Scientist" }]));
  });

  it("saves a custom role typed under Other", async () => {
    render(<TargetRoleCard courseId="c1" />);
    await screen.findByText(/No role picked yet/i);

    await openMenu();
    fireEvent.click(await screen.findByText("Other role…"));
    fireEvent.change(screen.getByLabelText("Custom role name"), {
      target: { value: "Applied Research Engineer" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save role" }));

    await waitFor(() =>
      expect(state.updates).toEqual([{ target_role: "Applied Research Engineer" }])
    );
  });

  it("asks for confirmation before replacing an existing role", async () => {
    state.role = "AI Engineer";
    render(<TargetRoleCard courseId="c1" />);
    await screen.findByText(/Students currently see/i);

    await openMenu();
    fireEvent.click(await screen.findByText("Data Analyst"));
    fireEvent.click(screen.getByRole("button", { name: "Save role" }));

    expect(await screen.findByText("Change the target role?")).toBeInTheDocument();
    expect(state.updates).toEqual([]);

    fireEvent.click(screen.getByRole("button", { name: "Change role" }));
    await waitFor(() => expect(state.updates).toEqual([{ target_role: "Data Analyst" }]));
  });
});
