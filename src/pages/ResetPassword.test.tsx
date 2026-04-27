import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

// ── Mocks ────────────────────────────────────────────────────────────────
const navigateMock = vi.fn();
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return { ...actual, useNavigate: () => navigateMock };
});

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

// Build a chainable query mock that resolves to a single row.
const makePendingQuery = (row: { id: string } | null) => ({
  select: vi.fn().mockReturnThis(),
  eq: vi.fn().mockReturnThis(),
  is: vi.fn().mockReturnThis(),
  maybeSingle: vi.fn().mockResolvedValue({ data: row, error: null }),
});

const makeProfileQuery = (row: { needs_password_setup: boolean } | null) => ({
  select: vi.fn().mockReturnThis(),
  eq: vi.fn().mockReturnThis(),
  maybeSingle: vi.fn().mockResolvedValue({ data: row, error: null }),
  update: vi.fn().mockReturnValue({
    eq: vi.fn().mockResolvedValue({ data: null, error: null }),
  }),
});

const supabaseState = {
  user: { id: "user-1", email: "" } as { id: string; email: string },
  pendingRow: null as { id: string } | null,
  profileRow: null as { needs_password_setup: boolean } | null,
  invokeResult: { data: { course_id: "course-123" }, error: null } as {
    data: any;
    error: any;
  },
  updateUser: vi.fn().mockResolvedValue({ data: {}, error: null }),
};

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: {
      onAuthStateChange: (cb: any) => {
        // Simulate the SIGNED_IN event so the page detects invite mode.
        setTimeout(() => {
          cb("SIGNED_IN", { user: supabaseState.user });
        }, 0);
        return { data: { subscription: { unsubscribe: vi.fn() } } };
      },
      getSession: () =>
        Promise.resolve({ data: { session: { user: supabaseState.user } }, error: null }),
      getUser: () =>
        Promise.resolve({ data: { user: supabaseState.user }, error: null }),
      updateUser: (...args: any[]) => supabaseState.updateUser(...args),
    },
    from: (table: string) => {
      if (table === "pending_signups") return makePendingQuery(supabaseState.pendingRow);
      if (table === "profiles") return makeProfileQuery(supabaseState.profileRow);
      throw new Error(`Unexpected table: ${table}`);
    },
    functions: {
      invoke: vi.fn(async () => supabaseState.invokeResult),
    },
  },
}));

// Import AFTER mocks are registered.
import ResetPassword from "./ResetPassword";

// ── Helpers ──────────────────────────────────────────────────────────────
const renderPage = () =>
  render(
    <MemoryRouter>
      <ResetPassword />
    </MemoryRouter>,
  );

const submitWithPassword = async (pwd: string) => {
  const inputs = await screen.findAllByPlaceholderText("••••••••");
  fireEvent.change(inputs[0], { target: { value: pwd } });
  fireEvent.change(inputs[1], { target: { value: pwd } });
  const button = await screen.findByRole("button", { name: /Set Password & Continue/i });
  await waitFor(() => expect(button).not.toBeDisabled());
  fireEvent.click(button);
};

beforeEach(() => {
  navigateMock.mockReset();
  supabaseState.updateUser.mockClear();
  supabaseState.updateUser.mockResolvedValue({ data: {}, error: null });
  supabaseState.pendingRow = null;
  supabaseState.profileRow = null;
  supabaseState.user = { id: "user-1", email: "" };
});

// ── Tests ────────────────────────────────────────────────────────────────
describe("ResetPassword (invite flow)", () => {
  it("teacher invite: updates password and navigates to /teacher", async () => {
    supabaseState.user = { id: "teacher-1", email: "prof@example.com" };
    supabaseState.profileRow = { needs_password_setup: true };

    renderPage();
    await submitWithPassword("newPass123");

    await waitFor(() => {
      expect(supabaseState.updateUser).toHaveBeenCalledWith({ password: "newPass123" });
      expect(navigateMock).toHaveBeenCalledWith("/teacher");
    });
  });

  it("student invite: completes signup and navigates to diagnostic with course id", async () => {
    supabaseState.user = { id: "student-1", email: "stu@example.com" };
    supabaseState.pendingRow = { id: "pending-1" };
    supabaseState.invokeResult = { data: { course_id: "course-xyz" }, error: null };

    renderPage();
    await submitWithPassword("newPass123");

    await waitFor(() => {
      expect(supabaseState.updateUser).toHaveBeenCalledWith({ password: "newPass123" });
      expect(navigateMock).toHaveBeenCalledWith("/student/diagnostic?course=course-xyz");
    });
  });

  it("aborts and shows error when updateUser fails", async () => {
    const { toast } = await import("sonner");
    supabaseState.user = { id: "teacher-1", email: "prof@example.com" };
    supabaseState.profileRow = { needs_password_setup: true };
    supabaseState.updateUser.mockResolvedValueOnce({
      data: null,
      error: { message: "Password too weak" },
    });

    renderPage();
    await submitWithPassword("newPass123");

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith("Password too weak");
      expect(navigateMock).not.toHaveBeenCalled();
    });
  });
});
